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

import (
	"reflect"
	"strings"
	"testing"
)

func policyModelText(def string) string {
	return "[request_definition]\nr = sub, obj, act\n\n[policy_definition]\np = " + def + "\n\n[policy_effect]\ne = some(where (p.eft == allow))\n\n[matchers]\nm = r.sub == p.sub && r.obj == p.obj && r.act == p.act"
}

func layoutOf(t *testing.T, def string) *permissionPolicyLayout {
	t.Helper()
	m, err := GetBuiltInModel(policyModelText(def))
	if err != nil {
		t.Fatalf("GetBuiltInModel(%q): %v", def, err)
	}
	return permissionPolicyLayoutFromModel(m)
}

func TestGetBuiltInModelAcceptedShapes(t *testing.T) {
	for _, def := range []string{
		"sub, obj, act",
		"sub, obj, act, eft",
		"sub, dom, obj, act",
		"sub, dom, obj, act, eft",
		"sub, obj, act, eft, extra",
		"sub, obj, act, eft, extra, permissionId",
	} {
		m, err := GetBuiltInModel(policyModelText(def))
		if err != nil {
			t.Errorf("%q should be accepted: %v", def, err)
			continue
		}
		toks := m["p"]["p"].Tokens
		if len(toks) != permissionPolicyWidth || toks[permissionIDColumn] != "p_permissionId" {
			t.Errorf("%q: permissionId must sit on the reserved column, tokens=%v", def, toks)
		}
	}
}

func TestGetBuiltInModelRejectedShapes(t *testing.T) {
	cases := map[string]string{
		"sub, obj, act, eft, a, b":                 "sixth field",
		"sub, obj, act, eft, a, b, c":              "cannot exceed",
		"sub, permissionId, obj, act":              "only allowed",
		"sub, obj, permissionId, act, eft, extra":  "only allowed",
		"subOwner, subName, method, urlPath, o, n": "sixth field",
	}
	for def, want := range cases {
		_, err := GetBuiltInModel(policyModelText(def))
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: want error containing %q, got %v", def, want, err)
		}
	}
}

func TestPermissionPolicyRowsLegacyLayoutUnchanged(t *testing.T) {
	p := &Permission{Owner: "o", Name: "p", Users: []string{"o/u"}, Roles: []string{"o/r"}, Resources: []string{"d"}, Actions: []string{"read"}, Effect: "Allow"}

	// Default (empty-model) built-in: sub, obj, act, eft, "", permissionId.
	m, err := GetBuiltInModel("")
	if err != nil {
		t.Fatal(err)
	}
	got := permissionPolicyLayoutFromModel(m).buildRows(p)
	want := [][]string{{"o/u", "d", "read", "allow", "", "o/p"}, {"o/r", "d", "read", "allow", "", "o/p"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("default model rows = %v, want %v", got, want)
	}

	// 3-field user-model-built-in keeps writing the effect on column 3.
	got = layoutOf(t, "sub, obj, act").buildRows(p)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("3-field rows = %v, want %v", got, want)
	}

	// Explicit legacy 6-field form.
	got = layoutOf(t, "sub, obj, act, eft, extra, permissionId").buildRows(p)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("6-field rows = %v, want %v", got, want)
	}
}

func TestPermissionPolicyRowsDomainModels(t *testing.T) {
	p := &Permission{Owner: "o", Name: "p", Users: []string{"o/u"}, Resources: []string{"d"}, Actions: []string{"read"}, Effect: "Deny", Domains: []string{"d1", "d2"}}

	want := [][]string{{"o/u", "d1", "d", "read", "deny", "o/p"}, {"o/u", "d2", "d", "read", "deny", "o/p"}}
	if got := layoutOf(t, "sub, dom, obj, act, eft").buildRows(p); !reflect.DeepEqual(got, want) {
		t.Errorf("5-field domain rows = %v, want %v", got, want)
	}

	// Domain model without eft: effect goes to the first legacy-compatible free column.
	if got := layoutOf(t, "sub, dom, obj, act").buildRows(p); !reflect.DeepEqual(got, want) {
		t.Errorf("4-field domain rows = %v, want %v", got, want)
	}

	// Permission without domains on a domain model: empty domain, aligned columns.
	p2 := *p
	p2.Domains = nil
	want2 := [][]string{{"o/u", "", "d", "read", "deny", "o/p"}}
	if got := layoutOf(t, "sub, dom, obj, act, eft").buildRows(&p2); !reflect.DeepEqual(got, want2) {
		t.Errorf("domain model without domains rows = %v, want %v", got, want2)
	}

	// Domains on a model without a domain field are ignored (no duplicate rows).
	want3 := [][]string{{"o/u", "d", "read", "deny", "", "o/p"}}
	if got := layoutOf(t, "sub, obj, act, eft").buildRows(p); !reflect.DeepEqual(got, want3) {
		t.Errorf("domains on domainless model rows = %v, want %v", got, want3)
	}
}

func TestPermissionPolicyRowsRenamedAndExtraFields(t *testing.T) {
	p := &Permission{Owner: "o", Name: "p", Users: []string{"o/u"}, Resources: []string{"d"}, Actions: []string{"read"}, Effect: "Allow"}

	// Differently ordered / named fields are placed by role, extras stay empty.
	l := layoutOf(t, "user, tenant, action, resource, eft")
	want := [][]string{{"o/u", "", "read", "d", "allow", "o/p"}}
	if got := l.buildRows(p); !reflect.DeepEqual(got, want) {
		t.Errorf("renamed rows = %v, want %v", got, want)
	}
	if l.valueColumn("obj") != 3 || l.valueColumn("act") != 2 {
		t.Errorf("value columns obj=%d act=%d", l.valueColumn("obj"), l.valueColumn("act"))
	}

	// Unrecognised names fall back to the legacy positional layout.
	l = layoutOf(t, "who, thing, verb")
	want = [][]string{{"o/u", "d", "read", "allow", "", "o/p"}}
	if got := l.buildRows(p); !reflect.DeepEqual(got, want) {
		t.Errorf("unnamed rows = %v, want %v", got, want)
	}
	if l.valueColumn("obj") != 1 || l.valueColumn("act") != 2 {
		t.Errorf("legacy value columns obj=%d act=%d", l.valueColumn("obj"), l.valueColumn("act"))
	}

	// Every row, whatever the model width, carries the id on the reserved column.
	for _, def := range []string{"sub, obj, act", "sub, obj, act, eft, x", "who, thing, verb", "sub, dom, obj, act, eft"} {
		for _, row := range layoutOf(t, def).buildRows(p) {
			if len(row) != permissionPolicyWidth || row[permissionIDColumn] != "o/p" {
				t.Errorf("%q: bad row %v", def, row)
			}
		}
	}
}
