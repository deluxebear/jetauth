// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// TestSaveAuthorizationModel_SaveAndRead_RoundTrip exercises the full
// CP-2 save pipeline (parse + hash dedupe + conflict scan + insert +
// pointer advance) and verifies read-back via both id lookup and listing.
//
// Skipped when ormer is not initialised (unit-test process didn't load
// conf/app.conf). Task 14 smoke + CI test-db runs exercise this for
// real.
func TestSaveAuthorizationModel_SaveAndRead_RoundTrip(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}

	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_saveread"
	seedRebacAppConfigForTest(t, owner, appName)

	dsl := `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
`

	// First save — should advance.
	result, err := SaveAuthorizationModel(owner, appName, dsl, "test-user")
	if err != nil {
		t.Fatalf("first save failed: %v", err)
	}
	if result.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("want outcome=advanced, got %s", result.Outcome)
	}
	if result.AuthorizationModelId == "" {
		t.Fatalf("empty model id after advance")
	}
	firstId := result.AuthorizationModelId

	// Read back by id — must match what was saved.
	m, err := GetBizAuthorizationModel(firstId)
	if err != nil {
		t.Fatalf("get by id failed: %v", err)
	}
	if m == nil {
		t.Fatalf("model %s not found after save", firstId)
	}
	if m.SchemaDSL != dsl {
		t.Fatalf("SchemaDSL mismatch after roundtrip\n got: %q\nwant: %q", m.SchemaDSL, dsl)
	}
	if m.SchemaJSON == "" {
		t.Fatalf("SchemaJSON empty after save")
	}
	if m.SchemaHash == "" {
		t.Fatalf("SchemaHash empty after save")
	}

	// Config pointer should have advanced.
	config, err := GetBizAppConfig(util.GetId(owner, appName))
	if err != nil || config == nil {
		t.Fatalf("config read failed: err=%v config=%v", err, config)
	}
	if config.CurrentAuthorizationModelId != firstId {
		t.Fatalf("CurrentAuthorizationModelId = %q, want %q",
			config.CurrentAuthorizationModelId, firstId)
	}

	// Second save with identical DSL — unchanged, same id, no new row.
	result2, err := SaveAuthorizationModel(owner, appName, dsl, "test-user")
	if err != nil {
		t.Fatalf("resave failed: %v", err)
	}
	if result2.Outcome != SaveOutcomeUnchanged {
		t.Fatalf("want outcome=unchanged on identical save, got %s", result2.Outcome)
	}
	if result2.AuthorizationModelId != firstId {
		t.Fatalf("model id drifted on resave: %q → %q", firstId, result2.AuthorizationModelId)
	}

	// List should show exactly one model.
	models, err := ListBizAuthorizationModels(owner, appName)
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("want 1 model, got %d", len(models))
	}
	if models[0].Id != firstId {
		t.Fatalf("listed id mismatch")
	}
}

// TestSaveAuthorizationModel_DestructiveChange_Rejected verifies that a
// schema save attempting to remove a relation still referenced by tuples
// is blocked — outcome=conflict, the offending tuple is surfaced, and
// the app's current model pointer is NOT advanced. This is spec §4.2
// "schema 变更前的 tuple 校验 (OQ-3 = 拒绝保存并返回冲突列表)".
func TestSaveAuthorizationModel_DestructiveChange_Rejected(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}

	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_destr"
	seedRebacAppConfigForTest(t, owner, appName)

	// v1: document has viewer + editor.
	dslV1 := `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
    define editor: [user]
`

	v1Result, err := SaveAuthorizationModel(owner, appName, dslV1, "test-user")
	if err != nil {
		t.Fatalf("v1 save failed: %v", err)
	}
	if v1Result.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("v1 save did not advance: %+v", v1Result)
	}
	v1ModelId := v1Result.AuthorizationModelId

	// Write a tuple referencing document#editor directly, bound to v1.
	tuple := &BizTuple{
		Owner:                owner,
		AppName:              appName,
		Object:               "document:d1",
		Relation:             "editor",
		User:                 "user:alice",
		AuthorizationModelId: v1ModelId,
	}
	if _, err := AddBizTuples([]*BizTuple{tuple}); err != nil {
		t.Fatalf("seed tuple: %v", err)
	}

	// v2: drop the editor relation.
	dslV2 := `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
`

	v2Result, err := SaveAuthorizationModel(owner, appName, dslV2, "test-user")
	if err != nil {
		t.Fatalf("v2 save returned unexpected error: %v", err)
	}
	if v2Result.Outcome != SaveOutcomeConflict {
		t.Fatalf("want outcome=conflict, got %s (result=%+v)", v2Result.Outcome, v2Result)
	}
	if len(v2Result.Conflicts) != 1 {
		t.Fatalf("want 1 conflict, got %d: %+v", len(v2Result.Conflicts), v2Result.Conflicts)
	}
	conflict := v2Result.Conflicts[0]
	if conflict.Reason != "relation document#editor no longer exists" {
		t.Fatalf("unexpected conflict reason: %s", conflict.Reason)
	}
	if conflict.Object != "document:d1" || conflict.Relation != "editor" || conflict.User != "user:alice" {
		t.Fatalf("unexpected conflict fields: obj=%q rel=%q user=%q",
			conflict.Object, conflict.Relation, conflict.User)
	}

	// Current model pointer must NOT advance after a conflict.
	config, err := GetBizAppConfig(util.GetId(owner, appName))
	if err != nil || config == nil {
		t.Fatalf("config reread failed: err=%v config=%v", err, config)
	}
	if config.CurrentAuthorizationModelId != v1ModelId {
		t.Fatalf("conflict should not advance pointer; got %q want %q",
			config.CurrentAuthorizationModelId, v1ModelId)
	}

	// No new model row should have been inserted.
	models, err := ListBizAuthorizationModels(owner, appName)
	if err != nil {
		t.Fatalf("list models failed: %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("want exactly 1 model (v1) after rejected v2, got %d", len(models))
	}
}

// seedRebacAppConfigForTest creates a BizAppConfig row for the test and
// registers a t.Cleanup to tear down all derived rows (tuples, models,
// and the config itself) even if the test panics.
func seedRebacAppConfigForTest(t *testing.T, owner, appName string) {
	t.Helper()
	config := &BizAppConfig{
		Owner:       owner,
		AppName:     appName,
		DisplayName: "rebac integration test",
		Description: "seeded by biz_rebac_save_test",
		ModelType:   "rebac",
		PolicyTable: "biz_" + appName + "_policy",
		IsEnabled:   true,
		CreatedTime: util.GetCurrentTime(),
		UpdatedTime: util.GetCurrentTime(),
	}
	if _, err := AddBizAppConfig(config); err != nil {
		t.Fatalf("seed BizAppConfig: %v", err)
	}
	t.Cleanup(func() {
		_, _ = DeleteBizTuplesForApp(owner, appName)
		_, _ = DeleteBizAuthorizationModelsForApp(owner, appName)
		_, _ = DeleteBizAppConfig(config)
	})
}
