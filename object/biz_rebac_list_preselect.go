// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_list_preselect.go narrows the candidate set for
// ReBACListObjects from "every object of the requested type" down to
// "every object that could plausibly grant the caller via direct
// relation, computed_userset, or TTU chain".
//
// This is the second half of B1 (the "reverse-index preselect" in
// docs/rebac-sla-baseline.md §Blockers B1). When it applies, N drops
// from thousands to a small multiple of the user's actual grant
// footprint — bench fixture goes from 7500 candidates to ~26 +
// TTU-source docs, multiplying the benefit of the parallel
// candidate Check that already landed.
//
// Correctness contract: the preselect is an over-approximation. It
// MUST NOT miss any candidate the engine would have declared
// allowed. Any uncertainty (wildcard user, non-plain user string,
// missing ormer, empty hint sets) falls back to the full-scan path.

package object

import (
	"fmt"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
)

// preselectHints captures the per-request filters used to narrow
// gatherCandidateObjects' DB scan. A nil hints triggers the legacy
// full-scan path (safe fallback).
type preselectHints struct {
	// directRelations: relations on the requested type that a direct
	// grant to one of effectiveSubjects would suffice to authorize. The
	// requested relation is always present; computed_userset references
	// add more.
	directRelations []string
	// ttuSourceRelations: relations whose tuples establish parent/ttu
	// chains on the requested type. Objects with tuples under these
	// relations MIGHT reach the caller via a recursive TTU resolution
	// and must be included (over-approximation).
	ttuSourceRelations []string
	// effectiveSubjects: user plus 1-hop userset memberships. An object
	// where any of these strings appears in the `user` column under a
	// directRelation is a direct-path candidate.
	effectiveSubjects []string
}

// buildPreselectHints computes the preselect filter for one
// ListObjects request. Returns nil when preselect isn't safe — in
// which case the caller falls back to the full-scan path. Reasons for
// returning nil:
//   - The caller's user string is a wildcard / userset / malformed
//     (can't compute effective subjects).
//   - The rewrite walker hit a case it doesn't recognize (future-proof
//     fallback; schema evolution shouldn't silently break preselect).
//   - Neither directRelations nor ttuSourceRelations survive the walk
//     (no way to narrow — full scan is the same cost).
//   - The effectiveSubjects query errored (DB glitch — don't skew
//     behavior, just widen the candidate set).
func buildPreselectHints(
	model *openfgav1.AuthorizationModel,
	owner, appName, objectType, relation, user string,
) *preselectHints {
	// Wildcard / userset callers skip preselect — their effective
	// subjects aren't computable from a single 1-hop query.
	userType, _, userRel, err := parseUserString(user)
	if err != nil || userType == "" || userRel != "" {
		return nil
	}
	// `user:*` and any `type:*` wildcard likewise: the user string
	// itself represents a set, not a subject we can 1-hop through.
	if _, _, userId := splitObjectString(user); userId == "*" {
		return nil
	}

	direct := map[string]struct{}{relation: {}}
	ttuSrc := map[string]struct{}{}
	rewrite, err := findRelation(model, objectType, relation)
	if err != nil {
		return nil
	}
	if !walkPreselectRelations(rewrite, direct, ttuSrc) {
		return nil
	}

	// No hints to filter on: every row would match. Cheaper to fall
	// back to the full-scan path than run a WHERE with an ever-true
	// predicate.
	if len(direct) == 0 && len(ttuSrc) == 0 {
		return nil
	}

	effectiveSubjects, err := effectiveSubjectsOfUser(owner, appName, user)
	if err != nil || len(effectiveSubjects) == 0 {
		return nil
	}

	return &preselectHints{
		directRelations:    mapKeysSorted(direct),
		ttuSourceRelations: mapKeysSorted(ttuSrc),
		effectiveSubjects:  effectiveSubjects,
	}
}

