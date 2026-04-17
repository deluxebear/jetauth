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
)

// TestResolveScopedRoles_AppAndOrgBothContribute verifies the union semantics:
// when both an org-scope role and an app-scope role exist under the same name,
// ResolveScopedRoles returns both rows (neither shadows the other).
func TestBizRoleResolveScopedRoles_AppAndOrgBothContribute(t *testing.T) {
	org := newBizRoleTestOrg(t)

	orgAdmin := mustCreateBizRole(t, org, "", "admin")       // org-scope admin
	appAdmin := mustCreateBizRole(t, org, "appFoo", "admin") // app-scope admin

	rows, err := ResolveScopedRoles(org, "appFoo", "admin")
	if err != nil {
		t.Fatalf("ResolveScopedRoles failed: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows (org + app scoped admin), got %d: %+v", len(rows), rows)
	}

	// Verify both ids show up. Order is DB-defined; don't assume.
	sawOrg, sawApp := false, false
	for _, r := range rows {
		if r.Id == orgAdmin.Id {
			sawOrg = true
		}
		if r.Id == appAdmin.Id {
			sawApp = true
		}
	}
	if !sawOrg || !sawApp {
		t.Fatalf("expected both orgAdmin (%d) and appAdmin (%d) in result, got sawOrg=%v sawApp=%v",
			orgAdmin.Id, appAdmin.Id, sawOrg, sawApp)
	}
}

// TestResolveScopedRoles_OrgRoleVisibleFromAnyApp verifies that an org-scope
// role resolves from any app context, even when no app-scope row exists.
func TestBizRoleResolveScopedRoles_OrgRoleVisibleFromAnyApp(t *testing.T) {
	org := newBizRoleTestOrg(t)

	emp := mustCreateBizRole(t, org, "", "employee") // org-scope only

	rows, err := ResolveScopedRoles(org, "appFoo", "employee")
	if err != nil {
		t.Fatalf("ResolveScopedRoles failed: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected exactly 1 row (org-scope employee), got %d", len(rows))
	}
	if rows[0].Id != emp.Id {
		t.Fatalf("expected row id=%d, got id=%d", emp.Id, rows[0].Id)
	}
	if rows[0].AppName != "" {
		t.Fatalf("expected org-scope row (AppName=\"\"), got AppName=%q", rows[0].AppName)
	}
}

// TestGetBizRoles_VisibilityFromApp verifies the two visibility modes of
// GetBizRoles:
//   - appName != "": union of app-scope + org-scope roles
//   - appName == "": org-scope roles only
func TestGetBizRoles_VisibilityFromApp(t *testing.T) {
	org := newBizRoleTestOrg(t)

	orgOnly := mustCreateBizRole(t, org, "", "employee")           // org-scope
	orgAdmin := mustCreateBizRole(t, org, "", "admin")             // org-scope
	appAdmin := mustCreateBizRole(t, org, "appFoo", "admin")       // app-scope
	appMgr := mustCreateBizRole(t, org, "appFoo", "manager")       // app-scope
	_ = mustCreateBizRole(t, org, "appBar", "unrelated")           // different app

	// Case 1: appName == "appFoo" → expect orgOnly, orgAdmin, appAdmin, appMgr.
	fromApp, err := GetBizRoles(org, "appFoo")
	if err != nil {
		t.Fatalf("GetBizRoles(appFoo) failed: %v", err)
	}
	gotIds := idSet(fromApp)
	for _, want := range []*BizRole{orgOnly, orgAdmin, appAdmin, appMgr} {
		if !gotIds[want.Id] {
			t.Fatalf("GetBizRoles(appFoo) missing role %s (id=%d): got %+v", want.Name, want.Id, gotIds)
		}
	}
	// Must not include the appBar-only role.
	for _, r := range fromApp {
		if r.AppName == "appBar" {
			t.Fatalf("GetBizRoles(appFoo) leaked appBar role: %+v", r)
		}
	}

	// Case 2: appName == "" → org-scope only (orgOnly + orgAdmin).
	orgScope, err := GetBizRoles(org, "")
	if err != nil {
		t.Fatalf("GetBizRoles(\"\") failed: %v", err)
	}
	orgIds := idSet(orgScope)
	if !orgIds[orgOnly.Id] || !orgIds[orgAdmin.Id] {
		t.Fatalf("GetBizRoles(\"\") missing org-scope roles: got %+v", orgIds)
	}
	for _, r := range orgScope {
		if r.AppName != "" {
			t.Fatalf("GetBizRoles(\"\") leaked non-org-scope role: %+v", r)
		}
	}
}

func idSet(rs []*BizRole) map[int64]bool {
	out := make(map[int64]bool, len(rs))
	for _, r := range rs {
		out[r.Id] = true
	}
	return out
}
