// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for the schema conflict scanner — no DB access — so
// they run in CI. DB-bound conflict-scan coverage lives in biz_rebac_save_test.go.

package object

import "testing"

func TestFindSchemaConflicts_NoTuples(t *testing.T) {
	newSchemaKeys := []string{"document#viewer"}
	conflicts := FindSchemaConflicts(nil, newSchemaKeys, nil)
	if len(conflicts) != 0 {
		t.Fatalf("want 0 conflicts on no tuples, got %d", len(conflicts))
	}
}

func TestFindSchemaConflicts_RelationRemoved(t *testing.T) {
	tuples := []*BizTuple{
		{Id: 1, ObjectType: "document", Relation: "viewer", Object: "document:d1", User: "user:alice"},
		{Id: 2, ObjectType: "document", Relation: "editor", Object: "document:d1", User: "user:bob"},
	}
	newSchemaKeys := []string{"document#viewer"} // editor removed
	newSchemaTypes := []string{"document", "user"}
	conflicts := FindSchemaConflicts(tuples, newSchemaKeys, newSchemaTypes)
	if len(conflicts) != 1 {
		t.Fatalf("want 1 conflict, got %d: %v", len(conflicts), conflicts)
	}
	if conflicts[0].Reason != "relation document#editor no longer exists" {
		t.Fatalf("unexpected reason: %s", conflicts[0].Reason)
	}
	if conflicts[0].Object != "document:d1" {
		t.Fatalf("unexpected object: %s", conflicts[0].Object)
	}
	if conflicts[0].User != "user:bob" {
		t.Fatalf("unexpected user: %s", conflicts[0].User)
	}
}

func TestFindSchemaConflicts_TypeRemoved(t *testing.T) {
	tuples := []*BizTuple{
		{Id: 1, ObjectType: "legacy", Relation: "admin", Object: "legacy:l1", User: "user:alice"},
	}
	newSchemaKeys := []string{"document#viewer"}
	newSchemaTypes := []string{"document", "user"}
	conflicts := FindSchemaConflicts(tuples, newSchemaKeys, newSchemaTypes)
	if len(conflicts) != 1 {
		t.Fatalf("want 1 conflict, got %d: %v", len(conflicts), conflicts)
	}
	if conflicts[0].Reason != "type legacy no longer exists" {
		t.Fatalf("unexpected reason: %s", conflicts[0].Reason)
	}
}

func TestFindSchemaConflicts_TypeRemovedWinsOverRelation(t *testing.T) {
	// legacy type is removed AND legacy#admin relation would also be "missing"
	// (because the type is gone). Spec requires reporting only type removal,
	// not both.
	tuples := []*BizTuple{
		{Id: 1, ObjectType: "legacy", Relation: "admin", Object: "legacy:l1", User: "user:alice"},
	}
	newSchemaKeys := []string{} // no relations in new schema at all
	newSchemaTypes := []string{"user"}
	conflicts := FindSchemaConflicts(tuples, newSchemaKeys, newSchemaTypes)
	if len(conflicts) != 1 {
		t.Fatalf("want exactly 1 conflict (type-only), got %d: %v", len(conflicts), conflicts)
	}
	if conflicts[0].Reason != "type legacy no longer exists" {
		t.Fatalf("unexpected reason: %s", conflicts[0].Reason)
	}
}

func TestFindSchemaConflicts_AllValid(t *testing.T) {
	tuples := []*BizTuple{
		{Id: 1, ObjectType: "document", Relation: "viewer", Object: "document:d1", User: "user:alice"},
		{Id: 2, ObjectType: "document", Relation: "editor", Object: "document:d1", User: "user:bob"},
	}
	newSchemaKeys := []string{"document#viewer", "document#editor"}
	newSchemaTypes := []string{"document", "user"}
	conflicts := FindSchemaConflicts(tuples, newSchemaKeys, newSchemaTypes)
	if len(conflicts) != 0 {
		t.Fatalf("want 0 conflicts, got %d: %v", len(conflicts), conflicts)
	}
}

func TestFindSchemaConflicts_EmptyTypeSetSkipsTypeCheck(t *testing.T) {
	// If caller passes nil/empty types slice, only relation check runs.
	// (Useful for tests that don't care about type-level checks.)
	tuples := []*BizTuple{
		{Id: 1, ObjectType: "legacy", Relation: "admin", Object: "legacy:l1", User: "user:alice"},
	}
	newSchemaKeys := []string{"legacy#admin"}
	conflicts := FindSchemaConflicts(tuples, newSchemaKeys, nil)
	if len(conflicts) != 0 {
		t.Fatalf("want 0 conflicts when types unchecked, got %d", len(conflicts))
	}
}
