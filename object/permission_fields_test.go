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

import (
	"errors"
	"testing"
)

const aclModelText = `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = r.sub == p.sub && r.obj == p.obj && r.act == p.act`

const rbacDomainModelText = `[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.obj == p.obj && r.act == p.act`

func TestGetPermissionModelSupport(t *testing.T) {
	cases := []struct {
		name       string
		text       string
		role, doma bool
	}{
		{"built-in default", "", true, false},
		{"acl", aclModelText, false, false},
		{"rbac with domains", rbacDomainModelText, true, true},
	}
	for _, c := range cases {
		m, err := GetBuiltInModel(c.text)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		got := GetPermissionModelSupport(m)
		if got.HasRole != c.role || got.HasDomain != c.doma {
			t.Errorf("%s: got %+v", c.name, got)
		}
	}
}

func TestValidatePermissionFieldValues(t *testing.T) {
	full := func() *Permission {
		return &Permission{Users: []string{"a/u"}, Resources: []string{"app"}, Actions: []string{"Read"}}
	}
	rbac := PermissionModelSupport{HasRole: true}
	acl := PermissionModelSupport{}
	dom := PermissionModelSupport{HasRole: true, HasDomain: true}

	assertMsg := func(name string, err error, want string) {
		t.Helper()
		var ve *PermissionValidationError
		if want == "" {
			if err != nil {
				t.Errorf("%s: unexpected %v", name, err)
			}
			return
		}
		if !errors.As(err, &ve) || ve.Msg != want {
			t.Errorf("%s: got %v want %q", name, err, want)
		}
	}

	assertMsg("ok", validatePermissionFieldValues(full(), rbac, true), "")

	p := full()
	p.Users = nil
	assertMsg("no subject", validatePermissionFieldValues(p, rbac, true), PermissionErrNoSubject)
	p.Groups = []string{"a/g"}
	assertMsg("groups are not a subject", validatePermissionFieldValues(p, rbac, true), PermissionErrNoSubject)
	p.Roles = []string{"a/r"}
	assertMsg("role subject ok with role model", validatePermissionFieldValues(p, rbac, true), "")
	assertMsg("role subject ignored without role model", validatePermissionFieldValues(p, acl, true), PermissionErrNoSubject)

	p = full()
	p.Resources = nil
	assertMsg("no resource", validatePermissionFieldValues(p, rbac, true), PermissionErrNoRes)
	p = full()
	p.Actions = nil
	assertMsg("no action", validatePermissionFieldValues(p, rbac, true), PermissionErrNoAction)

	p = full()
	p.Domains = []string{"d1"}
	assertMsg("domains rejected", validatePermissionFieldValues(p, rbac, true), PermissionErrDomains)
	assertMsg("unchanged legacy domains tolerated", validatePermissionFieldValues(p, rbac, false), "")
	assertMsg("domains ok", validatePermissionFieldValues(p, dom, true), "")
}

func TestPermissionPolicyFieldsChanged(t *testing.T) {
	base := func() *Permission {
		return &Permission{Users: []string{"a", "b"}, Resources: []string{"r"}, Actions: []string{"Read"}, Effect: "Allow", Model: "m"}
	}
	if permissionPolicyFieldsChanged(base(), base()) {
		t.Error("identical must not be changed")
	}
	reordered := base()
	reordered.Users = []string{"b", "a"}
	if permissionPolicyFieldsChanged(base(), reordered) {
		t.Error("order must not matter")
	}
	nilVsEmpty := base()
	nilVsEmpty.Domains = []string{}
	if permissionPolicyFieldsChanged(base(), nilVsEmpty) {
		t.Error("nil vs empty must not matter")
	}
	mutators := map[string]func(*Permission){
		"users":   func(p *Permission) { p.Users = []string{"a"} },
		"roles":   func(p *Permission) { p.Roles = []string{"x"} },
		"groups":  func(p *Permission) { p.Groups = []string{"x"} },
		"domains": func(p *Permission) { p.Domains = []string{"x"} },
		"res":     func(p *Permission) { p.Resources = []string{"z"} },
		"actions": func(p *Permission) { p.Actions = []string{"Write"} },
		"effect":  func(p *Permission) { p.Effect = "Deny" },
		"model":   func(p *Permission) { p.Model = "n" },
		"enabled": func(p *Permission) { p.IsEnabled = true },
	}
	for name, fn := range mutators {
		p := base()
		fn(p)
		if !permissionPolicyFieldsChanged(base(), p) {
			t.Errorf("%s change not detected", name)
		}
	}
	meta := base()
	meta.DisplayName = "changed"
	meta.Description = "changed"
	if permissionPolicyFieldsChanged(base(), meta) {
		t.Error("metadata must not count")
	}
}

func TestDemoteOnContentChange(t *testing.T) {
	old := &Permission{State: PermissionStateApproved, Approver: "root", ApproveTime: "t", Users: []string{"a"}}

	edited := *old
	edited.Users = []string{"a", "b"}
	if !demoteOnContentChange(old, &edited, PermissionStateApproved, PermissionStateApproved, false) {
		t.Fatal("non-admin content edit of Approved must demote")
	}
	if edited.State != PermissionStatePending || edited.Approver != "" || edited.ApproveTime != "" {
		t.Fatalf("not reset: %+v", edited)
	}

	adminEdit := *old
	adminEdit.Users = []string{"a", "b"}
	if demoteOnContentChange(old, &adminEdit, PermissionStateApproved, PermissionStateApproved, true) || adminEdit.State != PermissionStateApproved {
		t.Fatal("admin edit must keep state")
	}

	meta := *old
	meta.DisplayName = "x"
	if demoteOnContentChange(old, &meta, PermissionStateApproved, PermissionStateApproved, false) || meta.State != PermissionStateApproved {
		t.Fatal("metadata-only edit must keep state")
	}

	rej := &Permission{State: PermissionStateRejected, RejectReason: "no", Users: []string{"a"}}
	rejEdit := *rej
	rejEdit.Actions = []string{"Read"}
	if !demoteOnContentChange(rej, &rejEdit, PermissionStateRejected, PermissionStateRejected, false) || rejEdit.State != PermissionStatePending || rejEdit.RejectReason != "" {
		t.Fatal("non-admin content edit of Rejected must demote")
	}

	pend := &Permission{State: PermissionStatePending, Users: []string{"a"}}
	pendEdit := *pend
	pendEdit.Users = []string{"b"}
	if demoteOnContentChange(pend, &pendEdit, PermissionStatePending, PermissionStatePending, false) {
		t.Fatal("Pending stays Pending without demotion")
	}

	// explicit transition (from != to) is handled by the state machine, not demotion
	if demoteOnContentChange(old, &edited, PermissionStateApproved, PermissionStatePending, false) {
		t.Fatal("must not demote on explicit transition")
	}
}
