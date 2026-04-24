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
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
	"golang.org/x/sync/errgroup"
)

// errSchemaMissing is surfaced by findRelation when the requested object
// type or relation isn't defined in the loaded authorization model. The
// top-level dispatcher bubbles it up so clients see a 400-style message;
// tuple_to_userset and `this`'s userset-expansion path intercept it with
// errors.Is and treat "missing" as "this branch doesn't contribute" — a
// polymorphic parent (e.g. `parent: [document, folder]` where only folder
// defines viewer) is a normal case, not an error.
var errSchemaMissing = errors.New("rebac: schema-missing")

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
//
// evalCount is a test-only hook: when non-nil, ctx.check increments it
// every time a key progresses past the memo lookup into real dispatch.
// Production callers never set it — its zero value (nil) makes the check
// free. Kept on the struct, not in a global, so concurrent tests don't
// cross-contaminate each other's counters.
//
// memo stores checkState values (StateAllowed / StateDenied / StateCycle)
// rather than bool since CP-8 C7. Cycle states are NOT memoised — a cycle
// is a per-path property; the same key reached via a non-cyclic path must
// still produce its true answer.
type checkContext struct {
	storeId        string
	model          *openfgav1.AuthorizationModel
	contextual     []TupleKey
	requestContext map[string]any
	memo           sync.Map // key: "object#relation@user" → checkState
	evalCount      *atomic.Int64
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
	// The transformer doesn't always populate AuthorizationModel.Id in the
	// JSON blob; set it from the DB row so downstream CEL caches can key on
	// model id without a second plumbing path.
	proto.Id = m.Id
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

// schemaHasType reports whether the authorization model defines the given
// object type. Linear scan — schemas have at most ~dozens of types, so the
// O(n) cost is fine on the hot path.
func schemaHasType(model *openfgav1.AuthorizationModel, typeName string) bool {
	for _, td := range model.GetTypeDefinitions() {
		if td.GetType() == typeName {
			return true
		}
	}
	return false
}

// schemaHasRelation reports whether (typeName, relation) is defined in the
// authorization model — i.e. whether the type has a rewrite AST for that
// relation. Used by request-level validation so a Check request naming a
// non-existent relation fails at the edge, not deep in the dispatcher.
func schemaHasRelation(model *openfgav1.AuthorizationModel, typeName, relation string) bool {
	for _, td := range model.GetTypeDefinitions() {
		if td.GetType() != typeName {
			continue
		}
		_, ok := td.GetRelations()[relation]
		return ok
	}
	return false
}

// validateCheckRequestTuple enforces schema-consistency on caller-supplied
// tuples. Top-level TupleKey only gets the basic type/relation existence
// checks — a caller checking `document:1#viewer@team:eng#member` against
// `viewer: [user] or editor` is legitimate (editor branch may grant), so
// we don't apply the narrow `this`-branch type restriction there.
//
// Contextual tuples (strict=true) additionally must pass the direct type
// restriction: they're asserting a grant, and asserting one that the
// schema's `this` slot can't consume is a bad request (upstream 2027),
// not a silent deny.
func validateCheckRequestTuple(model *openfgav1.AuthorizationModel, tk TupleKey, label string, strict bool) error {
	objType, _, err := parseObjectString(tk.Object)
	if err != nil {
		return fmt.Errorf("rebac: %s: %w", label, err)
	}
	if !schemaHasType(model, objType) {
		return fmt.Errorf("rebac: %s: object type %q not in schema", label, objType)
	}
	if !schemaHasRelation(model, objType, tk.Relation) {
		return fmt.Errorf("rebac: %s: relation %q not defined on type %q", label, tk.Relation, objType)
	}
	userType, _, userRel, err := parseUserString(tk.User)
	if err != nil {
		return fmt.Errorf("rebac: %s: %w", label, err)
	}
	if !schemaHasType(model, userType) {
		return fmt.Errorf("rebac: %s: user type %q not in schema", label, userType)
	}
	if userRel != "" && !schemaHasRelation(model, userType, userRel) {
		return fmt.Errorf("rebac: %s: userset relation %q not defined on type %q",
			label, userRel, userType)
	}
	if strict {
		restrictions := findDirectlyRelatedUserTypes(model, objType, tk.Relation)
		if !subjectMatchesTypeRestriction(tk.User, restrictions) {
			return fmt.Errorf("rebac: %s: user %q not permitted by type restrictions on %s#%s",
				label, tk.User, objType, tk.Relation)
		}
	}
	return nil
}

// findDirectlyRelatedUserTypes returns the schema's direct-type-restriction
// list for (objectType, relation) — the `[user, team#member, user:*]`
// fragment of a `this`-flavored rewrite. Nil means "no restriction"
// (likely because the relation uses computed_userset / tuple_to_userset
// rather than `this`); in that case checkThis treats every tuple as
// unconstrained. An empty slice is never returned — absent metadata maps
// to nil.
func findDirectlyRelatedUserTypes(model *openfgav1.AuthorizationModel, objectType, relation string) []*openfgav1.RelationReference {
	for _, td := range model.GetTypeDefinitions() {
		if td.GetType() != objectType {
			continue
		}
		meta := td.GetMetadata()
		if meta == nil {
			return nil
		}
		if r, ok := meta.GetRelations()[relation]; ok {
			refs := r.GetDirectlyRelatedUserTypes()
			if len(refs) == 0 {
				return nil
			}
			return refs
		}
		return nil
	}
	return nil
}

// subjectMatchesTypeRestriction reports whether the tuple subject string
// (e.g. "user:alice", "team:eng#member", "user:*") is admissible under
// *any* of the schema's direct type references. Nil restrictions means
// the caller must apply their own policy (findDirectlyRelatedUserTypes
// never returns empty — nil is its "no restriction" signal).
func subjectMatchesTypeRestriction(user string, refs []*openfgav1.RelationReference) bool {
	if len(refs) == 0 {
		return true
	}
	userType, userId, userRel, err := parseUserString(user)
	if err != nil {
		return false
	}
	isWildcard := userId == "*"
	hasUserRel := userRel != ""

	for _, r := range refs {
		if r.GetType() != userType {
			continue
		}
		switch {
		case r.GetWildcard() != nil:
			if isWildcard {
				return true
			}
		case r.GetRelation() != "":
			// `{type}#{relation}` only matches userset-shaped subjects
			// with the exact target relation.
			if hasUserRel && userRel == r.GetRelation() {
				return true
			}
		default:
			// Plain `{type}` — matches exactly `type:id` (no wildcard,
			// no userset reference).
			if !isWildcard && !hasUserRel {
				return true
			}
		}
	}
	return false
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
			return nil, fmt.Errorf("%w: object type %q has no relations defined", errSchemaMissing, objectType)
		}
		u, ok := rels[relation]
		if !ok {
			return nil, fmt.Errorf("%w: relation %q not defined on object type %q", errSchemaMissing, relation, objectType)
		}
		return u, nil
	}
	return nil, fmt.Errorf("%w: object type %q not in schema", errSchemaMissing, objectType)
}

