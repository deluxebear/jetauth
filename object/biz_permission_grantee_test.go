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

// mustCreateBizPermission inserts a minimally-valid BizPermission and returns
// it with Id populated.
func mustCreateBizPermission(t *testing.T, owner, appName, name string) *BizPermission {
	t.Helper()
	p := &BizPermission{
		Owner:     owner,
		AppName:   appName,
		Name:      name,
		Resources: []string{"data1"},
		Actions:   []string{"read"},
		Effect:    EffectAllow,
		IsEnabled: true,
	}
	ok, err := AddBizPermission(p)
	if err != nil || !ok {
		t.Fatalf("AddBizPermission(%s/%s/%s) failed: ok=%v err=%v", owner, appName, name, ok, err)
	}
	return p
}

// TestListPermissionsGrantedToRole — create 3 permissions, grant role "admin"
// on 2 of them; expect the reverse lookup returns exactly those 2.
func TestBizPermissionListGrantedToRole(t *testing.T) {
	org := newBizRoleTestOrg(t)

	p1 := mustCreateBizPermission(t, org, "appFoo", "perm-1")
	p2 := mustCreateBizPermission(t, org, "appFoo", "perm-2")
	p3 := mustCreateBizPermission(t, org, "appFoo", "perm-3")

	// Grant "admin" on p1 and p2 only (leave p3 ungranted).
	for _, p := range []*BizPermission{p1, p2} {
		ok, err := AddBizPermissionGrantee(&BizPermissionGrantee{
			PermissionId: p.Id,
			SubjectType:  BizPermGranteeRole,
			SubjectId:    "admin",
		}, "tester")
		if err != nil || !ok {
			t.Fatalf("AddBizPermissionGrantee(p=%d, admin) failed: ok=%v err=%v", p.Id, ok, err)
		}
	}

	got, err := ListPermissionsGrantedToRole(org, "admin")
	if err != nil {
		t.Fatalf("ListPermissionsGrantedToRole failed: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 permissions granted to admin, got %d: %+v", len(got), got)
	}

	want := map[int64]bool{p1.Id: true, p2.Id: true}
	for _, p := range got {
		if !want[p.Id] {
			t.Fatalf("unexpected permission in result: id=%d name=%s", p.Id, p.Name)
		}
		delete(want, p.Id)
	}
	if len(want) != 0 {
		t.Fatalf("missing expected permissions: %+v", want)
	}
	// Sanity: p3 (ungranted) must not appear.
	for _, p := range got {
		if p.Id == p3.Id {
			t.Fatalf("ungranted permission %d leaked into result", p3.Id)
		}
	}
}

// TestAddBizPermissionGranteeIdempotent verifies that re-adding the same
// (permission_id, subject_type, subject_id) tuple is a no-op that returns
// (true, nil) rather than a UNIQUE-violation error.
func TestAddBizPermissionGranteeIdempotent(t *testing.T) {
	org := newBizRoleTestOrg(t)
	p := mustCreateBizPermission(t, org, "appFoo", "perm-idem")

	g := &BizPermissionGrantee{
		PermissionId: p.Id,
		SubjectType:  BizPermGranteeRole,
		SubjectId:    "admin",
	}

	ok1, err1 := AddBizPermissionGrantee(g, "tester")
	if err1 != nil || !ok1 {
		t.Fatalf("first Add: ok=%v err=%v", ok1, err1)
	}

	// Clone the input; the original may have been mutated with AddedTime etc.
	g2 := &BizPermissionGrantee{
		PermissionId: p.Id,
		SubjectType:  BizPermGranteeRole,
		SubjectId:    "admin",
	}
	ok2, err2 := AddBizPermissionGrantee(g2, "tester")
	if err2 != nil {
		t.Fatalf("second Add (expected idempotent no-op) returned error: %v", err2)
	}
	if !ok2 {
		t.Fatalf("second Add expected ok=true per idempotency contract, got false")
	}

	// Exactly one row must exist for this (permission, admin) tuple.
	count, err := ormer.Engine.Where(
		"permission_id = ? AND subject_type = ? AND subject_id = ?",
		p.Id, BizPermGranteeRole, "admin",
	).Count(&BizPermissionGrantee{})
	if err != nil {
		t.Fatalf("count query error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 grantee row after idempotent double-add, got %d", count)
	}
}

// TestPermissionMultipleGranteeTypes — one permission with 3 grantees of
// distinct subject types; ListBizPermissionGrantees returns all 3.
func TestBizPermissionMultipleGranteeTypes(t *testing.T) {
	org := newBizRoleTestOrg(t)
	p := mustCreateBizPermission(t, org, "appFoo", "perm-multi")

	grants := []struct {
		subjectType string
		subjectId   string
	}{
		{BizPermGranteeUser, "alice"},
		{BizPermGranteeRole, "admin"},
		{BizPermGranteeGroup, "eng"},
	}
	for _, g := range grants {
		ok, err := AddBizPermissionGrantee(&BizPermissionGrantee{
			PermissionId: p.Id,
			SubjectType:  g.subjectType,
			SubjectId:    g.subjectId,
		}, "tester")
		if err != nil || !ok {
			t.Fatalf("AddBizPermissionGrantee(%s:%s) failed: ok=%v err=%v", g.subjectType, g.subjectId, ok, err)
		}
	}

	got, err := ListBizPermissionGrantees(p.Id)
	if err != nil {
		t.Fatalf("ListBizPermissionGrantees failed: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 grantees, got %d: %+v", len(got), got)
	}

	// Assert every expected (type, id) pair shows up.
	seen := make(map[string]bool, len(got))
	for _, r := range got {
		seen[fmt.Sprintf("%s:%s", r.SubjectType, r.SubjectId)] = true
	}
	for _, g := range grants {
		key := fmt.Sprintf("%s:%s", g.subjectType, g.subjectId)
		if !seen[key] {
			t.Fatalf("missing grantee %s in result: got %+v", key, seen)
		}
	}

	// Verify three distinct subject_types are represented.
	types := map[string]bool{}
	for _, r := range got {
		types[r.SubjectType] = true
	}
	if len(types) != 3 {
		t.Fatalf("expected 3 distinct subject_types, got %d: %+v", len(types), types)
	}
}
