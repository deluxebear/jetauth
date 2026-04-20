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

// TestBizEnforceWithKindNotFound verifies the NotFound classification: when
// a Site references a CasdoorApplication that never had its BizAppConfig
// created (admin skipped the Authorization tab), the enforce call must
// return kind=not_found so the gateway can surface a distinct 503 "authz
// not configured" message instead of a generic denial.
func TestBizEnforceWithKindNotFound(t *testing.T) {
	initBizRoleTestDb(t)

	org := "biz-test-" + util.GenerateId()
	appName := "app-nonexistent-" + util.GenerateId()

	allowed, kind, err := BizEnforceWithKind(org, appName, []interface{}{"alice", "/api/x", "GET"})
	if allowed {
		t.Fatalf("expected allowed=false for missing config, got true")
	}
	if kind != BizAuthzKindNotFound {
		t.Fatalf("kind = %q, want %q", kind, BizAuthzKindNotFound)
	}
	if err == nil {
		t.Fatal("expected non-nil error alongside NotFound kind")
	}
}

// TestBizEnforceWithKindDisabled verifies the Disabled classification: when
// the admin intentionally turns IsEnabled off (e.g. during an incident),
// the gateway should see kind=disabled and return 503 rather than falling
// through to a silent allow or a misleading 403.
func TestBizEnforceWithKindDisabled(t *testing.T) {
	initBizRoleTestDb(t)

	org := "biz-test-" + util.GenerateId()
	appName := "app-disabled-" + util.GenerateId()

	// Minimal model that satisfies validateBizPermissionModel — we only care
	// that the config row exists with IsEnabled=false.
	cfg := &BizAppConfig{
		Owner:   org,
		AppName: appName,
		ModelText: `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = r.sub == p.sub && r.obj == p.obj && r.act == p.act
`,
		IsEnabled: false,
	}
	ok, err := AddBizAppConfig(cfg)
	if err != nil || !ok {
		t.Fatalf("AddBizAppConfig failed: ok=%v err=%v", ok, err)
	}
	t.Cleanup(func() {
		_, _ = ormer.Engine.Where("owner = ? AND app_name = ?", org, appName).Delete(&BizAppConfig{})
	})

	allowed, kind, enforceErr := BizEnforceWithKind(org, appName, []interface{}{"alice", "/api/x", "GET"})
	if allowed {
		t.Fatalf("expected allowed=false for disabled config, got true")
	}
	if kind != BizAuthzKindDisabled {
		t.Fatalf("kind = %q, want %q", kind, BizAuthzKindDisabled)
	}
	if enforceErr == nil {
		t.Fatal("expected non-nil error alongside Disabled kind")
	}
}
