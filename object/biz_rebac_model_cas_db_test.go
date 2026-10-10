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

// TestSaveAuthorizationModelCAS covers Plan R6: a save carrying a stale
// expected model id is rejected and leaves the pointer untouched, while a
// matching one (including "" for a brand-new app) advances.
func TestSaveAuthorizationModelCAS(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-cas-" + util.GenerateUUID()[:8]
	appName := "app_cas"
	seedRebacAppConfigForTest(t, owner, appName)

	dslV1 := "model\n  schema 1.1\n\ntype user\n\ntype document\n  relations\n    define viewer: [user]\n"
	dslV2 := dslV1 + "    define editor: [user]\n"
	dslV3 := dslV2 + "    define owner: [user]\n"

	empty := ""
	r1, err := SaveAuthorizationModelCAS(owner, appName, dslV1, "t", "", &empty)
	if err != nil {
		t.Fatalf("first save with expected=\"\": %v", err)
	}

	// Stale: caller still believes there is no model.
	if _, err := SaveAuthorizationModelCAS(owner, appName, dslV2, "t", "", &empty); !errors.Is(err, ErrAuthorizationModelStale) {
		t.Fatalf("want ErrAuthorizationModelStale, got %v", err)
	}
	cfg, _ := GetBizAppConfig(util.GetId(owner, appName))
	if cfg.CurrentAuthorizationModelId != r1.AuthorizationModelId {
		t.Fatalf("pointer moved by rejected save")
	}

	// Matching expectation advances.
	cur := r1.AuthorizationModelId
	r2, err := SaveAuthorizationModelCAS(owner, appName, dslV2, "t", "", &cur)
	if err != nil {
		t.Fatalf("matching save: %v", err)
	}

	// Activate with stale expectation is rejected; with fresh one succeeds.
	if err := ActivateBizAuthorizationModelCAS(owner, appName, r1.AuthorizationModelId, &cur); !errors.Is(err, ErrAuthorizationModelStale) {
		t.Fatalf("want stale on activate, got %v", err)
	}
	cur2 := r2.AuthorizationModelId
	if err := ActivateBizAuthorizationModelCAS(owner, appName, r1.AuthorizationModelId, &cur2); err != nil {
		t.Fatalf("activate with fresh expectation: %v", err)
	}

	// nil expectation keeps legacy last-write-wins behaviour.
	if _, err := SaveAuthorizationModelCAS(owner, appName, dslV3, "t", "", nil); err != nil {
		t.Fatalf("nil expectation save: %v", err)
	}
}
