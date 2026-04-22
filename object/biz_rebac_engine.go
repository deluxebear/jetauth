// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_engine.go is the entry point for OpenFGA-compatible Check
// evaluation against ReBAC tuples. The five rewrites (this, computed_userset,
// tuple_to_userset, union, intersection, difference) land in follow-up
// commits; this file defines the shared request/response shapes, the
// per-request context that carries memoisation across recursive branches,
// and the depth cap that keeps a pathological schema from exhausting the
// stack. Conditions / CEL evaluation belong to CP-4 (spec §6.5).

package object

import (
	"fmt"
	"strings"
	"sync"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
)

// maxResolutionDepth caps recursive evaluation at the OpenFGA reference
// default (spec §6.1). Hitting the cap returns an error rather than false so
// a miswritten schema with a real cycle can't masquerade as "no permission".
const maxResolutionDepth = 25

// TupleKey is the object-relation-user triple the engine reasons about.
// It intentionally does NOT embed openfgav1.TupleKey — exposing the proto
// struct leaks protobuf-message internals (MessageState, sizeCache, …) and
// would force protobuf JSON shape on HTTP responses. Conversion helpers live
// at the API edge when/if we need to speak the upstream wire form.
type TupleKey struct {
	Object   string `json:"object"`
	Relation string `json:"relation"`
	User     string `json:"user"`
}

// CheckRequest is the external input to ReBACCheck (spec §6.1).
type CheckRequest struct {
	StoreId              string
	AuthorizationModelId string
	TupleKey             TupleKey
	ContextualTuples     []TupleKey
	Context              map[string]any
}

// CheckResult is the external output of ReBACCheck (spec §6.1).
type CheckResult struct {
	Allowed    bool   `json:"allowed"`
	Resolution string `json:"resolution,omitempty"`
}

// checkContext carries everything recursive rewrite helpers need to share
// inside a single ReBACCheck call: the loaded store/model, the caller's
// contextual tuples, and a memo that collapses repeat sub-queries across
// sibling branches.
type checkContext struct {
	storeId        string
	model          *openfgav1.AuthorizationModel
	contextual     []TupleKey
	requestContext map[string]any
	memo           sync.Map // key: "object#relation@user" → bool
}

// parseStoreId splits "{owner}/{appName}" back into its two parts, the
// inverse of BuildStoreId (spec §4.3). Empty owner or appName is rejected
// so callers can't sneak a half-formed store id past the DB filter.
func parseStoreId(storeId string) (owner, appName string, err error) {
	parts := strings.SplitN(storeId, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("rebac: invalid storeId %q, expected \"owner/appName\"", storeId)
	}
	return parts[0], parts[1], nil
}

// resolveAuthorizationModel loads the authorization model proto for a Check
// request. When modelId is empty, it falls back to the app's
// CurrentAuthorizationModelId. Cross-store lookups (a modelId belonging to
// a different owner/appName) return "not found" rather than 403 so the API
// doesn't leak model existence across tenants (spec §7.2).
func resolveAuthorizationModel(storeId, modelId string) (*openfgav1.AuthorizationModel, error) {
	owner, appName, err := parseStoreId(storeId)
	if err != nil {
		return nil, err
	}

	if modelId == "" {
		config, err := getBizAppConfig(owner, appName)
		if err != nil {
			return nil, fmt.Errorf("rebac: lookup app config: %w", err)
		}
		if config == nil || config.CurrentAuthorizationModelId == "" {
			return nil, fmt.Errorf("rebac: app %s/%s has no authorization model", owner, appName)
		}
		modelId = config.CurrentAuthorizationModelId
	}

	m, err := GetBizAuthorizationModel(modelId)
	if err != nil {
		return nil, fmt.Errorf("rebac: load authorization model: %w", err)
	}
	// Both "row missing" and "row belongs to a different store" collapse to
	// the same "not found" error — preventing a caller from confirming that
	// some other tenant's model id exists.
	if m == nil || m.Owner != owner || m.AppName != appName {
		return nil, fmt.Errorf("rebac: authorization model %s not found", modelId)
	}

	proto, err := ParseSchemaJSON(m.SchemaJSON)
	if err != nil {
		return nil, fmt.Errorf("rebac: parse authorization model %s: %w", modelId, err)
	}
	return proto, nil
}