// check is the central dispatcher for a single Check step: it enforces the
// depth cap, detects per-branch cycles, consults the memo, parses the
// object's type, looks up the matching rewrite, and hands evaluation off
// to the per-rewrite helper.
//
// visited tracks the resolution path — memoKeys of every ancestor call
// on this branch. A re-entry of the same memoKey on the same path means
// the schema has a cycle that "this branch" can't close; we return
// StateCycle without memoising, so a legitimate reach of the same key
// via a different path can still produce its real answer. StateCycle is
// distinct from StateDenied so the subtract branch of a difference can
// combine "base=allowed" with "subtract=cycle" into a conservative deny
// instead of naively "allowed and not false = allowed" (spec §11.2,
// OpenFGA's `true_butnot_cycle_return_false`).
//
// Depth is checked before the memo hit on purpose: a misauthored schema
// that somehow passes the cycle check but still recurses 25+ deep must
// surface as error, not a silent StateDenied.
//
// Goroutines in checkUnion / checkIntersection share visited by value —
// Go slices pass the header by value, underlying array by reference. Each
// sub-ctx.check that needs to add to visited does append([]string(nil),
// visited...) first so siblings don't mutate each other's arrays.
func (ctx *checkContext) check(key TupleKey, depth int, visited []string) (checkState, error) {
	mkey := memoKey(key)
	for _, v := range visited {
		if v == mkey {
			return StateCycle, nil
		}
	}
	if depth >= maxResolutionDepth {
		return StateDenied, fmt.Errorf("rebac: max resolution depth %d exceeded on %s#%s",
			maxResolutionDepth, key.Object, key.Relation)
	}

	if v, ok := ctx.memo.Load(mkey); ok {
		return v.(checkState), nil
	}
	// Past the memo short-circuit — this is real dispatch work. Counter
	// lets memo-collapse tests prove sibling sub-queries share results.
	if ctx.evalCount != nil {
		ctx.evalCount.Add(1)
	}

	objType, _, err := parseObjectString(key.Object)
	if err != nil {
		return StateDenied, fmt.Errorf("rebac: parse object: %w", err)
	}

	userset, err := findRelation(ctx.model, objType, key.Relation)
	if err != nil {
		return StateDenied, err
	}

	// Children inherit "this key has been seen" by receiving a fresh
	// slice with the current mkey appended. append-from-nil guarantees a
	// standalone backing array so concurrent siblings never stomp one
	// another when they recurse further.
	childVisited := append(append([]string(nil), visited...), mkey)
	state, err := ctx.evaluate(userset, key, depth, childVisited)
	if err != nil {
		return StateDenied, err
	}
	// Only definite allow/deny decisions are memoised — StateCycle is a
	// per-path property (a different resolution path to the same key may
	// not close the same cycle), and errors are not memoised so transient
	// failures don't poison later sibling branches.
	if state != StateCycle {
		ctx.memo.Store(mkey, state)
	}
	return state, nil
}

