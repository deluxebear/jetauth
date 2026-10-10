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

import (
	"fmt"
	"strings"
	"testing"

	"github.com/casbin/casbin/v3"
)

func layoutDbModelText(req, def, matcher string) string {
	return fmt.Sprintf("[request_definition]\nr = %s\n\n[policy_definition]\np = %s\n\n[policy_effect]\ne = some(where (p.eft == allow))\n\n[matchers]\nm = %s", req, def, matcher)
}

func addLayoutTestModel(t *testing.T, owner, name, text string) string {
	t.Helper()
	m := &Model{Owner: owner, Name: name, ModelText: text}
	if _, err := ormer.Engine.Insert(m); err != nil {
		t.Fatalf("insert model: %v", err)
	}
	t.Cleanup(func() { _, _ = ormer.Engine.Where("owner = ?", owner).Delete(&Model{}) })
	return m.GetId()
}

func TestPermissionPolicyLayoutEndToEnd(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)
	enableTestEnforcerCache(t)
	alice := owner + "/alice"

	type tc struct {
		name    string
		req     string
		def     string
		matcher string
		domains []string
		allow   []interface{}
		deny    []interface{}
		rowLen  int
	}
	cases := []tc{
		{
			name: "f3", req: "sub, obj, act", def: "sub, obj, act",
			matcher: "r.sub == p.sub && r.obj == p.obj && r.act == p.act",
			allow:   []interface{}{alice, "data1", "read"}, deny: []interface{}{alice, "data1", "write"},
		},
		{
			name: "f4", req: "sub, obj, act", def: "sub, obj, act, eft",
			matcher: "r.sub == p.sub && r.obj == p.obj && r.act == p.act",
			allow:   []interface{}{alice, "data1", "read"}, deny: []interface{}{alice, "data2", "read"},
		},
		{
			name: "f5dom", req: "sub, dom, obj, act", def: "sub, dom, obj, act, eft",
			matcher: "r.sub == p.sub && r.dom == p.dom && r.obj == p.obj && r.act == p.act",
			domains: []string{"d1"},
			allow:   []interface{}{alice, "d1", "data1", "read"}, deny: []interface{}{alice, "d2", "data1", "read"},
		},
		{
			name: "f5extra", req: "sub, obj, act", def: "sub, obj, act, eft, tag",
			matcher: "r.sub == p.sub && r.obj == p.obj && r.act == p.act",
			allow:   []interface{}{alice, "data1", "read"}, deny: []interface{}{alice, "data1", "write"},
		},
		{
			name: "f6legacy", req: "sub, obj, act", def: "sub, obj, act, eft, extra, permissionId",
			matcher: "r.sub == p.sub && r.obj == p.obj && r.act == p.act",
			allow:   []interface{}{alice, "data1", "read"}, deny: []interface{}{alice, "data1", "write"},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			modelId := addLayoutTestModel(t, owner, "m-"+c.name, layoutDbModelText(c.req, c.def, c.matcher))
			p := &Permission{
				Owner: owner, Name: "p-" + c.name, Model: modelId, Users: []string{alice},
				Resources: []string{"data1"}, Actions: []string{"read"}, Effect: "Allow", Domains: c.domains,
			}
			if _, err := AddPermission(p); err != nil {
				t.Fatalf("AddPermission: %v", err)
			}

			rules := getPermissionRulesByPermissionID(t, p.GetId())
			if len(rules) != 1 {
				t.Fatalf("want 1 rule on the reserved column, got %d", len(rules))
			}
			if rules[0].V0 != alice {
				t.Errorf("v0 = %q", rules[0].V0)
			}

			if ok, err := Enforce(p, c.allow); err != nil || !ok {
				t.Errorf("allow request: ok=%v err=%v", ok, err)
			}
			if ok, err := Enforce(p, c.deny); err != nil || ok {
				t.Errorf("deny request: ok=%v err=%v", ok, err)
			}

			// Update replaces the rows (removal is by the reserved column).
			p.Actions = []string{"write"}
			if _, err := UpdatePermission(p.GetId(), p); err != nil {
				t.Fatalf("UpdatePermission: %v", err)
			}
			if got := len(getPermissionRulesByPermissionID(t, p.GetId())); got != 1 {
				t.Errorf("after update want 1 rule, got %d", got)
			}
			if ok, _ := Enforce(p, c.allow); ok {
				t.Errorf("read must be revoked after update")
			}

			if _, err := DeletePermission(p); err != nil {
				t.Fatalf("DeletePermission: %v", err)
			}
			if got := len(getPermissionRulesByPermissionID(t, p.GetId())); got != 0 {
				t.Errorf("after delete want 0 rules, got %d", got)
			}
		})
	}
}

// Rows written by the old fixed layout must keep working and must be cleaned up.
func TestPermissionLegacyRowsStillWorkAndAreRemoved(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)
	alice := owner + "/alice"

	p := &Permission{Owner: owner, Name: "legacy", Users: []string{alice}, Resources: []string{"data1"}, Actions: []string{"read"}, Effect: "Allow"}
	if _, err := ormer.Engine.Insert(p); err != nil {
		t.Fatal(err)
	}
	// Legacy no-model layout as the old getPolicies wrote it.
	legacy := &permissionRuleRecord{Ptype: "p", V0: alice, V1: "data1", V2: "read", V3: "allow", V4: "", V5: p.GetId()}
	if _, err := ormer.Engine.Insert(legacy); err != nil {
		t.Fatal(err)
	}

	if ok, err := Enforce(p, []interface{}{alice, "data1", "read"}); err != nil || !ok {
		t.Fatalf("legacy row not honoured: ok=%v err=%v", ok, err)
	}

	// Regenerated rows are identical to the legacy ones.
	rows := getPolicies(p)
	if len(rows) != 1 || strings.Join(rows[0], "|") != strings.Join([]string{alice, "data1", "read", "allow", "", p.GetId()}, "|") {
		t.Fatalf("regenerated rows differ from legacy: %v", rows)
	}

	if err := removePolicies(p); err != nil {
		t.Fatal(err)
	}
	if got := len(getPermissionRulesByPermissionID(t, p.GetId())); got != 0 {
		t.Errorf("legacy row not removed, %d left", got)
	}
}

func TestPermissionGetAllObjectsActionsFollowLayout(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)
	alice := owner + "/alice"

	modelId := addLayoutTestModel(t, owner, "m-dom", layoutDbModelText("sub, dom, obj, act", "sub, dom, obj, act, eft",
		"r.sub == p.sub && r.dom == p.dom && r.obj == p.obj && r.act == p.act"))
	p := &Permission{
		Owner: owner, Name: "p-dom", Model: modelId, Users: []string{alice}, Domains: []string{"d1"},
		Resources: []string{"data1"}, Actions: []string{"read"}, Effect: "Allow",
	}
	if _, err := AddPermission(p); err != nil {
		t.Fatal(err)
	}

	enforcer, err := getPermissionEnforcer(p)
	if err != nil {
		t.Fatal(err)
	}
	objs, err := getPolicyFieldValuesByColumn([]*casbin.Enforcer{enforcer}, "obj")
	if err != nil || len(objs) != 1 || objs[0] != "data1" {
		t.Errorf("objects = %v err=%v", objs, err)
	}
	acts, err := getPolicyFieldValuesByColumn([]*casbin.Enforcer{enforcer}, "act")
	if err != nil || len(acts) != 1 || acts[0] != "read" {
		t.Errorf("actions = %v err=%v", acts, err)
	}
}
