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

func TestPermissionContentHash(t *testing.T) {
	base := &Permission{
		Owner: "o", Name: "p", Model: "m", ResourceType: "API", Effect: "Allow", IsEnabled: true,
		Users: []string{"o/a", "o/b"}, Resources: []string{"r1", "r2"}, Actions: []string{"Read"},
		DisplayName: "x", State: PermissionStatePending,
	}
	h := base.ComputeContentHash()

	reordered := *base
	reordered.Users = []string{"o/b", "o/a"}
	reordered.DisplayName = "other"
	reordered.State = PermissionStateApproved
	if reordered.ComputeContentHash() != h {
		t.Fatal("order, display name and state must not change the fingerprint")
	}

	mutations := map[string]func(p *Permission){
		"action":   func(p *Permission) { p.Actions = []string{"Read", "Write"} },
		"resource": func(p *Permission) { p.Resources = []string{"r1"} },
		"user":     func(p *Permission) { p.Users = []string{"o/a"} },
		"effect":   func(p *Permission) { p.Effect = "Deny" },
		"enabled":  func(p *Permission) { p.IsEnabled = false },
		"model":    func(p *Permission) { p.Model = "m2" },
		"role":     func(p *Permission) { p.Roles = []string{"o/r"} },
	}
	for name, mutate := range mutations {
		c := *base
		mutate(&c)
		if c.ComputeContentHash() == h {
			t.Errorf("changing %s must change the fingerprint", name)
		}
	}
}

func TestCheckPermissionContentHash(t *testing.T) {
	p := &Permission{Owner: "o", Name: "p", Actions: []string{"Read"}}
	h := p.ComputeContentHash()

	if err := checkPermissionContentHash(p, PermissionStateApproved, h); err != nil {
		t.Fatalf("matching hash: %v", err)
	}
	if err := checkPermissionContentHash(p, PermissionStateApproved, ""); err == nil {
		t.Fatal("approve without hash must fail")
	}
	if err := checkPermissionContentHash(p, PermissionStateApproved, "stale"); err == nil {
		t.Fatal("approve with a wrong hash must fail")
	}
	if err := checkPermissionContentHash(p, PermissionStateRejected, ""); err != nil {
		t.Fatalf("reject without hash is allowed: %v", err)
	}
	if err := checkPermissionContentHash(p, PermissionStateRejected, "stale"); err == nil {
		t.Fatal("reject with a wrong hash must fail")
	}
}