// memoKey is the canonical sync.Map key for a single (object, relation,
// user) tuple in a Check run. Derived form "object#relation@user" is the
// same shape OpenFGA reference uses for its resolution trace. CP-4 will
// append a |conditionHash segment when conditional tuples land — the key
// schema is versioned by segment count, not by a format string, so the
// extension is additive.
func memoKey(key TupleKey) string {
	return key.Object + "#" + key.Relation + "@" + key.User
}

// findRelation looks up the rewrite AST for (objectType, relation) in the
// loaded authorization model. Callers get a structured error for every
// failure mode (type missing, type has no relations, relation missing) so
// the HTTP layer can map each to its own 400 message rather than collapsing
// to a generic "schema mismatch".
func findRelation(model *openfgav1.AuthorizationModel, objectType, relation string) (*openfgav1.Userset, error) {
	for _, td := range model.GetTypeDefinitions() {
		if td.GetType() != objectType {
			continue
		}
		rels := td.GetRelations()
		if len(rels) == 0 {
			return nil, fmt.Errorf("rebac: object type %q has no relations defined", objectType)
		}
		u, ok := rels[relation]
		if !ok {
			return nil, fmt.Errorf("rebac: relation %q not defined on object type %q", relation, objectType)
		}
		return u, nil
	}
	return nil, fmt.Errorf("rebac: object type %q not in schema", objectType)
}

// check is the central dispatcher for a single Check step: it enforces the
// depth cap, consults the memo, parses the object's type, looks up the
// matching rewrite, and hands evaluation off to the per-rewrite helper. The
// helpers themselves are stubs in this commit (Task 3); Tasks 4–9 replace
// each stub with the real rewrite semantics.
//
// Depth is checked before the memo hit on purpose: a cycle that makes us
// call check() with the same key from depth 24 and depth 26 must error at
// depth 26 regardless of whether the key was observed before.
func (ctx *checkContext) check(key TupleKey, depth int) (bool, error) {
	if depth >= maxResolutionDepth {
		return false, fmt.Errorf("rebac: max resolution depth %d exceeded on %s#%s",
			maxResolutionDepth, key.Object, key.Relation)
	}

	if v, ok := ctx.memo.Load(memoKey(key)); ok {
		return v.(bool), nil
	}

	objType, _, err := parseObjectString(key.Object)
	if err != nil {
		return false, fmt.Errorf("rebac: parse object: %w", err)
	}

	userset, err := findRelation(ctx.model, objType, key.Relation)
	if err != nil {
		return false, err
	}

	allowed, err := ctx.evaluate(userset, key, depth)
	if err != nil {
		return false, err
	}
	// Only positive or negative *decisions* are memoised — errors are not,
	// so transient failures don't poison later sibling branches that might
	// reach the same key via a different path.
	ctx.memo.Store(memoKey(key), allowed)
	return allowed, nil
}

// evaluate selects the rewrite implementation by oneof type and forwards to
// the matching stub. Task 4–9 commits replace each stub body; signatures
// are frozen here so those commits stay surgical.
func (ctx *checkContext) evaluate(userset *openfgav1.Userset, key TupleKey, depth int) (bool, error) {
	switch u := userset.GetUserset().(type) {
	case *openfgav1.Userset_This:
		return ctx.checkThis(key, depth)
	case *openfgav1.Userset_ComputedUserset:
		return ctx.checkComputedUserset(key, u.ComputedUserset, depth)
	case *openfgav1.Userset_TupleToUserset:
		return ctx.checkTupleToUserset(key, u.TupleToUserset, depth)
	case *openfgav1.Userset_Union:
		return ctx.checkUnion(key, u.Union, depth)
	case *openfgav1.Userset_Intersection:
		return ctx.checkIntersection(key, u.Intersection, depth)
	case *openfgav1.Userset_Difference:
		return ctx.checkDifference(key, u.Difference, depth)
	case nil:
		return false, fmt.Errorf("rebac: rewrite for %s#%s has no userset type", key.Object, key.Relation)
	default:
		return false, fmt.Errorf("rebac: unsupported rewrite kind %T on %s#%s", u, key.Object, key.Relation)
	}
}