// evaluate selects the rewrite implementation by oneof type. visited is
// forwarded so any helper that recurses via ctx.check carries the
// resolution path with it — union / intersection / difference don't
// themselves consume visited; they're rewrites on the current key.
func (ctx *checkContext) evaluate(userset *openfgav1.Userset, key TupleKey, depth int, visited []string) (checkState, error) {
	switch u := userset.GetUserset().(type) {
	case *openfgav1.Userset_This:
		return ctx.checkThis(key, depth, visited)
	case *openfgav1.Userset_ComputedUserset:
		return ctx.checkComputedUserset(key, u.ComputedUserset, depth, visited)
	case *openfgav1.Userset_TupleToUserset:
		return ctx.checkTupleToUserset(key, u.TupleToUserset, depth, visited)
	case *openfgav1.Userset_Union:
		return ctx.checkUnion(key, u.Union, depth, visited)
	case *openfgav1.Userset_Intersection:
		return ctx.checkIntersection(key, u.Intersection, depth, visited)
	case *openfgav1.Userset_Difference:
		return ctx.checkDifference(key, u.Difference, depth, visited)
	case nil:
		return StateDenied, fmt.Errorf("rebac: rewrite for %s#%s has no userset type", key.Object, key.Relation)
	default:
		return StateDenied, fmt.Errorf("rebac: unsupported rewrite kind %T on %s#%s", u, key.Object, key.Relation)
	}
}

