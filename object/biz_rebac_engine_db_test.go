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
	"strings"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// TestResolveAuthorizationModel_ByExplicitId verifies the happy path: when
// the caller knows the exact model id, the helper returns the parsed proto
// for that id.
func TestResolveAuthorizationModel_ByExplicitId(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_resolve_explicit"
	seedRebacAppConfigForTest(t, owner, appName)

	res, err := SaveAuthorizationModel(owner, appName, minimalDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save: err=%v outcome=%v", err, res)
	}

	proto, err := resolveAuthorizationModel(BuildStoreId(owner, appName), res.AuthorizationModelId)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if proto == nil {
		t.Fatal("proto is nil")
	}
	if len(proto.GetTypeDefinitions()) != 2 {
		t.Fatalf("typeDefs = %d, want 2 (user, document)", len(proto.GetTypeDefinitions()))
	}
}

// TestResolveAuthorizationModel_FallbackToCurrent verifies the common form —
// modelId empty — returns the app's current model pointer.
func TestResolveAuthorizationModel_FallbackToCurrent(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_resolve_current"
	seedRebacAppConfigForTest(t, owner, appName)

	if _, err := SaveAuthorizationModel(owner, appName, minimalDSL, "test-user"); err != nil {
		t.Fatalf("save: %v", err)
	}

	proto, err := resolveAuthorizationModel(BuildStoreId(owner, appName), "")
	if err != nil {
		t.Fatalf("resolve with empty id: %v", err)
	}
	if proto == nil {
		t.Fatal("proto is nil after fallback")
	}
}

// TestResolveAuthorizationModel_NoCurrentModel verifies an app that has
// never saved a schema surfaces a specific error rather than returning nil.
func TestResolveAuthorizationModel_NoCurrentModel(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_no_current"
	seedRebacAppConfigForTest(t, owner, appName)

	_, err := resolveAuthorizationModel(BuildStoreId(owner, appName), "")
	if err == nil || !strings.Contains(err.Error(), "no authorization model") {
		t.Fatalf("want 'no authorization model' error, got: %v", err)
	}
}

// TestResolveAuthorizationModel_UnknownId verifies non-existent model ids
// yield "not found", not nil.
func TestResolveAuthorizationModel_UnknownId(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_unknown_id"
	seedRebacAppConfigForTest(t, owner, appName)

	_, err := resolveAuthorizationModel(BuildStoreId(owner, appName), "nonexistent-id-xxxx")
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("want 'not found' error, got: %v", err)
	}
}

// --- checkThis (Task 4) end-to-end ----------------------------------------

// seedThisApp creates a ReBAC BizAppConfig, saves minimalDSL as the
// authorization model, and returns (storeId, modelId). Used by every
// TestCheck_This_* case.
func seedThisApp(t *testing.T) (storeId, modelId string) {
	t.Helper()
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_check_this"
	seedRebacAppConfigForTest(t, owner, appName)
	res, err := SaveAuthorizationModel(owner, appName, minimalDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save minimalDSL: err=%v outcome=%v", err, res)
	}
	return BuildStoreId(owner, appName), res.AuthorizationModelId
}

func TestCheck_This_ExactMatch(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedThisApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{{
		Owner:                owner,
		AppName:              appName,
		Object:               "document:d1",
		Relation:             "viewer",
		User:                 "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("write tuple: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId:              storeId,
		AuthorizationModelId: modelId,
		TupleKey:             TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("want allowed, got denied")
	}
}

func TestCheck_This_NoMatch(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedThisApp(t)

	res, err := ReBACCheck(&CheckRequest{
		StoreId:              storeId,
		AuthorizationModelId: modelId,
		TupleKey:             TupleKey{Object: "document:d1", Relation: "viewer", User: "user:bob"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("want denied, got allowed")
	}
}

func TestCheck_This_WildcardGrantsPlainUser(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedThisApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "viewer", User: "user:*",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("write wildcard: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:anyone"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("user:* should grant user:anyone, got denied")
	}
}

func TestCheck_This_WildcardDoesNotCrossType(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedThisApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "viewer", User: "team:*",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("write wildcard: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("team:* must not grant user:alice, got allowed")
	}
}

func TestCheck_This_ContextualTuple(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedThisApp(t)

	// No DB tuple — but contextual says allow.
	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
		ContextualTuples: []TupleKey{
			{Object: "document:d1", Relation: "viewer", User: "user:alice"},
		},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("contextual tuple must grant, got denied")
	}
}

func TestCheck_This_CrossStoreIsolation(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}

	// Store A has a matching tuple.
	storeA, modelA := seedThisApp(t)
	ownerA, appA, _ := parseStoreId(storeA)
	if _, err := AddBizTuples([]*BizTuple{{
		Owner: ownerA, AppName: appA,
		Object: "document:d1", Relation: "viewer", User: "user:alice",
		AuthorizationModelId: modelA,
	}}); err != nil {
		t.Fatalf("seed A tuple: %v", err)
	}

	// Store B — separate, no tuple.
	storeB, modelB := seedThisApp(t)

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeB, AuthorizationModelId: modelB,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check B: %v", err)
	}
	if res.Allowed {
		t.Fatalf("store B must not see store A's tuple, got allowed")
	}
}

