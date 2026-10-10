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
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/casbin/casbin/v3"
)

// These tests are pure in-memory (no DB) so they run under -tags skipCi.

func newTestEnforcer(t *testing.T) *casbin.Enforcer {
	t.Helper()
	e, err := casbin.NewEnforcer()
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func newTestCache(size int, ttl time.Duration) (*PermissionEnforcerCache, *time.Time) {
	c := NewPermissionEnforcerCache(size, ttl)
	now := time.Unix(1_000_000, 0)
	c.now = func() time.Time { return now }
	return c, &now
}

func putTest(t *testing.T, c *PermissionEnforcerCache, key string, deps permissionEnforcerDeps) {
	t.Helper()
	if !c.Put(key, newTestEnforcer(t), deps, c.Generation()) {
		t.Fatalf("Put(%s) unexpectedly rejected", key)
	}
}

func TestPermissionEnforcerCache_HitMissAndTTL(t *testing.T) {
	c, now := newTestCache(10, time.Minute)
	if _, ok := c.Get("k"); ok {
		t.Fatal("expected miss on empty cache")
	}
	putTest(t, c, "k", permissionEnforcerDeps{})
	if _, ok := c.Get("k"); !ok {
		t.Fatal("expected hit")
	}
	*now = now.Add(59 * time.Second)
	if _, ok := c.Get("k"); !ok {
		t.Fatal("expected hit before TTL")
	}
	*now = now.Add(2 * time.Second)
	if _, ok := c.Get("k"); ok {
		t.Fatal("expected miss after TTL")
	}
	if c.Len() != 0 {
		t.Fatalf("expired entry should be purged, len=%d", c.Len())
	}
}

func TestPermissionEnforcerCache_LRUEviction(t *testing.T) {
	c, _ := newTestCache(2, time.Minute)
	putTest(t, c, "a", permissionEnforcerDeps{})
	putTest(t, c, "b", permissionEnforcerDeps{})
	if _, ok := c.Get("a"); !ok { // a becomes most recently used
		t.Fatal("expected hit on a")
	}
	putTest(t, c, "c", permissionEnforcerDeps{}) // evicts b
	if _, ok := c.Get("b"); ok {
		t.Fatal("b should have been evicted")
	}
	if _, ok := c.Get("a"); !ok {
		t.Fatal("a should survive")
	}
	if _, ok := c.Get("c"); !ok {
		t.Fatal("c should be present")
	}
	if c.Len() != 2 {
		t.Fatalf("len=%d, want 2", c.Len())
	}
}

func TestPermissionEnforcerCache_InvalidateScopes(t *testing.T) {
	c, _ := newTestCache(10, time.Minute)
	putTest(t, c, "p1", permissionEnforcerDeps{permissionIds: []string{"org1/p1"}, owners: []string{"org1", "built-in"}})
	putTest(t, c, "p2", permissionEnforcerDeps{permissionIds: []string{"org2/p2"}, owners: []string{"org2", "built-in", "org1"}})
	putTest(t, c, "p3", permissionEnforcerDeps{permissionIds: []string{"org3/p3", "org3/p4"}, owners: []string{"org3"}})

	c.InvalidatePermissions("org3/p4")
	if _, ok := c.Get("p3"); ok {
		t.Fatal("p3 should be dropped via its secondary permission id")
	}
	if _, ok := c.Get("p1"); !ok {
		t.Fatal("p1 should survive unrelated permission invalidation")
	}

	// p2 consulted a role in org1, so an org1 change must drop both.
	c.InvalidateOwner("org1")
	if _, ok := c.Get("p1"); ok {
		t.Fatal("p1 should be dropped by owner invalidation")
	}
	if _, ok := c.Get("p2"); ok {
		t.Fatal("p2 should be dropped: it depends on a role owned by org1")
	}

	putTest(t, c, "p5", permissionEnforcerDeps{owners: []string{"org9"}})
	c.InvalidateAll()
	if c.Len() != 0 {
		t.Fatalf("InvalidateAll left %d entries", c.Len())
	}
}

func TestPermissionEnforcerCache_PutRejectedAfterConcurrentInvalidation(t *testing.T) {
	c, _ := newTestCache(10, time.Minute)
	gen := c.Generation()            // reader starts building from the DB ...
	c.InvalidatePermissions("org/p") // ... a writer invalidates meanwhile ...
	if c.Put("k", newTestEnforcer(t), permissionEnforcerDeps{permissionIds: []string{"org/p"}}, gen) {
		t.Fatal("stale build must not be stored") // ... so the stale result is dropped
	}
	if _, ok := c.Get("k"); ok {
		t.Fatal("stale entry visible")
	}
	putTest(t, c, "k", permissionEnforcerDeps{}) // a fresh build is accepted
}

func TestPermissionEnforcerCache_ConcurrentUse(t *testing.T) {
	c := NewPermissionEnforcerCache(16, time.Minute)
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 300; i++ {
				key := fmt.Sprintf("k%d", i%24)
				if _, ok := c.Get(key); !ok {
					e, _ := casbin.NewEnforcer()
					c.Put(key, e, permissionEnforcerDeps{permissionIds: []string{key}, owners: []string{"o"}}, c.Generation())
				}
				switch i % 50 {
				case 0:
					c.InvalidatePermissions(key)
				case 25:
					c.InvalidateOwner("o")
				}
			}
		}(g)
	}
	wg.Wait()
	if c.Len() > 16 {
		t.Fatalf("cache exceeded cap: %d", c.Len())
	}
}

