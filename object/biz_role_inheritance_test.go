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
	"sync"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// ── Pure-function tests (no DB) ──

func TestValidateBizRoleScope(t *testing.T) {
	cases := []struct {
		name    string
		role    *BizRole
		wantErr string // substring match; "" means expect nil error
	}{
		{
			name:    "valid org scope",
			role:    &BizRole{Organization: "org-test", AppName: "", Name: "admin", ScopeKind: BizRoleScopeOrg},
			wantErr: "",
		},
		{
			name:    "valid app scope",
			role:    &BizRole{Organization: "org-test", AppName: "appFoo", Name: "admin", ScopeKind: BizRoleScopeApp},
			wantErr: "",
		},
		{
			name:    "org scope with non-empty app_name rejected",
			role:    &BizRole{Organization: "org-test", AppName: "appFoo", Name: "admin", ScopeKind: BizRoleScopeOrg},
			wantErr: "org-scope role must have empty app_name",
		},
		{
			name:    "app scope with empty app_name rejected",
			role:    &BizRole{Organization: "org-test", AppName: "", Name: "admin", ScopeKind: BizRoleScopeApp},
			wantErr: "app-scope role must have non-empty app_name",
		},
		{
			name:    "invalid scope_kind rejected",
			role:    &BizRole{Organization: "org-test", AppName: "appFoo", Name: "admin", ScopeKind: "global"},
			wantErr: "invalid scope_kind",
		},
		{
			name:    "empty scope_kind rejected",
			role:    &BizRole{Organization: "org-test", AppName: "appFoo", Name: "admin", ScopeKind: ""},
			wantErr: "invalid scope_kind",
		},
		{
			name:    "empty organization rejected",
			role:    &BizRole{Organization: "", AppName: "appFoo", Name: "admin", ScopeKind: BizRoleScopeApp},
			wantErr: "organization and name are required",
		},
		{
			name:    "empty name rejected (app scope)",
			role:    &BizRole{Organization: "org-test", AppName: "appFoo", Name: "", ScopeKind: BizRoleScopeApp},
			wantErr: "organization and name are required",
		},
		{
			name:    "empty name rejected (org scope)",
			role:    &BizRole{Organization: "org-test", AppName: "", Name: "", ScopeKind: BizRoleScopeOrg},
			wantErr: "organization and name are required",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBizRoleScope(tc.role)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("expected no error, got: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %q", tc.wantErr, err.Error())
			}
		})
	}
}

// ── DB-backed tests ──

var bizRoleTestInit sync.Once

func initBizRoleTestDb(t *testing.T) {
	t.Helper()
	bizRoleTestInit.Do(func() {
		oldCreateDatabase := createDatabase
		createDatabase = false
		InitConfig()
		createDatabase = oldCreateDatabase
	})
}

// newBizRoleTestOrg returns a unique org id and registers cleanup to wipe every
// biz_* row created under that org. Keeps tests isolated when run together.
func newBizRoleTestOrg(t *testing.T) string {
	t.Helper()
	initBizRoleTestDb(t)

	org := "biz-test-" + util.GenerateId()

	t.Cleanup(func() {
		// Delete role-derived rows first (FKs in spirit, even if not enforced).
		ids := []int64{}
		if err := ormer.Engine.Table(new(BizRole)).Where("organization = ?", org).Cols("id").Find(&ids); err == nil {
			for _, id := range ids {
				_, _ = ormer.Engine.Where("role_id = ?", id).Delete(&BizRoleMember{})
				_, _ = ormer.Engine.Where("parent_role_id = ? OR child_role_id = ?", id, id).Delete(&BizRoleInheritance{})
			}
		}

		// Delete any permissions for this org, plus their grantees.
		permIds := []int64{}
		if err := ormer.Engine.Table(new(BizPermission)).Where("owner = ?", org).Cols("id").Find(&permIds); err == nil {
			for _, pid := range permIds {
				_, _ = ormer.Engine.Where("permission_id = ?", pid).Delete(&BizPermissionGrantee{})
			}
		}
		_, _ = ormer.Engine.Where("owner = ?", org).Delete(&BizPermission{})
		_, _ = ormer.Engine.Where("organization = ?", org).Delete(&BizRole{})
	})

	return org
}