// --- checkComputedUserset (Task 5) end-to-end -----------------------------

const computedUsersetDSL = `model
  schema 1.1

type user

type document
  relations
    define editor: [user]
    define viewer: editor
`

func seedComputedUsersetApp(t *testing.T) (storeId, modelId string) {
	t.Helper()
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_computed_userset"
	seedRebacAppConfigForTest(t, owner, appName)
	res, err := SaveAuthorizationModel(owner, appName, computedUsersetDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save: err=%v outcome=%v", err, res)
	}
	return BuildStoreId(owner, appName), res.AuthorizationModelId
}

func TestCheck_ComputedUserset_RedirectsToReferenced(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedComputedUsersetApp(t)
	owner, appName, _ := parseStoreId(storeId)

	// user:alice is editor → should be viewer via computed_userset.
	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "editor", User: "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("editor user should be viewer via computed_userset, got denied")
	}
}

func TestCheck_ComputedUserset_NoEditorNoViewer(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedComputedUsersetApp(t)

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("no editor tuple should mean no viewer, got allowed")
	}
}

// --- checkTupleToUserset (Task 6) end-to-end ------------------------------

const tupleToUsersetDSL = `model
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

func seedTupleToUsersetApp(t *testing.T) (storeId, modelId string) {
	t.Helper()
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_ttu"
	seedRebacAppConfigForTest(t, owner, appName)
	res, err := SaveAuthorizationModel(owner, appName, tupleToUsersetDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save: err=%v outcome=%v", err, res)
	}
	return BuildStoreId(owner, appName), res.AuthorizationModelId
}

func TestCheck_TupleToUserset_ViewerViaParent(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedTupleToUsersetApp(t)
	owner, appName, _ := parseStoreId(storeId)

	// document:d1 -parent-> folder:f1; folder:f1 has viewer user:alice.
	if _, err := AddBizTuples([]*BizTuple{
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "parent", User: "folder:f1", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "folder:f1", Relation: "viewer", User: "user:alice", AuthorizationModelId: modelId},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("want allowed via parent folder, got denied")
	}
}

func TestCheck_TupleToUserset_NoParentNoAccess(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedTupleToUsersetApp(t)

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("no parent → no viewer, got allowed")
	}
}

func TestCheck_TupleToUserset_AnyParentSuffices(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedTupleToUsersetApp(t)
	owner, appName, _ := parseStoreId(storeId)

	// Two parents; only the second grants — check should still allow.
	if _, err := AddBizTuples([]*BizTuple{
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "parent", User: "folder:empty", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "parent", User: "folder:granting", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "folder:granting", Relation: "viewer", User: "user:bob", AuthorizationModelId: modelId},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:bob"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("one of two parents grants — must allow")
	}
}

// --- checkUnion (Task 7) end-to-end ---------------------------------------

const unionDSL = `model
  schema 1.1

type user

type document
  relations
    define editor: [user]
    define viewer: [user] or editor