// matchesContextualTuple reports whether any of the caller-supplied
// contextual tuples directly satisfies key. Respects wildcard rows the same
// way DB rows are respected: a `user:*` contextual tuple grants to every
// plain `user:<id>` caller, but never to a userset caller (type:id#relation)
// nor to the self-wildcard `user:*` caller itself.
//
// Extracted as a pure helper so the wildcard semantics can be unit-tested
// without a database — DB coverage for checkThis proper lives in
// biz_rebac_engine_db_test.go under the !skipCi tag.
func matchesContextualTuple(contextual []TupleKey, key TupleKey) bool {
	if len(contextual) == 0 {
		return false
	}
	userType, userId, userRel, err := parseUserString(key.User)
	if err != nil {
		return false
	}
	isUserset := userRel != ""
	isSelfWildcard := userId == "*"
	wildcard := userType + ":*"

	for _, t := range contextual {
		if t.Object != key.Object || t.Relation != key.Relation {
			continue
		}
		if t.User == key.User {
			return true
		}
		if !isSelfWildcard && !isUserset && t.User == wildcard {
			return true
		}
	}
	return false
}

// checkThis resolves the `this` rewrite — a direct tuple grant. It looks
// at (contextual tuples first, then DB) for an exact (object, relation,
// user) row, and separately for a type-wide wildcard row `{userType}:*`
// when the caller is a plain user. `this` is a leaf rewrite so depth is
// irrelevant and not checked here.
func (ctx *checkContext) checkThis(key TupleKey, depth int) (bool, error) {
	_ = depth

	userType, userId, userRel, err := parseUserString(key.User)
	if err != nil {
		return false, fmt.Errorf("rebac: parse user: %w", err)
	}
	isUserset := userRel != ""
	isSelfWildcard := userId == "*"

	if matchesContextualTuple(ctx.contextual, key) {
		return true, nil
	}

	owner, appName, err := parseStoreId(ctx.storeId)
	if err != nil {
		return false, err
	}

	exact, err := ReadBizTuples(owner, appName, key.Object, key.Relation, key.User)
	if err != nil {
		return false, fmt.Errorf("rebac: read tuples: %w", err)
	}
	if len(exact) > 0 {
		return true, nil
	}

	// Wildcard rows only expand to plain-user callers. A userset subject
	// or the self-wildcard are never granted by a `{type}:*` row.
	if !isSelfWildcard && !isUserset {
		wildcardUser := userType + ":*"
		wc, err := ReadBizTuples(owner, appName, key.Object, key.Relation, wildcardUser)
		if err != nil {
			return false, fmt.Errorf("rebac: read wildcard tuples: %w", err)
		}
		if len(wc) > 0 {
			return true, nil
		}
	}

	return false, nil
}

// checkComputedUserset resolves `define viewer: editor` — evaluate the
// caller's access to the *same* object under a different relation. Just a
// shallow redirect: build a new TupleKey with the target relation and hand
// it back to the dispatcher, which enforces depth + memo on the re-entry.
//
// The ObjectRelation.Object field is ignored here because computed_userset
// always refers to the current object. OpenFGA's proto keeps the field for
// symmetry with tuple_to_userset; the OpenFGA server asserts it's empty.
func (ctx *checkContext) checkComputedUserset(key TupleKey, cu *openfgav1.ObjectRelation, depth int) (bool, error) {
	target := cu.GetRelation()
	if target == "" {
		return false, fmt.Errorf("rebac: computed_userset on %s#%s has empty target relation",
			key.Object, key.Relation)
	}
	return ctx.check(TupleKey{
		Object:   key.Object,
		Relation: target,
		User:     key.User,
	}, depth+1)
}

