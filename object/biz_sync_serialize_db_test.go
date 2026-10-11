// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

package object

import (
	"fmt"
	"sync"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// Concurrent hinted syncs must converge: the persisted set contains every
// permission, and replaying the changelog (adds, with full_rebuild meaning
// "reload") never claims a rule the server does not have (M3).
func TestConcurrentSyncsConvergeAndChangelogMatches(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)
	const n = 8
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		perm := &BizPermission{
			Owner: owner, AppName: app, Name: fmt.Sprintf("p%d", i), Resources: []string{fmt.Sprintf("/r%d", i)}, Actions: []string{"GET"},
			Effect: EffectAllow, IsEnabled: true, State: StateApproved,
		}
		if _, err := ormer.Engine.Insert(perm); err != nil {
			t.Fatal(err)
		}
		user := fmt.Sprintf("u%d", i)
		if _, err := ormer.Engine.Insert(&BizPermissionGrantee{PermissionId: perm.Id, SubjectType: BizPermGranteeUser, SubjectId: user, AddedTime: util.GetCurrentTime()}); err != nil {
			t.Fatal(err)
		}
		wg.Add(1)
		go func(id int64, u string) {
			defer wg.Done()
			if _, err := syncAppPolicies(owner, app, bizPermissionAddedHint(id, u)); err != nil {
				t.Error(err)
			}
		}(perm.Id, user)
	}
	wg.Wait()
	// Final settle: the last follow-up may still be running in the background.
	if _, err := SyncAppPolicies(owner, app); err != nil {
		t.Fatal(err)
	}

	_, ps, _, err := loadBizPoliciesFromDB(owner, app)
	if err != nil {
		t.Fatal(err)
	}
	if len(ps) != n {
		t.Fatalf("persisted %d policies, want %d", len(ps), n)
	}

	// Every precise add in the changelog must be a rule that really exists.
	cur, _ := GetBizPolicyVersion(owner, app)
	rows := mustSince(t, owner, app, 0, cur)
	have := map[string]bool{}
	for _, p := range ps {
		have[fmt.Sprintf(`["%s","%s","%s"]`, p[0], p[1], p[2])] = true
	}
	for _, r := range rows {
		if r.Action == BizChangeAdd && !have[r.Rule] {
			t.Fatalf("changelog claims add of %s which the server does not have", r.Rule)
		}
	}
}
