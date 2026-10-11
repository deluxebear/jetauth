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

package routers

import (
	"errors"
	"testing"
)

func fakeBizLookup() bizLookup {
	roles := map[int64][2]string{1: {"orgA", "roleA"}, 2: {"orgB", "roleB"}}
	perms := map[int64][2]string{10: {"orgA", "permA"}, 20: {"orgB", "permB"}}
	res := map[int64][2]string{100: {"orgA", "resA"}}
	mk := func(m map[int64][2]string) func(int64) (string, string, bool) {
		return func(id int64) (string, string, bool) {
			v, ok := m[id]
			return v[0], v[1], ok
		}
	}
	return bizLookup{role: mk(roles), perm: mk(perms), resource: mk(res)}
}

func TestResolveBizAuthzTarget(t *testing.T) {
	cases := []struct {
		name      string
		path      string
		query     map[string]string
		body      string
		wantOwner string
		wantName  string
		wantErr   bool
	}{
		{name: "appId only", path: "/api/biz-check", query: map[string]string{"appId": "orgA/app"}, wantOwner: "orgA", wantName: "app"},
		{name: "appId and matching owner", path: "/api/biz-watch-policies", query: map[string]string{"appId": "orgA/app", "owner": "orgA"}, wantOwner: "orgA", wantName: "app"},
		{name: "ATTACK query appId orgB + owner orgA", path: "/api/biz-watch-policies", query: map[string]string{"appId": "orgB/app", "owner": "orgA"}, wantErr: true},
		{name: "ATTACK query appId orgB + organization orgA", path: "/api/biz-get-user-roles", query: map[string]string{"appId": "orgB/app", "organization": "orgA"}, wantErr: true},
		{name: "ATTACK body appId orgB + organization orgA", path: "/api/biz-write-tuples", body: `{"appId":"orgB/app","organization":"orgA"}`, wantErr: true},
		{name: "ATTACK body appId orgB + owner orgA", path: "/api/biz-write-tuples", body: `{"appId":"orgB/app","owner":"orgA"}`, wantErr: true},
		{name: "ATTACK query owner orgA + body appId orgB", path: "/api/biz-write-tuples", query: map[string]string{"owner": "orgA"}, body: `{"appId":"orgB/app"}`, wantErr: true},
		{name: "ATTACK query appId orgA + body appId orgB", path: "/api/biz-check", query: map[string]string{"appId": "orgA/app"}, body: `{"appId":"orgB/app"}`, wantErr: true},
		{name: "body appId only is honoured", path: "/api/biz-write-tuples", body: `{"appId":"orgB/app"}`, wantOwner: "orgB", wantName: "app"},
		{name: "body appId and matching organization", path: "/api/biz-write-tuples", body: `{"appId":"orgA/app","organization":"orgA"}`, wantOwner: "orgA", wantName: "app"},
		{name: "ATTACK own appId + foreign roleId query", path: "/api/biz-list-role-members", query: map[string]string{"appId": "orgA/app", "roleId": "2"}, wantErr: true},
		{name: "ATTACK own organization + foreign role body", path: "/api/biz-add-role-member", body: `{"organization":"orgA","roleId":2}`, wantErr: true},
		{name: "ATTACK own role + foreign parentRoleId", path: "/api/biz-add-role-inheritance", body: `{"roleId":1,"parentRoleId":2}`, wantErr: true},
		{name: "ATTACK mixed-org bulk ids", path: "/api/biz-bulk-delete-role", body: `{"ids":[1,2]}`, wantErr: true},
		{name: "ATTACK mixed-org bulk permission ids", path: "/api/biz-bulk-delete-permission", body: `{"ids":[10,20]}`, wantErr: true},
		{name: "bulk ids same org", path: "/api/biz-bulk-delete-role", body: `{"ids":[1]}`, wantOwner: "orgA", wantName: "roleA"},
		{name: "ATTACK foreign numeric id + own owner", path: "/api/biz-update-role", query: map[string]string{"id": "2", "owner": "orgA"}, wantErr: true},
		{name: "numeric role id", path: "/api/biz-delete-role", query: map[string]string{"id": "1"}, wantOwner: "orgA", wantName: "roleA"},
		{name: "numeric permission id", path: "/api/biz-delete-permission", query: map[string]string{"id": "20"}, wantOwner: "orgB", wantName: "permB"},
		{name: "numeric resource id", path: "/api/biz-delete-app-resource", query: map[string]string{"id": "100"}, wantOwner: "orgA", wantName: "resA"},
		{name: "unknown role id denied", path: "/api/biz-delete-role", query: map[string]string{"id": "999"}, wantOwner: "", wantName: ""},
		{name: "unknown body role id denied", path: "/api/biz-add-role-member", body: `{"roleId":999}`, wantOwner: "", wantName: ""},
		{name: "unknown role id never masked by org", path: "/api/biz-list-role-members", query: map[string]string{"organization": "orgA", "roleId": "999"}, wantOwner: "", wantName: ""},
		{name: "composite string id", path: "/api/biz-update-app-config", query: map[string]string{"id": "orgA/app"}, wantOwner: "orgA", wantName: "app"},
		{name: "composite id matches appId", path: "/api/biz-update-app-config", query: map[string]string{"id": "orgA/app", "appId": "orgA/app"}, wantOwner: "orgA", wantName: "app"},
		{name: "ATTACK composite id vs owner", path: "/api/biz-update-app-config", query: map[string]string{"id": "orgB/app", "owner": "orgA"}, wantErr: true},
		{name: "organization only", path: "/api/biz-get-roles", query: map[string]string{"organization": "orgA"}, wantOwner: "orgA"},
		{name: "owner only", path: "/api/biz-get-permissions", query: map[string]string{"owner": "orgA"}, wantOwner: "orgA"},
		{name: "ATTACK organization vs owner", path: "/api/biz-get-roles", query: map[string]string{"organization": "orgA", "owner": "orgB"}, wantErr: true},
		{name: "body add role", path: "/api/biz-add-role", body: `{"organization":"orgA","name":"r"}`, wantOwner: "orgA", wantName: "r"},
		{name: "body add permission", path: "/api/biz-add-permission", body: `{"owner":"orgA","name":"p"}`, wantOwner: "orgA", wantName: "p"},
		{name: "ATTACK body organization vs owner", path: "/api/biz-add-role", body: `{"organization":"orgA","owner":"orgB"}`, wantErr: true},
		{name: "grantee body permissionId", path: "/api/biz-add-permission-grantee", body: `{"permissionId":20}`, wantOwner: "orgB", wantName: "permB"},
		{name: "malformed appId denied", path: "/api/biz-check", query: map[string]string{"appId": "noslash"}, wantOwner: "", wantName: ""},
		{name: "empty request denied", path: "/api/biz-check", wantOwner: "", wantName: ""},
		{name: "malformed body denied", path: "/api/biz-check", body: `{not json`, wantOwner: "", wantName: ""},
		{name: "malformed body keeps query target", path: "/api/biz-check", query: map[string]string{"appId": "orgA/app"}, body: `{not json`, wantOwner: "orgA", wantName: "app"},
	}

	lk := fakeBizLookup()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			q := func(k string) string { return tc.query[k] }
			owner, name, err := resolveBizAuthzTarget(tc.path, q, []byte(tc.body), lk)
			if tc.wantErr {
				if !errors.Is(err, errBizCrossOrg) {
					t.Fatalf("expected errBizCrossOrg, got owner=%q name=%q err=%v", owner, name, err)
				}
				if owner != "" || name != "" {
					t.Fatalf("expected empty target on error, got %q/%q", owner, name)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if owner != tc.wantOwner || name != tc.wantName {
				t.Fatalf("got %q/%q, want %q/%q", owner, name, tc.wantOwner, tc.wantName)
			}
		})
	}
}