// checkThis resolves the `this` rewrite — a direct-tuple grant. It scans
// every tuple on (object, relation) and tests each user against the
// caller:
//
//   - plain match (`user:alice` grants `user:alice`) → true
//   - type-wide wildcard (`user:*` grants any `user:<id>`) → true
//   - userset reference (`team:eng#member` grants anyone who is an
//     `eng` team member) → recurse into the referenced userset
//
// A tuple carrying a CEL condition (spec §6.1 item 5) only grants when
// the condition evaluates true under the merged tuple-context + request-
// context. False/error in the condition means "this tuple doesn't
// contribute" — the loop moves on without surfacing the result.
//
// Contextual tuples are folded in first via tuplesetTuples (spec §6.1).
// Wildcard rows only expand to plain-user callers — a userset subject or
// the self-wildcard are never granted by a `{type}:*` row. Userset
// expansion bumps depth so a malformed schema looping on itself can't
// outrun the cap.
func (ctx *checkContext) checkThis(key TupleKey, depth int, visited []string) (checkState, error) {
	userType, userId, userRel, err := parseUserString(key.User)
	if err != nil {
		return StateDenied, fmt.Errorf("rebac: parse user: %w", err)
	}
	isUserset := userRel != ""
	isSelfWildcard := userId == "*"
	wildcardUser := userType + ":*"

	refs, err := ctx.tuplesetTuples(key.Object, key.Relation)
	if err != nil {
		return StateDenied, err
	}

	// Type-restriction filter (spec §5.2 type_restriction). Absent
	// restrictions (nil return) leave every subject admissible — schemas
	// that reach `checkThis` through a non-`this` rewrite path have no
	// DirectlyRelatedUserTypes metadata and must not be over-filtered.
	objType, _, _ := parseObjectString(key.Object)
	restrictions := findDirectlyRelatedUserTypes(ctx.model, objType, key.Relation)

	// sawCycle: if no ref allowed but at least one userset expansion
	// returned StateCycle, we surface StateCycle rather than StateDenied
	// so enclosing difference/intersection combinators can apply the
	// conservative-deny rule.
	sawCycle := false

	for _, ref := range refs {
		if !subjectMatchesTypeRestriction(ref.User, restrictions) {
			continue
		}
		// Direct / wildcard match against the caller.
		directMatch := ref.User == key.User ||
			(!isSelfWildcard && !isUserset && ref.User == wildcardUser)
		if directMatch {
			ok, err := ctx.evaluateTupleCondition(ref)
			if err != nil {
				return StateDenied, err
			}
			if ok {
				return StateAllowed, nil
			}
			// Condition denied this tuple; keep scanning — another tuple
			// may still grant.
			continue
		}
		// Userset expansion. `team:eng#member` means "whoever has `member`
		// on `team:eng`". Only rows with a `#relation` suffix qualify;
		// plain type:id rows were handled by the direct-match branch.
		if hashIdx := strings.LastIndex(ref.User, "#"); hashIdx > 0 {
			// A failing condition on a userset reference gates the whole
			// expansion — if the grant is conditional and the condition
			// is unmet, we must not recurse through it.
			ok, err := ctx.evaluateTupleCondition(ref)
			if err != nil {
				return StateDenied, err
			}
			if !ok {
				continue
			}
			rowObj := ref.User[:hashIdx]
			rowRel := ref.User[hashIdx+1:]
			if rowRel == "" {
				continue
			}
			state, err := ctx.check(TupleKey{
				Object:   rowObj,
				Relation: rowRel,
				User:     key.User,
			}, depth+1, visited)
			if err != nil {
				// Same polymorphic-skip logic as tuple_to_userset: a
				// userset reference into a type that doesn't define the
				// relation means "no grant from here", not a fatal error.
				if errors.Is(err, errSchemaMissing) {
					continue
				}
				return StateDenied, err
			}
			switch state {
			case StateAllowed:
				return StateAllowed, nil
			case StateCycle:
				sawCycle = true
			}
		}
	}
	if sawCycle {
		return StateCycle, nil
	}
	return StateDenied, nil
}