func mustCreateBizRole(t *testing.T, org, appName, name string) *BizRole {
	t.Helper()
	scope := BizRoleScopeApp
	if appName == "" {
		scope = BizRoleScopeOrg
	}
	r := &BizRole{
		Organization: org,
		AppName:      appName,
		Name:         name,
		ScopeKind:    scope,
		IsEnabled:    true,
	}
	ok, err := AddBizRole(r)
	if err != nil || !ok {
		t.Fatalf("AddBizRole(%s/%s/%s) failed: ok=%v err=%v", org, appName, name, ok, err)
	}
	return r
}

func mustLinkBizRoleInheritance(t *testing.T, parentId, childId int64) {
	t.Helper()
	ok, err := AddBizRoleInheritance(parentId, childId)
	if err != nil || !ok {
		t.Fatalf("AddBizRoleInheritance(parent=%d,child=%d) failed: ok=%v err=%v", parentId, childId, ok, err)
	}
}

func TestBizRoleInheritanceSelfLoopRejected(t *testing.T) {
	org := newBizRoleTestOrg(t)
	a := mustCreateBizRole(t, org, "app1", "roleA")

	_, err := AddBizRoleInheritance(a.Id, a.Id)
	if err == nil {
		t.Fatal("expected self-loop rejection, got nil error")
	}
	if !strings.Contains(err.Error(), "cannot inherit from itself") {
		t.Fatalf("expected 'cannot inherit from itself', got: %v", err)
	}
}

func TestBizRoleInheritanceCycleRejected(t *testing.T) {
	// Build A → B → C, then attempt C → A (would close the cycle).
	org := newBizRoleTestOrg(t)
	a := mustCreateBizRole(t, org, "app1", "roleA")
	b := mustCreateBizRole(t, org, "app1", "roleB")
	c := mustCreateBizRole(t, org, "app1", "roleC")

	// B inherits from A: parent=A, child=B
	mustLinkBizRoleInheritance(t, a.Id, b.Id)
	// C inherits from B: parent=B, child=C
	mustLinkBizRoleInheritance(t, b.Id, c.Id)

	// Attempt: A inherits from C (parent=C, child=A) → closes a cycle through
	// the existing edges.
	_, err := AddBizRoleInheritance(c.Id, a.Id)
	if err == nil {
		t.Fatal("expected cycle rejection, got nil error")
	}
	if !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("expected cycle-related error, got: %v", err)
	}
}

func TestBizRoleInheritanceDepthLimit(t *testing.T) {
	// Build a chain of MaxBizRoleInheritanceDepth+2 roles. Each new link
	// stacks on the last one; the final link should push total depth past
	// the cap and be rejected.
	org := newBizRoleTestOrg(t)
	n := MaxBizRoleInheritanceDepth + 2
	roles := make([]*BizRole, 0, n)
	for i := 0; i < n; i++ {
		roles = append(roles, mustCreateBizRole(t, org, "app1", "role"+util.GenerateId()))
	}

	// Link [i] → [i+1] (parent=i, child=i+1). The first MaxBizRoleInheritanceDepth
	// edges should succeed; subsequent ones push past the cap.
	var lastErr error
	var lastOkIdx int
	for i := 0; i < len(roles)-1; i++ {
		_, err := AddBizRoleInheritance(roles[i].Id, roles[i+1].Id)
		if err != nil {
			lastErr = err
			break
		}
		lastOkIdx = i
	}
	if lastErr == nil {
		t.Fatalf("expected depth-limit rejection somewhere in a chain of %d, but all %d links succeeded", n, len(roles)-1)
	}
	if !strings.Contains(lastErr.Error(), "depth") {
		t.Fatalf("expected depth-related error, got: %v (after %d successful links)", lastErr, lastOkIdx+1)
	}
}

