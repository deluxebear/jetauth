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