// checkTupleToUserset resolves `define viewer: viewer from parent` by first
// finding every object reachable through the `parent` relation of the
// current object, then recursively checking the caller's access to
// `viewer` on each such parent. Returns true as soon as any parent grants.
//
// The scan is lazy — we fetch parent tuples on demand rather than
// pre-materialising every ancestor, so a folder with many documents pays
// only for the parents it actually needs to consult for a given Check.
func (ctx *checkContext) checkTupleToUserset(key TupleKey, ttu *openfgav1.TupleToUserset, depth int) (bool, error) {
	tupleset := ttu.GetTupleset().GetRelation()
	computed := ttu.GetComputedUserset().GetRelation()
	if tupleset == "" || computed == "" {
		return false, fmt.Errorf("rebac: tuple_to_userset on %s#%s missing tupleset or computed relation",
			key.Object, key.Relation)
	}

	parents, err := ctx.tuplesetUsers(key.Object, tupleset)
	if err != nil {
		return false, err
	}

	for _, p := range parents {
		// Only userset-producing parent rows matter — a `user:alice` in
		// a `parent` column would be malformed against a TTU schema, and
		// skipping it keeps us from dispatching a bogus plain-user Check.
		if !strings.Contains(p, ":") {
			continue
		}
		parentObject := p
		// Strip any accidental `#relation` — real `parent` tuples should
		// store plain `folder:eng`, but upstream fixtures occasionally
		// include the `#...` suffix; normalise.
		if idx := strings.LastIndex(p, "#"); idx >= 0 {
			parentObject = p[:idx]
		}

		allowed, err := ctx.check(TupleKey{
			Object:   parentObject,
			Relation: computed,
			User:     key.User,
		}, depth+1)
		if err != nil {
			return false, err
		}
		if allowed {
			return true, nil
		}
	}
	return false, nil
}

// tuplesetUsers returns the distinct User strings of every tuple matching
// (storeId, object, relation). Contextual tuples are folded in first. The
// returned slice is order-preserving (contextual before DB, DB in index
// order) so tests can reason about traversal sequence if they care.
func (ctx *checkContext) tuplesetUsers(object, relation string) ([]string, error) {
	owner, appName, err := parseStoreId(ctx.storeId)
	if err != nil {
		return nil, err
	}
	var out []string
	seen := map[string]bool{}
	for _, t := range ctx.contextual {
		if t.Object == object && t.Relation == relation && !seen[t.User] {
			seen[t.User] = true
			out = append(out, t.User)
		}
	}
	rows, err := ReadBizTuples(owner, appName, object, relation, "")
	if err != nil {
		return nil, fmt.Errorf("rebac: read tupleset %s#%s: %w", object, relation, err)
	}
	for _, r := range rows {
		if !seen[r.User] {
			seen[r.User] = true
			out = append(out, r.User)
		}
	}
	return out, nil
}

// checkUnion — Task 7.
func (ctx *checkContext) checkUnion(key TupleKey, u *openfgav1.Usersets, depth int) (bool, error) {
	_ = u
	_ = depth
	return false, fmt.Errorf("rebac: 'union' rewrite not implemented (CP-3 Task 7) for %s#%s", key.Object, key.Relation)
}

// checkIntersection — Task 8.
func (ctx *checkContext) checkIntersection(key TupleKey, u *openfgav1.Usersets, depth int) (bool, error) {
	_ = u
	_ = depth
	return false, fmt.Errorf("rebac: 'intersection' rewrite not implemented (CP-3 Task 8) for %s#%s", key.Object, key.Relation)
}

// checkDifference — Task 9.
func (ctx *checkContext) checkDifference(key TupleKey, d *openfgav1.Difference, depth int) (bool, error) {
	_ = d
	_ = depth
	return false, fmt.Errorf("rebac: 'difference' rewrite not implemented (CP-3 Task 9) for %s#%s", key.Object, key.Relation)
}

// ReBACCheck evaluates whether req.TupleKey.User has req.TupleKey.Relation
// on req.TupleKey.Object within the given store. Implements OpenFGA v1.1
// Check semantics: resolve the app's authorization model, then recursively
// evaluate rewrites with request-scoped memoisation and a depth cap. The
// individual rewrite bodies are stubs in this commit; see evaluate() for
// the dispatch table.
func ReBACCheck(req *CheckRequest) (*CheckResult, error) {
	if req == nil {
		return nil, fmt.Errorf("rebac check: nil request")
	}
	if req.StoreId == "" {
		return nil, fmt.Errorf("rebac check: empty storeId")
	}
	if req.TupleKey.Object == "" || req.TupleKey.Relation == "" || req.TupleKey.User == "" {
		return nil, fmt.Errorf("rebac check: incomplete tuple key %+v", req.TupleKey)
	}

	model, err := resolveAuthorizationModel(req.StoreId, req.AuthorizationModelId)
	if err != nil {
		return nil, err
	}

	ctx := &checkContext{
		storeId:        req.StoreId,
		model:          model,
		contextual:     req.ContextualTuples,
		requestContext: req.Context,
	}
	allowed, err := ctx.check(req.TupleKey, 0)
	if err != nil {
		return nil, err
	}
	return &CheckResult{Allowed: allowed}, nil
}
