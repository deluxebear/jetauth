// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//go:build !skipCi

package object

import "testing"

// setStateWithHash is what the UI does: read the permission, then act on the fingerprint it saw.
func setStateWithHash(id, to, reason, admin string) (bool, error) {
	p, err := GetPermission(id)
	if err != nil || p == nil {
		return false, err
	}
	return SetPermissionState(id, to, reason, admin, true, p.ComputeContentHash())
}

// M4: approval is bound to the reviewed content.
func TestSetPermissionStateRejectsSwappedContent(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)

	role := &Role{Owner: owner, Name: "reader", Users: []string{owner + "/alice"}}
	if _, err := AddRole(role); err != nil {
		t.Fatal(err)
	}
	perm := newTestPermission(owner, "swap", role.GetId())
	if _, err := AddPermissionWithApproval(perm, owner+"/mallory", false); err != nil {
		t.Fatal(err)
	}
	admin := owner + "/admin"

	reviewed, err := GetPermission(perm.GetId())
	if err != nil || reviewed == nil {
		t.Fatal(err)
	}
	reviewedHash := reviewed.ComputeContentHash()

	// the submitter swaps the content while the admin has the page open
	swapped := *reviewed
	swapped.Actions = []string{"read", "delete"}
	if _, err = UpdatePermissionWithApproval(perm.GetId(), &swapped, owner+"/mallory", false); err != nil {
		t.Fatal(err)
	}

	if _, err = SetPermissionState(perm.GetId(), PermissionStateApproved, "", admin, true, reviewedHash); err == nil {
		t.Fatal("approving with a stale fingerprint must fail")
	}
	if _, err = SetPermissionState(perm.GetId(), PermissionStateApproved, "", admin, true, ""); err == nil {
		t.Fatal("approving without a fingerprint must fail")
	}
	requireRuleCount(t, perm, 0)
	if _, err = SetPermissionState(perm.GetId(), PermissionStateRejected, "no", admin, true, reviewedHash); err == nil {
		t.Fatal("rejecting with a stale fingerprint must fail")
	}
	// reject without a fingerprint stays possible
	if _, err = SetPermissionState(perm.GetId(), PermissionStateRejected, "no", admin, true, ""); err != nil {
		t.Fatal(err)
	}
}

func requireRuleCount(t *testing.T, p *Permission, want int) {
	t.Helper()
	// The rule table is created lazily by the casbin adapter; a never-approved owner may not have it yet.
	if err := ormer.Engine.Sync(new(permissionRuleRecord)); err != nil {
		t.Fatal(err)
	}
	if got := len(getPermissionRulesByPermissionID(t, p.GetId())); got != want {
		t.Fatalf("policy rows for %s: got %d, want %d", p.GetId(), got, want)
	}
}

// H2: policy rows exist only while the permission is Approved, through every state change.
func TestPermissionPolicyRowsFollowApprovalState(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)
	enableTestEnforcerCache(t)

	role := &Role{Owner: owner, Name: "reader", Users: []string{owner + "/alice"}}
	if _, err := AddRole(role); err != nil {
		t.Fatal(err)
	}
	alice := owner + "/alice"
	submitter := owner + "/mallory"
	admin := owner + "/admin"

	perm := newTestPermission(owner, "wf", role.GetId())
	if _, err := AddPermissionWithApproval(perm, submitter, false); err != nil {
		t.Fatal(err)
	}
	if perm.State != PermissionStatePending {
		t.Fatalf("state = %s", perm.State)
	}
	requireRuleCount(t, perm, 0)
	if mustEnforce(t, perm, alice) {
		t.Fatal("pending permission must not be enforced")
	}

	// approve: rows are written from the stored content
	if _, err := setStateWithHash(perm.GetId(), PermissionStateApproved, "", admin); err != nil {
		t.Fatal(err)
	}
	requireRuleCount(t, perm, 1)
	if !mustEnforce(t, perm, alice) {
		t.Fatal("approved permission must be enforced")
	}

	// a non-approver edit demotes to Pending and takes the rows away
	edited, err := GetPermission(perm.GetId())
	if err != nil || edited == nil {
		t.Fatal(err)
	}
	edited.Actions = []string{"read", "write"}
	if _, err = UpdatePermissionWithApproval(perm.GetId(), edited, submitter, false); err != nil {
		t.Fatal(err)
	}
	requireRuleCount(t, perm, 0)
	if mustEnforce(t, perm, alice) {
		t.Fatal("demoted permission must not be enforced")
	}

	// approve again, then revoke
	if _, err = setStateWithHash(perm.GetId(), PermissionStateApproved, "", admin); err != nil {
		t.Fatal(err)
	}
	requireRuleCount(t, perm, 2)
	if !mustEnforce(t, perm, alice) {
		t.Fatal("re-approved permission must be enforced")
	}
	if _, err = setStateWithHash(perm.GetId(), PermissionStatePending, "", admin); err != nil {
		t.Fatal(err)
	}
	requireRuleCount(t, perm, 0)
	if mustEnforce(t, perm, alice) {
		t.Fatal("revoked permission must not be enforced")
	}

	// reject keeps it dead
	if _, err = setStateWithHash(perm.GetId(), PermissionStateRejected, "no", admin); err != nil {
		t.Fatal(err)
	}
	requireRuleCount(t, perm, 0)
	if mustEnforce(t, perm, alice) {
		t.Fatal("rejected permission must not be enforced")
	}
}

// H2: an admin-created (Approved) permission is live immediately.
func TestPermissionAdminAddIsLive(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)

	role := &Role{Owner: owner, Name: "reader", Users: []string{owner + "/alice"}}
	if _, err := AddRole(role); err != nil {
		t.Fatal(err)
	}
	perm := newTestPermission(owner, "adm", role.GetId())
	if _, err := AddPermissionWithApproval(perm, owner+"/admin", true); err != nil {
		t.Fatal(err)
	}
	requireRuleCount(t, perm, 1)
	if !mustEnforce(t, perm, owner+"/alice") {
		t.Fatal("admin-added permission must be enforced")
	}
}

// H2: startup reconciliation removes rows that pre-date the gate, and is idempotent.
func TestReconcilePermissionPoliciesRemovesNonApprovedRows(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)

	role := &Role{Owner: owner, Name: "reader", Users: []string{owner + "/alice"}}
	if _, err := AddRole(role); err != nil {
		t.Fatal(err)
	}

	legacyPending := newTestPermission(owner, "legacy-pending", role.GetId())
	approved := newTestPermission(owner, "approved", role.GetId())
	for _, p := range []*Permission{legacyPending, approved} {
		p.State = PermissionStateApproved
		if _, err := AddPermission(p); err != nil {
			t.Fatal(err)
		}
		requireRuleCount(t, p, 1)
	}

	// simulate a deployment where the Pending permission still has live rows
	if _, err := ormer.Engine.Table(&Permission{}).Where("owner = ? AND name = ?", owner, legacyPending.Name).
		Cols("state").Update(map[string]interface{}{"state": PermissionStatePending}); err != nil {
		t.Fatal(err)
	}

	if _, err := ReconcilePermissionPolicies(); err != nil {
		t.Fatal(err)
	}
	requireRuleCount(t, legacyPending, 0)
	requireRuleCount(t, approved, 1)

	removed, err := ReconcilePermissionPolicies()
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 {
		t.Fatalf("second run removed %d, want 0 (idempotent)", removed)
	}
	requireRuleCount(t, legacyPending, 0)
	requireRuleCount(t, approved, 1)
}
