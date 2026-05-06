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
	"errors"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestActivateBizAuthorizationModel_RepointsCurrentId(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "drive_a3_repoint"
	seedRebacAppConfigForTest(t, owner, appName)

	// Save two versions; v1 advances the pointer, then v2 advances again.
	v1, err := SaveAuthorizationModel(owner, appName,
		"model\n  schema 1.1\n\ntype user\n", "test-user", "v1")
	if err != nil {
		t.Fatal(err)
	}
	v2, err := SaveAuthorizationModel(owner, appName,
		"model\n  schema 1.1\n\ntype user\ntype document\n", "test-user", "v2")
	if err != nil {
		t.Fatal(err)
	}
	// Sanity check: pointer is at v2 now.
	cfg, err := GetBizAppConfig(owner + "/" + appName)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CurrentAuthorizationModelId != v2.AuthorizationModelId {
		t.Fatalf("setup: pointer at %q, want %q", cfg.CurrentAuthorizationModelId, v2.AuthorizationModelId)
	}

	// Roll back to v1.
	if err := ActivateBizAuthorizationModel(owner, appName, v1.AuthorizationModelId); err != nil {
		t.Fatalf("Activate v1: %v", err)
	}
	cfg, err = GetBizAppConfig(owner + "/" + appName)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CurrentAuthorizationModelId != v1.AuthorizationModelId {
		t.Fatalf("after rollback pointer at %q, want %q", cfg.CurrentAuthorizationModelId, v1.AuthorizationModelId)
	}

	// The v2 row must still exist (immutable history).
	got, err := GetBizAuthorizationModel(v2.AuthorizationModelId)
	if err != nil || got == nil {
		t.Fatalf("v2 row missing after rollback: got=%v err=%v", got, err)
	}
}

func TestActivateBizAuthorizationModel_CrossTenantNotFound(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	ownerA := "rebac-it-A-" + util.GenerateUUID()[:8]
	ownerB := "rebac-it-B-" + util.GenerateUUID()[:8]
	seedRebacAppConfigForTest(t, ownerA, "app_a")
	seedRebacAppConfigForTest(t, ownerB, "app_b")

	v, err := SaveAuthorizationModel(ownerA, "app_a",
		"model\n  schema 1.1\n\ntype user\n", "test-user", "tenant-a-v1")
	if err != nil {
		t.Fatal(err)
	}

	// Tenant B tries to activate tenant A's model id.
	err = ActivateBizAuthorizationModel(ownerB, "app_b", v.AuthorizationModelId)
	if !errors.Is(err, ErrAuthorizationModelNotFound) {
		t.Fatalf("cross-tenant: got %v, want ErrAuthorizationModelNotFound", err)
	}
	// Tenant B's pointer must be unchanged (whatever it was, not the foreign id).
	cfgB, _ := GetBizAppConfig(ownerB + "/app_b")
	if cfgB.CurrentAuthorizationModelId == v.AuthorizationModelId {
		t.Fatalf("tenant B pointer leaked to foreign id %q", v.AuthorizationModelId)
	}
}

func TestActivateBizAuthorizationModel_UnknownIdNotFound(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "drive_a3_unknown"
	seedRebacAppConfigForTest(t, owner, appName)

	err := ActivateBizAuthorizationModel(owner, appName, "non-existent-id")
	if !errors.Is(err, ErrAuthorizationModelNotFound) {
		t.Fatalf("unknown id: got %v, want ErrAuthorizationModelNotFound", err)
	}
	err = ActivateBizAuthorizationModel(owner, appName, "")
	if !errors.Is(err, ErrAuthorizationModelNotFound) {
		t.Fatalf("empty id: got %v, want ErrAuthorizationModelNotFound", err)
	}
}
