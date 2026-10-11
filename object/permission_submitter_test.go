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

package object

import "testing"

func TestIsPermissionSubmitter(t *testing.T) {
	cases := []struct {
		name      string
		submitter string
		owner     string
		operator  string
		want      bool
	}{
		{"new record, same user", "org1/bob", "org1", "org1/bob", true},
		{"new record, same name in another org", "org1/bob", "org1", "org2/bob", false},
		{"legacy record, same org", "bob", "org1", "org1/bob", true},
		{"legacy record, same name in another org", "bob", "org1", "org2/bob", false},
		{"legacy record, global admin org same name", "bob", "org1", "built-in/bob", false},
		{"application submitter", "app/m2m", "org1", "app/m2m", true},
		{"application is not a legacy bare name", "m2m", "org1", "app/m2m", false},
		{"no submitter", "", "org1", "org1/bob", false},
	}
	for _, c := range cases {
		p := &Permission{Owner: c.owner, Submitter: c.submitter}
		if got := isPermissionSubmitter(p, c.operator); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestPreparePermissionForAddRecordsFullIdentity(t *testing.T) {
	p := &Permission{}
	if err := PreparePermissionForAdd(p, "org1/bob", false); err != nil {
		t.Fatal(err)
	}
	if p.Submitter != "org1/bob" {
		t.Fatalf("submitter = %q", p.Submitter)
	}

	// an application session is recorded as itself and, as an admin, approves as itself
	app := &Permission{State: PermissionStateApproved}
	if err := PreparePermissionForAdd(app, "app/m2m", true); err != nil {
		t.Fatal(err)
	}
	if app.Submitter != "app/m2m" || app.Approver != "app/m2m" {
		t.Fatalf("app identity not recorded: submitter=%q approver=%q", app.Submitter, app.Approver)
	}
}

func TestResubmitRequiresSameOrganizationSubmitter(t *testing.T) {
	rejected := &Permission{Owner: "org1", State: PermissionStateRejected, Submitter: "bob", RejectReason: "no"}

	other := &Permission{State: PermissionStatePending}
	if _, _, err := ApplyPermissionStateChange(rejected, other, "org2/bob", false); err == nil {
		t.Fatal("a same-named user of another organization must not be able to resubmit")
	}

	own := &Permission{State: PermissionStatePending}
	if _, _, err := ApplyPermissionStateChange(rejected, own, "org1/bob", false); err != nil {
		t.Fatalf("the legacy submitter of the same organization may resubmit: %v", err)
	}
}