// evaluateTupleCondition applies the caller-tuple's CEL condition (if
// any) against the merged tuple-context + request-context. Unconditional
// tuples always grant. Unknown condition names surface as an error — the
// schema guaranteed the name exists at write time, so seeing it go
// missing here is a real integrity failure, not a "deny silently".
func (ctx *checkContext) evaluateTupleCondition(ref tupleRef) (bool, error) {
	if ref.ConditionName == "" {
		return true, nil
	}
	cond, ok := ctx.model.GetConditions()[ref.ConditionName]
	if !ok {
		return false, fmt.Errorf("rebac cel: tuple references unknown condition %q", ref.ConditionName)
	}
	program, err := compileCondition(ctx.model.GetId(), cond)
	if err != nil {
		return false, err
	}
	tupleCtx, err := parseConditionContext(ref.ConditionContext)
	if err != nil {
		return false, fmt.Errorf("rebac cel: tuple %q: %w", ref.User, err)
	}
	// Merge: tuple context supplies the condition's own parameters,
	// request context provides caller-level vars. Request wins on name
	// collision — request-time values are the caller's assertion of
	// current state (clock, IP, …), tuple context is persisted data.
	vars := make(map[string]any, len(tupleCtx)+len(ctx.requestContext))
	for k, v := range tupleCtx {
		vars[k] = v
	}
	for k, v := range ctx.requestContext {
		vars[k] = v
	}
	val, _, err := program.Eval(vars)
	if err != nil {
		return false, fmt.Errorf("rebac cel: eval condition %q: %w", ref.ConditionName, err)
	}
	b, ok := val.Value().(bool)
	if !ok {
		return false, fmt.Errorf("rebac cel: condition %q result not bool: %T", ref.ConditionName, val.Value())
	}
	return b, nil
}

// checkComputedUserset resolves `define viewer: editor` — evaluate the
// caller's access to the *same* object under a different relation. Just a
// shallow redirect: build a new TupleKey with the target relation and hand
// it back to the dispatcher, which enforces depth + memo + cycle detection
// on the re-entry.
//
// The ObjectRelation.Object field is ignored here because computed_userset
// always refers to the current object. OpenFGA's proto keeps the field for
// symmetry with tuple_to_userset; the OpenFGA server asserts it's empty.
func (ctx *checkContext) checkComputedUserset(key TupleKey, cu *openfgav1.ObjectRelation, depth int, visited []string) (checkState, error) {
	target := cu.GetRelation()
	if target == "" {
		return StateDenied, fmt.Errorf("rebac: computed_userset on %s#%s has empty target relation",
			key.Object, key.Relation)
	}
	return ctx.check(TupleKey{
		Object:   key.Object,
		Relation: target,
		User:     key.User,
	}, depth+1, visited)
}

