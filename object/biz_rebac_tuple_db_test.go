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
	"fmt"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestReadBizTuples_PaginationOffsetLimit(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-page-" + util.GenerateUUID()[:8]
	appName := "app_pagination"
	seedRebacAppConfigForTest(t, owner, appName)
	storeId := BuildStoreId(owner, appName)

	// Save a model so writes are admissible.
	if _, err := SaveAuthorizationModel(owner, appName,
		"model\n  schema 1.1\n\ntype user\n\ntype document\n  relations\n    define viewer: [user]\n",
		"test-user", ""); err != nil {
		t.Fatal(err)
	}

	// Seed 25 tuples on document:dN viewer user:alice
	writes := make([]*BizTuple, 0, 25)
	for i := 0; i < 25; i++ {
		writes = append(writes, &BizTuple{
			Owner:    owner,
			AppName:  appName,
			StoreId:  storeId,
			Object:   fmt.Sprintf("document:d%02d", i),
			Relation: "viewer",
			User:     "user:alice",
		})
	}
	if _, err := AddBizTuples(writes); err != nil {
		t.Fatal(err)
	}

	page1, total, err := ReadBizTuples(owner, appName, "", "", "", 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 25 {
		t.Fatalf("total=%d, want 25", total)
	}
	if len(page1) != 10 {
		t.Fatalf("page1 len=%d, want 10", len(page1))
	}

	page3, total, err := ReadBizTuples(owner, appName, "", "", "", 20, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 25 {
		t.Fatalf("total page3=%d, want 25", total)
	}
	if len(page3) != 5 {
		t.Fatalf("page3 len=%d, want 5", len(page3))
	}

	// limit=0 returns everything matching (engine semantics).
	all, total, err := ReadBizTuples(owner, appName, "", "", "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total != 25 || len(all) != 25 {
		t.Fatalf("unbounded: total=%d len=%d, want 25/25", total, len(all))
	}
}

func TestReadBizTuples_ObjectTypePrefix(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-prefix-" + util.GenerateUUID()[:8]
	appName := "app_prefix"
	seedRebacAppConfigForTest(t, owner, appName)
	storeId := BuildStoreId(owner, appName)

	if _, err := SaveAuthorizationModel(owner, appName,
		"model\n  schema 1.1\n\ntype user\n\ntype document\n  relations\n    define viewer: [user]\n\ntype folder\n  relations\n    define viewer: [user]\n",
		"test-user", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := AddBizTuples([]*BizTuple{
		{Owner: owner, AppName: appName, StoreId: storeId, Object: "document:d1", Relation: "viewer", User: "user:alice"},
		{Owner: owner, AppName: appName, StoreId: storeId, Object: "document:d2", Relation: "viewer", User: "user:alice"},
		{Owner: owner, AppName: appName, StoreId: storeId, Object: "folder:f1", Relation: "viewer", User: "user:alice"},
	}); err != nil {
		t.Fatal(err)
	}

	// Prefix match — "document:" should hit two rows, not the folder.
	docs, total, err := ReadBizTuples(owner, appName, "document:", "", "", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(docs) != 2 {
		t.Fatalf("document: prefix → total=%d len=%d, want 2/2", total, len(docs))
	}
	for _, td := range docs {
		if td.Object[:9] != "document:" {
			t.Fatalf("returned non-document object: %q", td.Object)
		}
	}

	// Exact match still works.
	one, total, err := ReadBizTuples(owner, appName, "document:d1", "", "", 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(one) != 1 || one[0].Object != "document:d1" {
		t.Fatalf("exact match: total=%d len=%d obj=%q", total, len(one), one[0].Object)
	}
}

// TestAddBizTuples_DuplicateRejected verifies that the composite unique index
// uq_tuple on (store_id, object, relation, user) rejects phantom duplicates, so
// OpenFGA set semantics hold in Check/ListObjects (spec §4.4 row 188).
func TestAddBizTuples_DuplicateRejected(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-dup-" + util.GenerateUUID()[:8]
	appName := "app-dup"
	tup := &BizTuple{
		Owner:                owner,
		AppName:              appName,
		Object:               "document:doc-1",
		Relation:             "viewer",
		User:                 "user:alice",
		AuthorizationModelId: "fake-model-id",
	}
	if _, err := AddBizTuples([]*BizTuple{tup}); err != nil {
		t.Fatalf("first insert failed: %v", err)
	}
	// Re-insert identical triple (different struct instance, same key).
	dup := &BizTuple{
		Owner:                owner,
		AppName:              appName,
		Object:               "document:doc-1",
		Relation:             "viewer",
		User:                 "user:alice",
		AuthorizationModelId: "fake-model-id",
	}
	_, err := AddBizTuples([]*BizTuple{dup})
	if err == nil {
		t.Fatalf("duplicate insert unexpectedly succeeded (unique index missing?)")
	}
	_, _ = DeleteBizTuplesForApp(owner, appName)
}