func TestPermissionEnforcerCacheKey(t *testing.T) {
	base := &Permission{Owner: "o", Name: "n", Model: "o/m", Roles: []string{"o/r"}}
	k := permissionEnforcerCacheKey(base, nil)
	if k != permissionEnforcerCacheKey(&Permission{Owner: "o", Name: "n", Model: "o/m", Roles: []string{"o/r"}}, nil) {
		t.Fatal("equal inputs must give equal keys")
	}
	variants := []*Permission{
		{Owner: "o", Name: "n2", Model: "o/m", Roles: []string{"o/r"}},
		{Owner: "o", Name: "n", Model: "o/m2", Roles: []string{"o/r"}},
		{Owner: "o", Name: "n", Model: "o/m", Roles: []string{"o/r2"}},
		{Owner: "o", Name: "n", Model: "o/m", Roles: []string{"o/r"}, Adapter: "o/a"},
		{Owner: "o", Name: "n", Model: "o/m", Roles: []string{"o/r"}, Domains: []string{"d"}},
	}
	for i, v := range variants {
		if permissionEnforcerCacheKey(v, nil) == k {
			t.Fatalf("variant %d must change the key", i)
		}
	}
	if permissionEnforcerCacheKey(base, []string{"o/n", "o/x"}) == k {
		t.Fatal("permissionIDs must change the key")
	}
}

func withTestGlobalCache(t *testing.T) *PermissionEnforcerCache {
	t.Helper()
	prev := getPermissionEnforcerCache()
	c, _ := newTestCache(10, time.Minute)
	SetPermissionEnforcerCache(c)
	t.Cleanup(func() { SetPermissionEnforcerCache(prev) })
	return c
}

