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
