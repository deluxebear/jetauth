// Copyright 2021 The Casdoor Authors. All Rights Reserved.
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

package object

import "testing"

func TestValidatePermissionTransition(t *testing.T) {
	cases := []struct {
		name        string
		from, to    string
		admin, subm bool
		reason      string
		wantErr     bool
	}{
		{"admin approves pending", "Pending", "Approved", true, false, "", false},
		{"empty state is pending", "", "Approved", true, false, "", false},
		{"non-admin cannot approve", "Pending", "Approved", false, true, "", true},
		{"admin rejects with reason", "Pending", "Rejected", true, false, "no", false},
		{"reject needs reason", "Pending", "Rejected", true, false, "", true},
		{"non-admin cannot reject", "Pending", "Rejected", false, false, "x", true},
		{"submitter resubmits", "Rejected", "Pending", false, true, "", false},
		{"stranger cannot resubmit", "Rejected", "Pending", false, false, "", true},
		{"admin resubmits", "Rejected", "Pending", true, false, "", false},
		{"rejected cannot jump to approved", "Rejected", "Approved", true, false, "", true},
		{"admin revokes", "Approved", "Pending", true, false, "", false},
		{"submitter cannot revoke", "Approved", "Pending", false, true, "", true},
		{"approved cannot be rejected", "Approved", "Rejected", true, false, "r", true},
		{"same state noop for non-admin", "Approved", "Approved", false, false, "", false},
		{"invalid state", "Pending", "Bogus", true, false, "", true},
	}
	for _, c := range cases {
		err := ValidatePermissionTransition(c.from, c.to, c.admin, c.subm, c.reason)
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err=%v wantErr=%v", c.name, err, c.wantErr)
		}
	}
}

func TestPreparePermissionForAdd(t *testing.T) {
	p := &Permission{State: "Approved", Approver: "evil", ApproveTime: "x", Submitter: "evil"}
	if err := PreparePermissionForAdd(p, "org/bob", false); err != nil {
		t.Fatal(err)
	}
	if p.State != PermissionStatePending || p.Approver != "" || p.ApproveTime != "" || p.Submitter != "org/bob" {
		t.Fatalf("non-admin add not forced to pending: %+v", p)
	}

	p = &Permission{}
	if err := PreparePermissionForAdd(p, "built-in/admin", true); err != nil {
		t.Fatal(err)
	}
	if p.State != PermissionStateApproved || p.Approver != "admin" || p.ApproveTime == "" {
		t.Fatalf("admin default add wrong: %+v", p)
	}

	if err := PreparePermissionForAdd(&Permission{State: "Rejected"}, "built-in/admin", true); err == nil {
		t.Fatal("expected error for Rejected initial state")
	}
}

func TestApplyPermissionStateChange(t *testing.T) {
	old := &Permission{Owner: "org", State: "Pending", Submitter: "bob"}

	// non-admin forging approval is rejected
	forged := &Permission{State: "Approved", Approver: "bob", ApproveTime: "now"}
	if _, _, err := ApplyPermissionStateChange(old, forged, "org/bob", false); err == nil {
		t.Fatal("non-admin approval must fail")
	}

	// unchanged state keeps stored bookkeeping and ignores client values
	same := &Permission{State: "Pending", Approver: "evil", ApproveTime: "evil", Submitter: "evil"}
	if _, _, err := ApplyPermissionStateChange(old, same, "org/bob", false); err != nil {
		t.Fatal(err)
	}
	if same.Approver != "" || same.ApproveTime != "" || same.Submitter != "bob" {
		t.Fatalf("client values not ignored: %+v", same)
	}

	// admin approval sets approver automatically
	appr := &Permission{State: "Approved", Approver: "evil"}
	from, to, err := ApplyPermissionStateChange(old, appr, "built-in/admin", true)
	if err != nil || from != "Pending" || to != "Approved" {
		t.Fatalf("unexpected %s %s %v", from, to, err)
	}
	if appr.Approver != "admin" || appr.ApproveTime == "" {
		t.Fatalf("approver not set: %+v", appr)
	}

	// reject stores reason, resubmit clears it
	rej := &Permission{Owner: "org", State: "Rejected", RejectReason: "too broad"}
	if _, _, err = ApplyPermissionStateChange(old, rej, "built-in/admin", true); err != nil {
		t.Fatal(err)
	}
	if rej.RejectReason != "too broad" {
		t.Fatalf("reason lost: %+v", rej)
	}
	resub := &Permission{State: "Pending", RejectReason: "stale"}
	if _, _, err = ApplyPermissionStateChange(rej, resub, "org/bob", false); err != nil {
		t.Fatal(err)
	}
	if resub.RejectReason != "" || resub.Approver != "" {
		t.Fatalf("resubmit did not clear: %+v", resub)
	}
}