// checkTupleToUserset resolves `define viewer: viewer from parent` by first
// finding every object reachable through the `parent` relation of the
// current object, then recursively checking the caller's access to
// `viewer` on each such parent. Returns true as soon as any parent grants.
//
// The scan is lazy — we fetch parent tuples on demand rather than
// pre-materialising every ancestor, so a folder with many documents pays
// only for the parents it actually needs to consult for a given Check.
func (ctx *checkContext) checkTupleToUserset(key TupleKey, ttu *openfgav1.TupleToUserset, depth int, visited []string) (checkState, error) {
	tupleset := ttu.GetTupleset().GetRelation()
	computed := ttu.GetComputedUserset().GetRelation()
	if tupleset == "" || computed == "" {
		return StateDenied, fmt.Errorf("rebac: tuple_to_userset on %s#%s missing tupleset or computed relation",
			key.Object, key.Relation)
	}

	parents, err := ctx.tuplesetTuples(key.Object, tupleset)
	if err != nil {
		return StateDenied, err
	}

	// Apply the tupleset relation's type restriction — e.g. if schema
	// narrows from `parent: [group1, group2]` to `parent: [group1]`,
	// a persisted `group2:1` parent row must become invisible.
	objType, _, _ := parseObjectString(key.Object)
	tuplesetRestrictions := findDirectlyRelatedUserTypes(ctx.model, objType, tupleset)

	// Aggregate across every parent branch via unionState. A single
	// StateAllowed short-circuits; otherwise a pending StateCycle dominates
	// over StateDenied so the caller can apply conservative-deny rules
	// (e.g. inside a difference subtract).
	result := StateDenied
	for _, p := range parents {
		if !subjectMatchesTypeRestriction(p.User, tuplesetRestrictions) {
			continue
		}
		// Only userset-producing parent rows matter — a `user:alice` in
		// a `parent` column would be malformed against a TTU schema, and
		// skipping it keeps us from dispatching a bogus plain-user Check.
		if !strings.Contains(p.User, ":") {
			continue
		}
		// Condition on the parent tuple gates its entire contribution —
		// a failing condition means the parent effectively isn't a
		// parent for this request.
		ok, err := ctx.evaluateTupleCondition(p)
		if err != nil {
			return StateDenied, err
		}
		if !ok {
			continue
		}
		parentObject := p.User
		// Strip any accidental `#relation` — real `parent` tuples should
		// store plain `folder:eng`, but upstream fixtures occasionally
		// include the `#...` suffix; normalise.
		if idx := strings.LastIndex(p.User, "#"); idx >= 0 {
			parentObject = p.User[:idx]
		}

		state, err := ctx.check(TupleKey{
			Object:   parentObject,
			Relation: computed,
			User:     key.User,
		}, depth+1, visited)
		if err != nil {
			// A polymorphic parent (parent: [document, folder]) whose
			// concrete type doesn't define the computed relation isn't
			// an error — the branch simply doesn't contribute.
			if errors.Is(err, errSchemaMissing) {
				continue
			}
			return StateDenied, err
		}
		result = unionState(result, state)
		if result == StateAllowed {
			return StateAllowed, nil
		}
	}
	return result, nil
}

// tupleRef is the engine-internal view of a tuple during Check: the User
// string plus the optional CEL condition fields. Contextual tuples don't
// carry conditions in CP-4 (TupleKey's shape predates the feature) — the
// Condition* fields stay empty for contextual-sourced refs, which
// evaluateTupleCondition treats as "unconditional grant".
type tupleRef struct {
	User             string
	ConditionName    string
	ConditionContext string
}

// tuplesetTuples returns every tuple matching (storeId, object, relation),
// deduplicated by User string (first-seen wins). Contextual tuples are
// folded in first, then persisted rows. Preserving order lets test suites
// reason about traversal sequence when needed.
//
// The DB-sourced portion is cached in L2 (spec §6.6 row 2) with a short
// TTL. Contextual tuples are never cached — they're per-request grants
// by definition. Cache misses fall through to DB; cache hits return the
// already-deduplicated DB refs directly, and contextual refs merge on
// top. Writes to affected (object, relation) keys invalidate the cache
// slot.
func (ctx *checkContext) tuplesetTuples(object, relation string) ([]tupleRef, error) {
	owner, appName, err := parseStoreId(ctx.storeId)
	if err != nil {
		return nil, err
	}

	// Contextual-only merge set, seeded first so its entries shadow
	// anything from the DB side. Callers that pass the same user in
	// both a contextual tuple and a persisted row get the contextual
	// view (which may have different condition context).
	var out []tupleRef
	seen := map[string]bool{}
	for _, t := range ctx.contextual {
		if t.Object == object && t.Relation == relation && !seen[t.User] {
			seen[t.User] = true
			out = append(out, tupleRef{User: t.User})
		}
	}

	// ormer can be nil in pure-function engine tests that exercise the
	// dispatcher with contextual tuples alone (no DB bootstrap). Short-
	// circuit to the contextual-only view.
	if ormer == nil {
		return out, nil
	}

	// L2 cache lookup before DB.
	if cached, ok := loadBizTuplesetCache(ctx.storeId, object, relation); ok {
		for _, r := range cached {
			if !seen[r.User] {
				seen[r.User] = true
				out = append(out, r)
			}
		}
		return out, nil
	}

	rows, err := ReadBizTuples(owner, appName, object, relation, "")
	if err != nil {
		return nil, fmt.Errorf("rebac: read tupleset %s#%s: %w", object, relation, err)
	}
	// Build a deduplicated DB-side refs slice to cache. This is
	// context-free (no contextual tuples mixed in), so subsequent
	// callers with different contextual tuples still get correct
	// results.
	dbRefs := make([]tupleRef, 0, len(rows))
	dbSeen := map[string]bool{}
	for _, r := range rows {
		if !dbSeen[r.User] {
			dbSeen[r.User] = true
			dbRefs = append(dbRefs, tupleRef{
				User:             r.User,
				ConditionName:    r.ConditionName,
				ConditionContext: r.ConditionContext,
			})
		}
	}
	storeBizTuplesetCache(ctx.storeId, object, relation, dbRefs)

	for _, r := range dbRefs {
		if !seen[r.User] {
			seen[r.User] = true
			out = append(out, r)
		}
	}
	return out, nil
}

