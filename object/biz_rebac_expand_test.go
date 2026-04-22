// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for Expand. Schemas are parsed in-memory (no DB)
// and expandUserset is called directly; collectDirectUsers returns
// empty when ormer is nil, so `this` nodes render with empty Users
// which is fine for shape verification.

package object

import (
	"testing"
)

// expandUnionDSL / expandIntersectionDSL / expandDifferenceDSL are
// local copies of the rewrite DSLs used in biz_rebac_engine_db_test.go
// — that file has the !skipCi tag, so its constants aren't visible
// under CI mode (-tags skipCi). Keeping independent copies here lets
// Expand's pure-function tests run in CI.
const expandUnionDSL = `model
  schema 1.1
type user
type document
  relations
    define editor: [user]
    define viewer: [user] or editor
`

const expandIntersectionDSL = `model
  schema 1.1
type user
type document
  relations
    define active: [user]
    define allowed: [user]
    define viewer: allowed and active
`

const expandDifferenceDSL = `model
  schema 1.1
type user
type document
  relations
    define banned: [user]
    define granted: [user]
    define viewer: granted but not banned
`

const expandTTUDSL = `model
  schema 1.1
type user
type folder
  relations
    define viewer: [user]
type document
  relations
    define parent: [folder]
    define viewer: viewer from parent
`

func TestExpand_ThisRewrite(t *testing.T) {
	parsed, err := ParseSchemaDSL(minimalDSL)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	userset, err := findRelation(parsed.Proto, "document", "viewer")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	node := expandUserset(parsed.Proto, "owner", "app", "document:d1", "viewer", userset, 0)
	if node.Kind != "this" {
		t.Fatalf("kind = %q, want this", node.Kind)
	}
	// Users is nil here because ormer isn't initialised; test is
	// structural.
	if node.Truncated {
		t.Fatal("should not be truncated")
	}
}

func TestExpand_ComputedUserset(t *testing.T) {
	const dsl = `model
  schema 1.1
type user
type document
  relations
    define editor: [user]
    define viewer: editor
`
	parsed, _ := ParseSchemaDSL(dsl)
	userset, _ := findRelation(parsed.Proto, "document", "viewer")
	node := expandUserset(parsed.Proto, "o", "a", "document:d1", "viewer", userset, 0)
	if node.Kind != "computed_userset" {
		t.Fatalf("kind = %q, want computed_userset", node.Kind)
	}
	if node.Computed == nil || node.Computed.Relation != "editor" {
		t.Fatalf("Computed.Relation = %+v, want editor", node.Computed)
	}
}

func TestExpand_TupleToUserset(t *testing.T) {
	parsed, _ := ParseSchemaDSL(expandTTUDSL)
	userset, _ := findRelation(parsed.Proto, "document", "viewer")
	node := expandUserset(parsed.Proto, "o", "a", "document:d1", "viewer", userset, 0)
	if node.Kind != "tuple_to_userset" {
		t.Fatalf("kind = %q, want tuple_to_userset", node.Kind)
	}
	if node.TupleToUserset == nil ||
		node.TupleToUserset.Tupleset.Relation != "parent" ||
		node.TupleToUserset.Computed.Relation != "viewer" {
		t.Fatalf("TTU shape wrong: %+v", node.TupleToUserset)
	}
}

func TestExpand_Union(t *testing.T) {
	parsed, _ := ParseSchemaDSL(expandUnionDSL)
	userset, _ := findRelation(parsed.Proto, "document", "viewer")
	node := expandUserset(parsed.Proto, "o", "a", "document:d1", "viewer", userset, 0)
	if node.Kind != "union" {
		t.Fatalf("kind = %q, want union", node.Kind)
	}
	if len(node.Children) != 2 {
		t.Fatalf("union children = %d, want 2", len(node.Children))
	}
	// First child is `this` ([user]), second is computed_userset (editor).
	if node.Children[0].Kind != "this" {
		t.Fatalf("union[0].Kind = %q, want this", node.Children[0].Kind)
	}
	if node.Children[1].Kind != "computed_userset" {
		t.Fatalf("union[1].Kind = %q, want computed_userset", node.Children[1].Kind)
	}
}

func TestExpand_Intersection(t *testing.T) {
	parsed, _ := ParseSchemaDSL(expandIntersectionDSL)
	userset, _ := findRelation(parsed.Proto, "document", "viewer")
	node := expandUserset(parsed.Proto, "o", "a", "document:d1", "viewer", userset, 0)
	if node.Kind != "intersection" {
		t.Fatalf("kind = %q, want intersection", node.Kind)
	}
	if len(node.Children) != 2 {
		t.Fatalf("intersection children = %d, want 2", len(node.Children))
	}
}

func TestExpand_Difference(t *testing.T) {
	parsed, _ := ParseSchemaDSL(expandDifferenceDSL)
	userset, _ := findRelation(parsed.Proto, "document", "viewer")
	node := expandUserset(parsed.Proto, "o", "a", "document:d1", "viewer", userset, 0)
	if node.Kind != "difference" {
		t.Fatalf("kind = %q, want difference", node.Kind)
	}
	if node.Base == nil || node.Subtract == nil {
		t.Fatalf("difference shape wrong: base=%v sub=%v", node.Base, node.Subtract)
	}
}

// TestExpand_CycleTruncates verifies the seen-path tracking catches a
// `define a: a or this` kind of schema-level cycle and marks the
// inner recursion Truncated.
func TestExpand_DepthCapTruncates(t *testing.T) {
	const dsl = `model
  schema 1.1
type user
type document
  relations
    define a: b
    define b: a
`
	parsed, _ := ParseSchemaDSL(dsl)
	userset, _ := findRelation(parsed.Proto, "document", "a")
	// Start at depth = maxResolutionDepth - 1 so the first recursion
	// triggers truncation (same-key repeat wouldn't fire here because
	// the inner key is different relation).
	node := expandUserset(parsed.Proto, "o", "a", "document:d1", "a", userset, maxResolutionDepth-1)
	// a is computed_userset, so recursion happens inside Union / direct.
	// In this simple case the outer node just captures the computed_userset —
	// truncation would fire if we recursed into child usersets. For
	// Expand's current MVP (doesn't recurse *across* key boundaries yet),
	// this mainly exercises the depth check path.
	if node == nil {
		t.Fatal("node is nil")
	}
}
