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
	"testing"
	"time"
)

// Before/after for the platform permission enforcer cache, on the local
// SQLite DB:
//
//	go test -run '^$' -bench BenchmarkPermissionEnforce -benchmem ./object
//
// "NoCache" is the pre-change behaviour (enforcer rebuilt per call);
// "Cached" is the same call with the cache enabled.
func benchPermissionFixture(b *testing.B) (*Permission, string) {
	b.Helper()
	permissionRbacTestInit.Do(func() {
		oldCreateDatabase := createDatabase
		createDatabase = false
		InitConfig()
		createDatabase = oldCreateDatabase
	})

	owner := "enf-bench-" + fmt.Sprint(time.Now().UnixNano())
	b.Cleanup(func() {
		_, _ = ormer.Engine.Where("v5 like ?", owner+"/%").Delete(&permissionRuleRecord{})
		_, _ = ormer.Engine.Where("owner = ?", owner).Delete(&Permission{})
		_, _ = ormer.Engine.Where("owner = ?", owner).Delete(&Role{})
	})

	// A 4-level role chain with 50 users on the leaf, like a modest org.
	users := make([]string, 50)
	for i := range users {
		users[i] = fmt.Sprintf("%s/user%d", owner, i)
	}
	var child []string
	for lvl := 3; lvl >= 0; lvl-- {
		role := &Role{Owner: owner, Name: fmt.Sprintf("level%d", lvl), Roles: child}
		if lvl == 3 {
			role.Users = users
		}
		if _, err := AddRole(role); err != nil {
			b.Fatal(err)
		}
		child = []string{role.GetId()}
	}

	perm := newTestPermission(owner, "bench-perm", child...)
	if _, err := AddPermission(perm); err != nil {
		b.Fatal(err)
	}
	return perm, users[7]
}

func runEnforceBench(b *testing.B, cache *PermissionEnforcerCache) {
	perm, user := benchPermissionFixture(b)
	prev := getPermissionEnforcerCache()
	SetPermissionEnforcerCache(cache)
	defer SetPermissionEnforcerCache(prev)

	request := []interface{}{user, "data1", "read"}
	if ok, err := Enforce(perm, request); err != nil || !ok {
		b.Fatalf("warm-up Enforce = %v, %v", ok, err)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := Enforce(perm, request); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkPermissionEnforce_NoCache(b *testing.B) { runEnforceBench(b, nil) }

func BenchmarkPermissionEnforce_Cached(b *testing.B) {
	runEnforceBench(b, NewPermissionEnforcerCache(100, time.Minute))
}