// checkUnion resolves `define viewer: [user] or editor` — any child branch
// true is enough. Branches evaluate concurrently via errgroup; a soft
// short-circuit flag lets later goroutines skip real work once one branch
// has returned true (the running goroutines can't be hard-cancelled without
// threading context through ReadBizTuples, which is a CP-6 refactor).
//
// Error handling: if any branch returns true, errors from other branches
// are swallowed — one positive decision suffices. If no branch is true and
// any branch errored, the first error surfaces; otherwise false.
func (ctx *checkContext) checkUnion(key TupleKey, u *openfgav1.Usersets, depth int, visited []string) (checkState, error) {
	children := u.GetChild()
	if len(children) == 0 {
		return StateDenied, nil
	}
	if len(children) == 1 {
		return ctx.evaluate(children[0], key, depth, visited)
	}

	var g errgroup.Group
	var found atomic.Bool
	// sawCycle is monotone (false→true latch), so a plain atomic.Bool
	// suffices — no mutex needed. Losing a late cycle observation when
	// `found` short-circuits is safe: unionState(Allowed, Cycle) == Allowed.
	sawCycle := atomic.Bool{}
	for _, c := range children {
		c := c
		g.Go(func() error {
			if found.Load() {
				return nil
			}
			state, err := ctx.evaluate(c, key, depth, visited)
			if err != nil {
				return err
			}
			switch state {
			case StateAllowed:
				found.Store(true)
			case StateCycle:
				sawCycle.Store(true)
			}
			return nil
		})
	}
	err := g.Wait()
	if found.Load() {
		return StateAllowed, nil
	}
	if err != nil {
		return StateDenied, err
	}
	if sawCycle.Load() {
		return StateCycle, nil
	}
	return StateDenied, nil
}

// checkIntersection resolves `define viewer: [user] and active` — every
// child branch must be true. Branches evaluate concurrently; an atomic
// `anyFalse` flag lets later goroutines skip once one branch is false.
//
// Error handling mirrors checkUnion's shape but inverted: a single false
// decision is enough to reject, and errors only surface when no branch
// was decisive.
func (ctx *checkContext) checkIntersection(key TupleKey, u *openfgav1.Usersets, depth int, visited []string) (checkState, error) {
	children := u.GetChild()
	if len(children) == 0 {
		// Empty intersection is a schema bug — DSL never emits one, but a
		// malformed proto could. Refuse rather than returning a confusing
		// "vacuous truth".
		return StateDenied, fmt.Errorf("rebac: empty intersection on %s#%s", key.Object, key.Relation)
	}
	if len(children) == 1 {
		return ctx.evaluate(children[0], key, depth, visited)
	}

	var g errgroup.Group
	// denied short-circuits; cycle dominates over allowed.
	var anyDenied atomic.Bool
	var sawCycle atomic.Bool
	for _, c := range children {
		c := c
		g.Go(func() error {
			if anyDenied.Load() {
				return nil
			}
			state, err := ctx.evaluate(c, key, depth, visited)
			if err != nil {
				return err
			}
			switch state {
			case StateDenied:
				anyDenied.Store(true)
			case StateCycle:
				sawCycle.Store(true)
			}
			return nil
		})
	}
	err := g.Wait()
	if anyDenied.Load() {
		return StateDenied, nil
	}
	if err != nil {
		return StateDenied, err
	}
	if sawCycle.Load() {
		return StateCycle, nil
	}
	return StateAllowed, nil
}

