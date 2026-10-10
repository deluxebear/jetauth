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
)

func TestPaginationBizRolesAndPermissions(t *testing.T) {
	org := newBizRoleTestOrg(t)
	app := "pgapp"
	for i := 0; i < 5; i++ {
		if _, err := AddBizRole(&BizRole{Organization: org, AppName: app, Name: fmt.Sprintf("role-%d", i), ScopeKind: BizRoleScopeApp, IsEnabled: true}); err != nil {
			t.Fatal(err)
		}
		if _, err := ormer.Engine.Insert(&BizPermission{Owner: org, AppName: app, Name: fmt.Sprintf("perm-%d", i), Effect: "Allow", IsEnabled: true, CreatedTime: fmt.Sprintf("2026-01-0%dT00:00:00Z", i+1)}); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { _, _ = ormer.Engine.Where("owner = ?", org).Delete(&BizPermission{}) })

	q := BizListQuery{SortField: "name", SortOrder: "ascend"}
	n, err := GetBizRoleCount(org, app, q)
	if err != nil || n != 5 {
		t.Fatalf("role count=%d err=%v", n, err)
	}
	page, err := GetPaginationBizRoles(org, app, 2, 2, q)
	if err != nil || len(page) != 2 || page[0].Name != "role-2" {
		t.Fatalf("page=%v err=%v", page, err)
	}
	q.Field, q.Value = "name", "role-4"
	if n, _ := GetBizRoleCount(org, app, q); n != 1 {
		t.Fatalf("filtered count=%d", n)
	}

	pq := BizListQuery{SortField: "createdTime", SortOrder: "ascend"}
	pp, err := GetPaginationBizPermissions(org, app, 0, 3, pq)
	if err != nil || len(pp) != 3 || pp[0].Name != "perm-0" {
		t.Fatalf("perm page=%v err=%v", pp, err)
	}
	if n, _ := GetBizPermissionCount(org, app, BizListQuery{}); n != 5 {
		t.Fatalf("perm count=%d", n)
	}
	// Non-whitelisted fields are ignored (no SQL error, no filter).
	if n, err := GetBizPermissionCount(org, app, BizListQuery{Field: "owner;drop", Value: "x"}); err != nil || n != 5 {
		t.Fatalf("injection guard n=%d err=%v", n, err)
	}
}
