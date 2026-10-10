// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

package object

import "testing"

func seedPlatformForMigration(t *testing.T, org string) {
	t.Helper()
	roles := []*Role{
		{Owner: org, Name: "editor", DisplayName: "Editor", Users: []string{org + "/alice"}, Roles: []string{org + "/viewer"}, IsEnabled: true},
		{Owner: org, Name: "viewer", DisplayName: "Viewer", Users: []string{org + "/bob"}, IsEnabled: true},
	}
	perms := []*Permission{
		{Owner: org, Name: "read-docs", DisplayName: "Read docs", Resources: []string{"/docs"}, Actions: []string{"GET"}, Effect: "Allow", IsEnabled: true, State: "Approved", Roles: []string{org + "/viewer"}, Users: []string{org + "/carol"}},
		{Owner: org, Name: "no-actions", Resources: []string{"/x"}, IsEnabled: true},
	}
	for _, r := range roles {
		if _, err := ormer.Engine.Insert(r); err != nil {
			t.Fatal(err)
		}
	}
	for _, p := range perms {
		if _, err := ormer.Engine.Insert(p); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = ormer.Engine.Where("owner = ?", org).Delete(&Role{})
		_, _ = ormer.Engine.Where("owner = ?", org).Delete(&Permission{})
	})
}

func countBiz(t *testing.T, org string) (roles, perms int64) {
	t.Helper()
	roles, _ = ormer.Engine.Where("organization = ?", org).Count(&BizRole{})
	perms, _ = ormer.Engine.Where("owner = ?", org).Count(&BizPermission{})
	return
}

func TestMigrateFromPlatformPermission(t *testing.T) {
	org, app := newBizChangelogTestApp(t)
	seedPlatformForMigration(t, org)
	t.Cleanup(func() {
		_, _ = ormer.Engine.Where("role_id IN (SELECT id FROM biz_role WHERE organization = ?)", org).Delete(&BizRoleMember{})
		_, _ = ormer.Engine.Where("parent_role_id IN (SELECT id FROM biz_role WHERE organization = ?)", org).Delete(&BizRoleInheritance{})
		_, _ = ormer.Engine.Where("permission_id IN (SELECT id FROM biz_permission WHERE owner = ?)", org).Delete(&BizPermissionGrantee{})
	})

	// Dry run writes nothing.
	rep, err := MigrateFromPlatformPermission(org, app, "", "skip", true, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if !rep.DryRun || rep.Applied || rep.Roles.Create != 2 || rep.Permissions.Create != 1 || rep.Permissions.Failed != 1 ||
		rep.MemberAdds != 2 || rep.GranteeAdds != 2 || rep.InheritanceAdds != 1 {
		t.Fatalf("dry-run report: %+v", rep)
	}
	if r, p := countBiz(t, org); r != 0 || p != 0 {
		t.Fatalf("dry run wrote rows: roles=%d perms=%d", r, p)
	}

	ver0 := mustPolicyVersion(t, org, app)
	rep, err = MigrateFromPlatformPermission(org, app, "", "skip", false, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if !rep.Applied || !rep.Synced || rep.SyncError != "" {
		t.Fatalf("apply report: %+v", rep)
	}
	if r, p := countBiz(t, org); r != 2 || p != 1 {
		t.Fatalf("roles=%d perms=%d", r, p)
	}
	if ver1 := mustPolicyVersion(t, org, app); ver1 <= ver0 {
		t.Fatalf("policy version did not advance: %d -> %d", ver0, ver1)
	}
	editor, _ := GetBizRoleByName(org, app, "editor")
	viewer, _ := GetBizRoleByName(org, app, "viewer")
	if editor == nil || viewer == nil {
		t.Fatal("roles not created")
	}
	if ok, _ := ormer.Engine.Get(&BizRoleInheritance{ParentRoleId: editor.Id, ChildRoleId: viewer.Id}); !ok {
		t.Fatal("inheritance edge missing")
	}
	ok, err := BizEnforce(org, app, []interface{}{org + "/bob", "/docs", "GET"})
	if err != nil || !ok {
		t.Fatalf("bob (viewer) should read /docs: ok=%v err=%v", ok, err)
	}

	// Idempotent: second run with skip creates nothing and does not sync.
	rep, err = MigrateFromPlatformPermission(org, app, "", "skip", false, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if rep.Roles.Create != 0 || rep.Roles.Skip != 2 || rep.Permissions.Skip != 1 || rep.MemberAdds != 0 || rep.GranteeAdds != 0 || rep.InheritanceAdds != 0 || rep.Synced {
		t.Fatalf("second run: %+v", rep)
	}

	// Overwrite updates scalar fields but stays idempotent for relations.
	if _, err := ormer.Engine.Where("owner = ? AND name = ?", org, "editor").Cols("display_name").Update(&Role{DisplayName: "Editor v2"}); err != nil {
		t.Fatal(err)
	}
	rep, err = MigrateFromPlatformPermission(org, app, "", "overwrite", false, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if rep.Roles.Update != 2 || rep.Permissions.Update != 1 || rep.MemberAdds != 0 || rep.GranteeAdds != 0 {
		t.Fatalf("overwrite run: %+v", rep)
	}
	editor, _ = GetBizRoleByName(org, app, "editor")
	if editor.DisplayName != "Editor v2" {
		t.Fatalf("display name not overwritten: %q", editor.DisplayName)
	}
	if r, p := countBiz(t, org); r != 2 || p != 1 {
		t.Fatalf("overwrite duplicated rows: roles=%d perms=%d", r, p)
	}
}

func TestMigrateFromPlatformPermissionRejectsBadInput(t *testing.T) {
	org, app := newBizChangelogTestApp(t)
	if _, err := MigrateFromPlatformPermission(org, app, "", "merge", true, ""); err == nil {
		t.Fatal("invalid onConflict should error")
	}
	if _, err := MigrateFromPlatformPermission(org, "no-such-app", "", "skip", true, ""); err == nil {
		t.Fatal("missing app should error")
	}
}

func mustPolicyVersion(t *testing.T, owner, app string) int64 {
	t.Helper()
	cfg, err := getBizAppConfig(owner, app)
	if err != nil || cfg == nil {
		t.Fatalf("config: %v", err)
	}
	return cfg.PolicyVersion
}