`

func seedUnionApp(t *testing.T) (storeId, modelId string) {
	t.Helper()
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_union"
	seedRebacAppConfigForTest(t, owner, appName)
	res, err := SaveAuthorizationModel(owner, appName, unionDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save: err=%v outcome=%v", err, res)
	}
	return BuildStoreId(owner, appName), res.AuthorizationModelId
}

func TestCheck_Union_DirectBranchAllows(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedUnionApp(t)
	owner, appName, _ := parseStoreId(storeId)

	// Direct viewer tuple (via `[user]` branch).
	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "viewer", User: "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("direct viewer must allow, got denied")
	}
}

func TestCheck_Union_IndirectBranchAllows(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedUnionApp(t)
	owner, appName, _ := parseStoreId(storeId)

	// Editor tuple — viewer granted via `or editor` branch.
	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "editor", User: "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("editor → viewer via union, got denied")
	}
}

func TestCheck_Union_NoBranchAllows(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedUnionApp(t)

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:ghost"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("no grants → denied, got allowed")
	}
}

// --- checkIntersection (Task 8) end-to-end --------------------------------

const intersectionDSL = `model
  schema 1.1

type user

type document
  relations
    define active: [user]
    define allowed: [user]
    define viewer: allowed and active
`

func seedIntersectionApp(t *testing.T) (storeId, modelId string) {
	t.Helper()
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_intersect"
	seedRebacAppConfigForTest(t, owner, appName)
	res, err := SaveAuthorizationModel(owner, appName, intersectionDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save: err=%v outcome=%v", err, res)
	}
	return BuildStoreId(owner, appName), res.AuthorizationModelId
}

func TestCheck_Intersection_AllTrueAllows(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedIntersectionApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "allowed", User: "user:alice", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "active", User: "user:alice", AuthorizationModelId: modelId},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("allowed ∧ active must grant, got denied")
	}
}

func TestCheck_Intersection_OneFalseDenies(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedIntersectionApp(t)
	owner, appName, _ := parseStoreId(storeId)

	// Only `allowed`, missing `active`.
	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "allowed", User: "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("allowed without active must deny, got allowed")
	}
}

// --- checkDifference (Task 9) end-to-end ----------------------------------

const differenceDSL = `model
  schema 1.1

type user

type document
  relations
    define banned: [user]
    define granted: [user]
    define viewer: granted but not banned
`

func seedDifferenceApp(t *testing.T) (storeId, modelId string) {
	t.Helper()
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "app_diff"
	seedRebacAppConfigForTest(t, owner, appName)
	res, err := SaveAuthorizationModel(owner, appName, differenceDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save: err=%v outcome=%v", err, res)
	}
	return BuildStoreId(owner, appName), res.AuthorizationModelId
}

func TestCheck_Difference_GrantedNotBannedAllows(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedDifferenceApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "granted", User: "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("granted and not banned must allow, got denied")
	}
}

func TestCheck_Difference_GrantedAndBannedDenies(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedDifferenceApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "granted", User: "user:alice", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "banned", User: "user:alice", AuthorizationModelId: modelId},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("banned must deny even if granted, got allowed")
	}
}

func TestCheck_Difference_NotGrantedDenies(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	storeId, modelId := seedDifferenceApp(t)

	res, err := ReBACCheck(&CheckRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Allowed {
		t.Fatalf("not granted must deny, got allowed")
	}
}

// --- resolveAuthorizationModel (Task 2) end-to-end --------------------------

// TestResolveAuthorizationModel_CrossStore verifies a model id that belongs
// to a different store collapses to "not found" — the caller must not be
// able to probe another tenant's model-id namespace (spec §7.2).
func TestResolveAuthorizationModel_CrossStore(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}

	// Store A has a saved model.
	ownerA := "rebac-it-" + util.GenerateUUID()[:8]
	appA := "app_cross_a"
	seedRebacAppConfigForTest(t, ownerA, appA)
	resA, err := SaveAuthorizationModel(ownerA, appA, minimalDSL, "test-user")
	if err != nil || resA.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("A save: err=%v outcome=%v", err, resA)
	}

	// Store B tries to read A's model id.
	ownerB := "rebac-it-" + util.GenerateUUID()[:8]
	appB := "app_cross_b"
	seedRebacAppConfigForTest(t, ownerB, appB)

	_, err = resolveAuthorizationModel(BuildStoreId(ownerB, appB), resA.AuthorizationModelId)
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("cross-store resolve: want 'not found' error, got: %v", err)
	}
}