func TestPermissionEnforcerHooksInvalidate(t *testing.T) {
	c := withTestGlobalCache(t)
	seed := func() {
		putTest(t, c, "mine", permissionEnforcerDeps{permissionIds: []string{"org1/perm"}, owners: []string{"org1"}})
		putTest(t, c, "other", permissionEnforcerDeps{permissionIds: []string{"org2/perm"}, owners: []string{"org2"}})
	}
	has := func(key string) bool { _, ok := c.Get(key); return ok }

	tests := []struct {
		name       string
		fire       func()
		wantMine   bool
		wantOthers bool
	}{
		{"role update drops its org only", func() { (&Role{Owner: "org1", Name: "r"}).AfterUpdate() }, false, true},
		{"role insert", func() { (&Role{Owner: "org1", Name: "r"}).AfterInsert() }, false, true},
		{"role delete with empty bean flushes all", func() { (&Role{}).AfterDelete() }, false, false},
		{"partial role bean flushes all", func() { (&Role{Owner: "org1"}).AfterUpdate() }, false, false},
		{"permission update is precise", func() { (&Permission{Owner: "org1", Name: "perm"}).AfterUpdate() }, false, true},
		{"permission delete of other id keeps mine", func() { (&Permission{Owner: "org1", Name: "zzz"}).AfterDelete() }, true, true},
		{"partial permission bean (model rename) flushes all", func() { (&Permission{Model: "new"}).AfterUpdate() }, false, false},
		{"model update drops its owner", func() { (&Model{Owner: "org2", Name: "m"}).AfterUpdate() }, true, false},
		{"adapter update drops its owner", func() { (&Adapter{Owner: "org1", Name: "a"}).AfterUpdate() }, false, true},
		{"empty adapter bean flushes all", func() { (&Adapter{}).AfterDelete() }, false, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			seed()
			tc.fire()
			if got := has("mine"); got != tc.wantMine {
				t.Errorf("mine cached=%v, want %v", got, tc.wantMine)
			}
			if got := has("other"); got != tc.wantOthers {
				t.Errorf("other cached=%v, want %v", got, tc.wantOthers)
			}
		})
	}
}

func TestPermissionEnforcerBroadcastAndWatcherEcho(t *testing.T) {
	c := withTestGlobalCache(t)

	type sent struct {
		scope  string
		values []string
	}
	var got []sent
	permissionEnforcerBroadcaster = func(scope string, values []string) { got = append(got, sent{scope, values}) }
	t.Cleanup(func() { permissionEnforcerBroadcaster = nil })

	InvalidatePermissionEnforcers("org/p")
	InvalidatePermissionEnforcersByOwner("org")
	InvalidateAllPermissionEnforcers()
	InvalidatePermissionEnforcersByOwner("") // unknown owner escalates to all
	scopes := []string{}
	for _, s := range got {
		scopes = append(scopes, s.scope)
	}
	want := []string{"permission", "owner", "all", "all"}
	if fmt.Sprint(scopes) != fmt.Sprint(want) {
		t.Fatalf("broadcast scopes=%v, want %v", scopes, want)
	}

	// Remote messages are applied locally without re-broadcasting; own echoes are ignored.
	got = nil
	w := &permissionEnforcerWatcher{origin: "me"}
	putTest(t, c, "k", permissionEnforcerDeps{permissionIds: []string{"org/p"}})
	w.handle([]byte(`{"origin":"me","scope":"all"}`))
	if _, ok := c.Get("k"); !ok {
		t.Fatal("own echo must be ignored")
	}
	w.handle([]byte(`{"origin":"peer","scope":"permission","values":["org/p"]}`))
	if _, ok := c.Get("k"); ok {
		t.Fatal("peer invalidation must drop the entry")
	}
	putTest(t, c, "k", permissionEnforcerDeps{})
	w.handle([]byte(`not json`))
	if c.Len() != 0 {
		t.Fatal("malformed message must flush pessimistically")
	}
	if len(got) != 0 {
		t.Fatalf("remote handling must not re-broadcast, got %v", got)
	}
}

func TestPermissionEnforcerInvalidateWithoutCache(t *testing.T) {
	prev := getPermissionEnforcerCache()
	SetPermissionEnforcerCache(nil)
	t.Cleanup(func() { SetPermissionEnforcerCache(prev) })
	// Must be a no-op, not a nil dereference.
	InvalidatePermissionEnforcers("a/b")
	InvalidateAllPermissionEnforcers()
	(&Role{}).AfterUpdate()
}