// checkDifference resolves `define viewer: [user] but not banned` — the
// base grants, provided the subtract does not also grant. Strictly
// sequential: if Base is denied, Subtract is never consulted — diffState
// is absorbing on a denied base (diffState(denied, *) = denied), and
// callers often use Subtract for expensive "banlist" lookups that would
// waste work for users who weren't getting access anyway.
//
// Crucially for CP-8 C7: a Subtract branch returning StateCycle cannot be
// collapsed to "not false" — if we can't prove the subtract is false, we
// cannot prove the difference is allowed. diffState threads the cycle
// through so the enclosing evaluator (or top-level ReBACCheck) sees the
// conservative deny.
func (ctx *checkContext) checkDifference(key TupleKey, d *openfgav1.Difference, depth int, visited []string) (checkState, error) {
	base := d.GetBase()
	sub := d.GetSubtract()
	if base == nil || sub == nil {
		return StateDenied, fmt.Errorf("rebac: difference on %s#%s missing base or subtract",
			key.Object, key.Relation)
	}

	baseState, err := ctx.evaluate(base, key, depth, visited)
	if err != nil {
		return StateDenied, err
	}
	// Equivalent to diffState(StateDenied, *) = StateDenied — short-circuit
	// to avoid the wasted Subtract evaluation.
	if baseState == StateDenied {
		return StateDenied, nil
	}

	subState, err := ctx.evaluate(sub, key, depth, visited)
	if err != nil {
		return StateDenied, err
	}
	return diffState(baseState, subState), nil
}

// ReBACCheck evaluates whether req.TupleKey.User has req.TupleKey.Relation
// on req.TupleKey.Object within the given store. Implements OpenFGA v1.1
// Check semantics: resolve the app's authorization model, then recursively
// evaluate rewrites with request-scoped memoisation and a depth cap.
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

	// Request-boundary schema validation. Caller-asserted tuples with
	// unknown types/relations fail here rather than silently resolving to
	// a denial inside the dispatcher — matches OpenFGA's 2000/2027-class
	// error behaviour (spec §7.1 semantics; exact codes not matched).
	//
	// Top-level TupleKey gets shape-only checks (strict=false) so a
	// check against a userset / wildcard caller can still reach non-
	// `this` rewrite branches. Contextual tuples are asserted grants and
	// face the full type restriction (strict=true).
	if err := validateCheckRequestTuple(model, req.TupleKey, "check request", false); err != nil {
		return nil, err
	}
	for i, ct := range req.ContextualTuples {
		if err := validateCheckRequestTuple(model, ct, fmt.Sprintf("contextual tuple #%d", i), true); err != nil {
			return nil, err
		}
	}

	ctx := &checkContext{
		storeId:        req.StoreId,
		model:          model,
		contextual:     req.ContextualTuples,
		requestContext: req.Context,
	}
	state, err := ctx.check(req.TupleKey, 0, nil)
	if err != nil {
		return nil, err
	}
	// StateCycle at the top level maps to Allowed=false (conservative
	// deny). External API shape is unchanged — the ternary state lives
	// only inside the engine so lattice combinators can reason about
	// cycle-in-subtract and similar edge cases correctly.
	return &CheckResult{Allowed: state == StateAllowed}, nil
}