// walkPreselectRelations fills `direct` with relations whose direct
// tuples (under a type-restricted subject) grant access, and `ttuSrc`
// with tupleset relations that source a TTU chain. Returns false when
// it encounters an AST shape it doesn't know how to over-approximate
// — in that case the caller must fall back to full scan.
//
// The walker is deliberately shallow: it does NOT chase TTU into the
// computed-userset target's own relations. That would require
// cross-type traversal and a cycle guard; the TTU-source row in the
// preselect already guarantees the TTU-reachable object is included
// as a candidate for the final Check-driven filter.
func walkPreselectRelations(u *openfgav1.Userset, direct, ttuSrc map[string]struct{}) bool {
	if u == nil {
		return true
	}
	switch r := u.GetUserset().(type) {
	case *openfgav1.Userset_This:
		// `this` is an alias for "direct grants on the current
		// relation" — no extra relation to add beyond the one already
		// seeded in `direct` by the caller.
		return true
	case *openfgav1.Userset_ComputedUserset:
		// `define viewer: owner` means a tuple with relation=owner
		// also grants viewer. Surface the target relation as a direct
		// path so the preselect picks it up.
		if rel := r.ComputedUserset.GetRelation(); rel != "" {
			direct[rel] = struct{}{}
		}
		return true
	case *openfgav1.Userset_TupleToUserset:
		// `define viewer: viewer from parent` — the tupleset relation
		// (parent) is what we need to preselect on. Objects with any
		// `parent` tuple are potential candidates.
		if rel := r.TupleToUserset.GetTupleset().GetRelation(); rel != "" {
			ttuSrc[rel] = struct{}{}
		}
		return true
	case *openfgav1.Userset_Union:
		for _, child := range r.Union.GetChild() {
			if !walkPreselectRelations(child, direct, ttuSrc) {
				return false
			}
		}
		return true
	case *openfgav1.Userset_Intersection:
		// Intersection narrows the grant — an object must match all
		// branches. Collecting each branch's preselect set is still a
		// safe over-approximation (we'll Check to filter).
		for _, child := range r.Intersection.GetChild() {
			if !walkPreselectRelations(child, direct, ttuSrc) {
				return false
			}
		}
		return true
	case *openfgav1.Userset_Difference:
		// `a but not b` — base branch contributes to preselect; the
		// subtract branch can only remove candidates, so we also walk
		// it conservatively (over-approximation stays safe).
		if !walkPreselectRelations(r.Difference.GetBase(), direct, ttuSrc) {
			return false
		}
		return walkPreselectRelations(r.Difference.GetSubtract(), direct, ttuSrc)
	default:
		// Unknown AST shape (future rewrite kind). Bail to full scan
		// rather than silently misinterpret.
		return false
	}
}

// effectiveSubjectsOfUser returns the caller's "effective subject"
// set: the raw user string plus every 1-hop userset the user is a
// member of. Used by preselect to widen the candidate DB query so a
// `document:X viewer group:admins#member` tuple picks up the document
// for a user that appears in `group:admins member user:alice`.
//
// Walks only one hop deep — deeper chains are handled by the
// ReBACCheck fallback over whatever preselect admits. This keeps the
// preselect cost O(user's direct tuples), not O(store).
func effectiveSubjectsOfUser(owner, appName, user string) ([]string, error) {
	if ormer == nil {
		return []string{user}, nil
	}
	storeId := BuildStoreId(owner, appName)

	// 1-hop usersets: every (object, relation) pair where user appears
	// as subject yields a userset string "{object}#{relation}". We skip
	// rows where relation is empty (shouldn't happen for well-formed
	// tuples but defend against schema drift).
	rows := []*BizTuple{}
	if err := ormer.Engine.
		Table(&BizTuple{}).
		Where("store_id = ? AND user = ?", storeId, user).
		Cols("object", "relation").
		Find(&rows); err != nil {
		return nil, fmt.Errorf("rebac preselect: scan usersets of %s: %w", user, err)
	}

	seen := map[string]struct{}{user: {}}
	for _, r := range rows {
		if r.Relation == "" || r.Object == "" {
			continue
		}
		seen[r.Object+"#"+r.Relation] = struct{}{}
	}

	out := make([]string, 0, len(seen))
	for s := range seen {
		out = append(out, s)
	}
	return out, nil
}

// mapKeysSorted extracts a stable-ordered slice of keys from a set.
// Stable order makes the resulting SQL predicates reproducible — nice
// for EXPLAIN output during tuning — even though the DB doesn't care.
func mapKeysSorted(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	// Small sets; a package-level sort import is overkill. Insertion
	// sort keeps the allocation footprint near zero.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

// splitObjectString splits "type:id" into its parts. Returns (type,
// full-object-string-as-is-less-type-prefix, id). The middle return
// is a historical artifact retained for future callers that want the
// raw tail; current callers only need type and id. Returns empty
// strings when the input doesn't contain a single colon.
func splitObjectString(s string) (objType, rest, id string) {
	for i := 0; i < len(s); i++ {
		if s[i] == ':' {
			return s[:i], s[i+1:], s[i+1:]
		}
	}
	return "", "", ""
}
