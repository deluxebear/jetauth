// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

// End-to-end ListObjects tests. Seeds a BizAppConfig, saves a schema,
// writes tuples, calls ReBACListObjects, and verifies pagination +
// cursor stability.

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestListObjects_EmptyStoreReturnsEmpty(t *testing.T) {
	ensureDBForConsolidated(t)
	storeId, modelId := seedThisApp(t)

	res, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "document", Relation: "viewer", User: "user:alice",
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(res.Objects) != 0 || res.ContinuationToken != "" {
		t.Fatalf("empty store should return empty result, got %+v", res)
	}
}

func TestListObjects_SingleAllowed(t *testing.T) {
	ensureDBForConsolidated(t)
	storeId, modelId := seedThisApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "viewer", User: "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "document", Relation: "viewer", User: "user:alice",
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(res.Objects) != 1 || res.Objects[0] != "document:d1" {
		t.Fatalf("want [document:d1], got %+v", res.Objects)
	}
	if res.ContinuationToken != "" {
		t.Fatalf("no-more-results should yield empty token, got %q", res.ContinuationToken)
	}
}

func TestListObjects_MultipleFiltersByUser(t *testing.T) {
	ensureDBForConsolidated(t)
	storeId, modelId := seedThisApp(t)
	owner, appName, _ := parseStoreId(storeId)

	if _, err := AddBizTuples([]*BizTuple{
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "viewer", User: "user:alice", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "document:d2", Relation: "viewer", User: "user:bob", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "document:d3", Relation: "viewer", User: "user:alice", AuthorizationModelId: modelId},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "document", Relation: "viewer", User: "user:alice",
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(res.Objects) != 2 {
		t.Fatalf("want 2 objects for alice, got %+v", res.Objects)
	}
	// Alphabetical order courtesy of sort.Strings in gatherCandidateObjects.
	if res.Objects[0] != "document:d1" || res.Objects[1] != "document:d3" {
		t.Fatalf("order drift: %+v", res.Objects)
	}
}

func TestListObjects_PaginationCursorRoundTrip(t *testing.T) {
	ensureDBForConsolidated(t)
	storeId, modelId := seedThisApp(t)
	owner, appName, _ := parseStoreId(storeId)

	// 6 allowed documents; page_size=3 → two pages.
	var tuples []*BizTuple
	for i := 1; i <= 6; i++ {
		tuples = append(tuples, &BizTuple{
			Owner: owner, AppName: appName,
			Object:   "document:d" + string(rune('0'+i)),
			Relation: "viewer", User: "user:alice",
			AuthorizationModelId: modelId,
		})
	}
	if _, err := AddBizTuples(tuples); err != nil {
		t.Fatalf("seed: %v", err)
	}

	first, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "document", Relation: "viewer", User: "user:alice",
		PageSize: 3,
	})
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	if len(first.Objects) != 3 {
		t.Fatalf("page 1 size = %d, want 3 (%+v)", len(first.Objects), first.Objects)
	}
	if first.ContinuationToken == "" {
		t.Fatal("page 1 should yield continuation token")
	}

	second, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "document", Relation: "viewer", User: "user:alice",
		PageSize:          3,
		ContinuationToken: first.ContinuationToken,
	})
	if err != nil {
		t.Fatalf("page 2: %v", err)
	}
	if len(second.Objects) != 3 {
		t.Fatalf("page 2 size = %d, want 3 (%+v)", len(second.Objects), second.Objects)
	}
	// Pages shouldn't overlap.
	seen := map[string]bool{}
	for _, o := range first.Objects {
		seen[o] = true
	}
	for _, o := range second.Objects {
		if seen[o] {
			t.Fatalf("page 1 and page 2 both contain %s", o)
		}
	}
	if second.ContinuationToken != "" {
		t.Fatalf("page 2 should be the last, got token %q", second.ContinuationToken)
	}
}

func TestListObjects_InvalidCursor(t *testing.T) {
	ensureDBForConsolidated(t)
	storeId, modelId := seedThisApp(t)

	_, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "document", Relation: "viewer", User: "user:alice",
		ContinuationToken: "garbage!!!",
	})
	if err == nil {
		t.Fatal("expected cursor error")
	}
}

func TestListObjects_ContextualTuples(t *testing.T) {
	ensureDBForConsolidated(t)
	storeId, modelId := seedThisApp(t)

	// No persisted tuple; contextual grants document:ctx
	res, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "document", Relation: "viewer", User: "user:alice",
		ContextualTuples: []TupleKey{
			{Object: "document:ctx", Relation: "viewer", User: "user:alice"},
		},
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(res.Objects) != 1 || res.Objects[0] != "document:ctx" {
		t.Fatalf("want [document:ctx] via contextual, got %+v", res.Objects)
	}
}

func TestListObjects_UnknownObjectType(t *testing.T) {
	ensureDBForConsolidated(t)
	storeId, modelId := seedThisApp(t)

	_, err := ReBACListObjects(&ListObjectsRequest{
		StoreId: storeId, AuthorizationModelId: modelId,
		ObjectType: "widget", Relation: "viewer", User: "user:alice",
	})
	if err == nil {
		t.Fatal("expected unknown-type error")
	}
}

// TestListObjects_TTURecursion verifies the list path works with a
// schema whose allowed relation is computed via tuple_to_userset.
// Canditate generation catches document:1 because it has a parent
// tuple in the store even though no viewer tuple exists directly;
// the per-candidate ReBACCheck then resolves the indirect grant.
func TestListObjects_TTURecursion(t *testing.T) {
	ensureDBForConsolidated(t)
	owner := "rebac-list-ttu-" + util.GenerateUUID()[:8]
	appName := "app_ttu"
	seedRebacAppConfigForTest(t, owner, appName)
	res, err := SaveAuthorizationModel(owner, appName, tupleToUsersetDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save: %+v err=%v", res, err)
	}
	modelId := res.AuthorizationModelId

	if _, err := AddBizTuples([]*BizTuple{
		{Owner: owner, AppName: appName, Object: "document:d1", Relation: "parent", User: "folder:f1", AuthorizationModelId: modelId},
		{Owner: owner, AppName: appName, Object: "folder:f1", Relation: "viewer", User: "user:alice", AuthorizationModelId: modelId},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	listRes, err := ReBACListObjects(&ListObjectsRequest{
		StoreId:              BuildStoreId(owner, appName),
		AuthorizationModelId: modelId,
		ObjectType:           "document",
		Relation:             "viewer",
		User:                 "user:alice",
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(listRes.Objects) != 1 || listRes.Objects[0] != "document:d1" {
		t.Fatalf("TTU list: want [document:d1], got %+v", listRes.Objects)
	}
}
