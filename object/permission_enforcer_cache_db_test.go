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
	"strings"
	"testing"
	"time"
)

func enableTestEnforcerCache(t *testing.T) *PermissionEnforcerCache {
	t.Helper()
	prev := getPermissionEnforcerCache()
	c := NewPermissionEnforcerCache(100, time.Minute)
	SetPermissionEnforcerCache(c)
	t.Cleanup(func() { SetPermissionEnforcerCache(prev) })
	return c
}

func mustEnforce(t *testing.T, p *Permission, user string) bool {
	t.Helper()
	ok, err := Enforce(p, []interface{}{user, "data1", "read"})
	if err != nil {
		t.Fatalf("Enforce(%s) error: %v", user, err)
	}
	return ok
}

// End to end: every write path that changes an authorization result must be
// visible on the very next Enforce although the enforcer is cached.
func TestPermissionEnforcerCacheEndToEndInvalidation(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)
	cache := enableTestEnforcerCache(t)

	role := &Role{Owner: owner, Name: "reader", Users: []string{owner + "/alice"}}
	if _, err := AddRole(role); err != nil {
		t.Fatal(err)
	}
	perm := newTestPermission(owner, "perm-reader", role.GetId())
	if _, err := AddPermission(perm); err != nil {
		t.Fatal(err)
	}

	alice, bob := owner+"/alice", owner+"/bob"
	if !mustEnforce(t, perm, alice) || mustEnforce(t, perm, bob) {
		t.Fatal("initial decisions wrong")
	}
	if cache.Len() == 0 {
		t.Fatal("expected the enforcer to be cached after Enforce")
	}

	// Role membership change.
	role.Users = []string{bob}
	if _, err := UpdateRole(role.GetId(), role); err != nil {
		t.Fatal(err)
	}
	if mustEnforce(t, perm, alice) || !mustEnforce(t, perm, bob) {
		t.Fatal("role membership change not visible (stale cache)")
	}

	// Permission change: actions no longer include read.
	perm.Actions = []string{"write"}
	if _, err := UpdatePermission(perm.GetId(), perm); err != nil {
		t.Fatal(err)
	}
	if mustEnforce(t, perm, bob) {
		t.Fatal("permission update not visible (stale cache)")
	}
	perm.Actions = []string{"read"}
	if _, err := UpdatePermission(perm.GetId(), perm); err != nil {
		t.Fatal(err)
	}
	if !mustEnforce(t, perm, bob) {
		t.Fatal("permission restore not visible (stale cache)")
	}

	// Role deletion strips it from the permission (DeleteRole -> UpdatePermission).
	if _, err := DeleteRole(role); err != nil {
		t.Fatal(err)
	}
	stripped, err := GetPermission(perm.GetId())
	if err != nil || stripped == nil {
		t.Fatalf("GetPermission: %v %v", stripped, err)
	}
	if mustEnforce(t, stripped, bob) {
		t.Fatal("role deletion not visible (stale cache)")
	}

	// Permission deletion removes the p rules.
	if _, err := DeletePermission(perm); err != nil {
		t.Fatal(err)
	}
	if mustEnforce(t, perm, bob) {
		t.Fatal("permission deletion not visible (stale cache)")
	}
}

func TestPermissionEnforcerCacheHitsAvoidRebuild(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)
	cache := enableTestEnforcerCache(t)

	role := &Role{Owner: owner, Name: "r", Users: []string{owner + "/alice"}}
	if _, err := AddRole(role); err != nil {
		t.Fatal(err)
	}
	perm := newTestPermission(owner, "p", role.GetId())
	if _, err := AddPermission(perm); err != nil {
		t.Fatal(err)
	}

	e1, err := getPermissionEnforcer(perm)
	if err != nil {
		t.Fatal(err)
	}
	e2, err := getPermissionEnforcer(perm)
	if err != nil {
		t.Fatal(err)
	}
	if e1 != e2 {
		t.Fatal("second call should return the cached enforcer")
	}
	// Mutators must never receive the shared instance.
	e3, err := newPermissionEnforcer(perm)
	if err != nil {
		t.Fatal(err)
	}
	if e3 == e1 {
		t.Fatal("newPermissionEnforcer must bypass the cache")
	}
	// Unrelated org writes keep the entry.
	InvalidatePermissionEnforcersByOwner("some-other-org")
	if _, ok := cache.Get(permissionEnforcerCacheKey(perm, nil)); !ok {
		t.Fatal("unrelated invalidation dropped the entry")
	}
}

func TestPermissionEnforcerMissingModelIsError(t *testing.T) {
	owner := newPermissionRbacTestOwner(t)

	missing := newTestPermission(owner, "p-missing-model")
	missing.Model = owner + "/does-not-exist"
	_, err := newPermissionEnforcer(missing)
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected a clear not-found error, got %v", err)
	}

	// An empty Model keeps using the documented built-in model.
	empty := newTestPermission(owner, "p-empty-model")
	if _, err := newPermissionEnforcer(empty); err != nil {
		t.Fatalf("empty Model must fall back to the built-in model: %v", err)
	}
}
