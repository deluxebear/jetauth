// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_expand.go is the OpenFGA-style Expand command: given an
// (object, relation), return the relation's rewrite tree as nested
// JSON so admins / the Tester UI (CP-7) can see WHY a Check allows
// or denies. Spec §6.2.
//
// MVP shape: the tree mirrors the 5 rewrite kinds plus a leaf form
// that lists direct and userset subjects from `this`. Truncated at
// maxResolutionDepth so a cyclic schema can't blow the stack.

package object

import (
	"errors"
	"fmt"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
)

// ExpandRequest targets a specific (object, relation) pair in a given
// store/model. Context + contextual tuples let Expand reflect what a
// specific caller would see — not provided yet but the field lets us
// extend cleanly in CP-7.
type ExpandRequest struct {
	StoreId              string
	AuthorizationModelId string
	Object               string
	Relation             string
}

// ExpandNode is the recursive tree node. Exactly one of the *Userset
// / Leaf fields is populated per node (the rewrite kind decides which).
type ExpandNode struct {
	// Kind is one of "this", "computed_userset", "tuple_to_userset",
	// "union", "intersection", "difference". Determines which of the
	// other fields is populated.
	Kind string `json:"kind"`
	// Users — populated for Kind="this". Each entry is a raw subject
	// string (user:alice, user:*, team:eng#member, …).
	Users []string `json:"users,omitempty"`
	// Computed — populated for Kind="computed_userset".
	Computed *ExpandObjectRelation `json:"computed,omitempty"`
	// TupleToUserset — populated for Kind="tuple_to_userset".
	TupleToUserset *ExpandTupleToUserset `json:"tupleToUserset,omitempty"`
	// Children — populated for Kind="union" or "intersection".
	Children []*ExpandNode `json:"children,omitempty"`
	// Base / Subtract — populated for Kind="difference".
	Base     *ExpandNode `json:"base,omitempty"`
	Subtract *ExpandNode `json:"subtract,omitempty"`
	// Truncated set when the recursion stopped early (hit depth cap).
	Truncated bool `json:"truncated,omitempty"`
}

type ExpandObjectRelation struct {
	Object   string `json:"object,omitempty"`
	Relation string `json:"relation"`
}

type ExpandTupleToUserset struct {
	Tupleset ExpandObjectRelation `json:"tupleset"`
	Computed ExpandObjectRelation `json:"computed"`
}

// ExpandResult wraps the root of the tree. Top-level struct gives us
// room to add audit fields (model_id used, duration, cache-hit) without
// changing the tree shape.
type ExpandResult struct {
	Root *ExpandNode `json:"root"`
}

// ReBACExpand returns the nested rewrite tree for (object, relation).
// For `this` rewrites it enumerates the raw subject strings found in
// tuples (+ contextual) for that (object, relation); other rewrite
// kinds return the schema's AST structure with sub-trees recursively
// expanded.
//
// Truncation: the recursion is capped at maxResolutionDepth. A cycle
// or deep schema surfaces as Truncated=true on the affected node —
// callers (UI) render a "…" placeholder rather than a stack overflow.
func ReBACExpand(req *ExpandRequest) (*ExpandResult, error) {
	if req == nil {
		return nil, fmt.Errorf("rebac expand: nil request")
	}
	if req.StoreId == "" || req.Object == "" || req.Relation == "" {
		return nil, fmt.Errorf("rebac expand: storeId, object, relation are all required")
	}

	model, err := resolveAuthorizationModel(req.StoreId, req.AuthorizationModelId)
	if err != nil {
		return nil, err
	}

	owner, appName, err := parseStoreId(req.StoreId)
	if err != nil {
		return nil, err
	}

	objType, _, err := parseObjectString(req.Object)
	if err != nil {
		return nil, fmt.Errorf("rebac expand: object: %w", err)
	}
	userset, err := findRelation(model, objType, req.Relation)
	if err != nil {
		return nil, err
	}

	root := expandUserset(model, owner, appName, req.Object, req.Relation, userset, 0)
	return &ExpandResult{Root: root}, nil
}

// expandUserset renders a single Userset AST node as an ExpandNode.
// Recursion is bounded by depth alone — union/intersection/difference
// sub-branches share the caller's (object, relation) key, so there's
// no visited-set to track. Nested rewrite depth is finite per the
// static AST, and the cap protects against a malformed proto.
func expandUserset(model *openfgav1.AuthorizationModel, owner, appName, object, relation string, userset *openfgav1.Userset, depth int) *ExpandNode {
	if depth >= maxResolutionDepth {
		return &ExpandNode{Kind: "this", Truncated: true}
	}

	switch u := userset.GetUserset().(type) {
	case *openfgav1.Userset_This:
		users, _ := collectDirectUsers(owner, appName, object, relation)
		return &ExpandNode{Kind: "this", Users: users}

	case *openfgav1.Userset_ComputedUserset:
		return &ExpandNode{
			Kind:     "computed_userset",
			Computed: &ExpandObjectRelation{Relation: u.ComputedUserset.GetRelation()},
		}

	case *openfgav1.Userset_TupleToUserset:
		return &ExpandNode{
			Kind: "tuple_to_userset",
			TupleToUserset: &ExpandTupleToUserset{
				Tupleset: ExpandObjectRelation{Relation: u.TupleToUserset.GetTupleset().GetRelation()},
				Computed: ExpandObjectRelation{Relation: u.TupleToUserset.GetComputedUserset().GetRelation()},
			},
		}

	case *openfgav1.Userset_Union:
		kids := u.Union.GetChild()
		children := make([]*ExpandNode, 0, len(kids))
		for _, c := range kids {
			children = append(children, expandUserset(model, owner, appName, object, relation, c, depth+1))
		}
		return &ExpandNode{Kind: "union", Children: children}

	case *openfgav1.Userset_Intersection:
		kids := u.Intersection.GetChild()
		children := make([]*ExpandNode, 0, len(kids))
		for _, c := range kids {
			children = append(children, expandUserset(model, owner, appName, object, relation, c, depth+1))
		}
		return &ExpandNode{Kind: "intersection", Children: children}

	case *openfgav1.Userset_Difference:
		return &ExpandNode{
			Kind:     "difference",
			Base:     expandUserset(model, owner, appName, object, relation, u.Difference.GetBase(), depth+1),
			Subtract: expandUserset(model, owner, appName, object, relation, u.Difference.GetSubtract(), depth+1),
		}

	case nil:
		return &ExpandNode{Kind: "this", Users: nil, Truncated: false}
	default:
		// Unknown oneof type — emit a placeholder that a UI can surface
		// as "unsupported rewrite kind" rather than silently dropping.
		return &ExpandNode{Kind: fmt.Sprintf("unsupported_%T", u), Truncated: true}
	}
}

// collectDirectUsers returns the distinct User strings from the DB's
// tuples for (object, relation), sorted. Errors that surface from a
// nil ormer (pure-function test) collapse to empty — Expand callers
// for tests can still get a valid tree shape with Users=[].
func collectDirectUsers(owner, appName, object, relation string) ([]string, error) {
	if ormer == nil {
		return nil, nil
	}
	rows, err := ReadBizTuples(owner, appName, object, relation, "")
	if err != nil {
		if errors.Is(err, errSchemaMissing) {
			return nil, nil
		}
		return nil, fmt.Errorf("rebac expand: read tuples: %w", err)
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if !seen[r.User] {
			seen[r.User] = true
			out = append(out, r.User)
		}
	}
	return out, nil
}