// TestInheritanceDescendantDepthAlsoCounts verifies fix I1: when a proposed
// edge connects a deep ancestor chain to a deep descendant chain, the total
// chain length (ancestor_depth + descendant_depth) is the bound — not just
// one side.
//
// Scenario: build A → B → ... → M (depth 6 chain, 5 edges) where M is the
// tail, and a separate N → O → ... → Z (depth 6 chain, 5 edges) where N is
// the head. Attempt edge M → N: the resulting chain has 5 + 1 + 5 = 11 edges,
// which is > MaxBizRoleInheritanceDepth (10) and must be rejected.
func TestBizRoleInheritanceDescendantDepthAlsoCounts(t *testing.T) {
	org := newBizRoleTestOrg(t)

	// ancestorChain: ancestor[0] → ancestor[1] → ... → ancestor[k-1]
	// After building, ancestor[k-1] has k-1 ancestors behind it.
	// We want: ancestor-side edge count above parent = (ancestorDepth - 1)
	// i.e. walking up from ancestor[k-1] yields chain of length k-1.
	k := 6
	ancestorChain := make([]*BizRole, 0, k)
	for i := 0; i < k; i++ {
		ancestorChain = append(ancestorChain, mustCreateBizRole(t, org, "app1", "anc-"+util.GenerateId()))
	}
	for i := 0; i < k-1; i++ {
		mustLinkBizRoleInheritance(t, ancestorChain[i].Id, ancestorChain[i+1].Id)
	}

	// descendantChain: descendant[0] → descendant[1] → ... → descendant[k-1]
	descendantChain := make([]*BizRole, 0, k)
	for i := 0; i < k; i++ {
		descendantChain = append(descendantChain, mustCreateBizRole(t, org, "app1", "desc-"+util.GenerateId()))
	}
	for i := 0; i < k-1; i++ {
		mustLinkBizRoleInheritance(t, descendantChain[i].Id, descendantChain[i+1].Id)
	}

	// Proposed: ancestorChain tail → descendantChain head.
	// Total edges through new link = (k-1) ancestor + 1 + (k-1) descendant
	//                               = 2k - 1 = 11 > 10.
	parent := ancestorChain[k-1] // has k-1 ancestors above
	child := descendantChain[0]  // has k-1 descendants below

	_, err := AddBizRoleInheritance(parent.Id, child.Id)
	if err == nil {
		t.Fatalf("expected depth-limit rejection (ancestor %d + descendant %d + 1 > %d), got nil",
			k-1, k-1, MaxBizRoleInheritanceDepth)
	}
	if !strings.Contains(err.Error(), "depth") {
		t.Fatalf("expected depth-related error, got: %v", err)
	}
}

func TestBizRoleInheritanceAppInheritsFromOrg_Allowed(t *testing.T) {
	org := newBizRoleTestOrg(t)

	// org-scope parent, app-scope child
	parent := mustCreateBizRole(t, org, "", "employee")        // org-scope
	child := mustCreateBizRole(t, org, "appFoo", "senior-dev") // app-scope

	ok, err := AddBizRoleInheritance(parent.Id, child.Id)
	if err != nil {
		t.Fatalf("expected app-from-org inheritance to succeed, got error: %v", err)
	}
	if !ok {
		t.Fatal("expected AddBizRoleInheritance to affect rows")
	}
}

func TestBizRoleInheritanceOrgFromAppRejected(t *testing.T) {
	org := newBizRoleTestOrg(t)

	// app-scope parent, org-scope child (the forbidden direction)
	parent := mustCreateBizRole(t, org, "appFoo", "manager-appFoo") // app-scope
	child := mustCreateBizRole(t, org, "", "org-admin")             // org-scope

	_, err := AddBizRoleInheritance(parent.Id, child.Id)
	if err == nil {
		t.Fatal("expected org-from-app inheritance to be rejected, got nil error")
	}
	if !strings.Contains(err.Error(), "org-scope") || !strings.Contains(err.Error(), "app-scope") {
		t.Fatalf("expected cross-scope rejection error, got: %v", err)
	}
}
