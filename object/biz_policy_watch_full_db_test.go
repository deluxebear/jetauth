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
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// A full watch snapshot must come from the DB policy table, never from a
// local/Redis cache that may lag behind the version it is labelled with (M2).
func TestWatchFullSnapshotBypassesStaleCache(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)
	perm := &BizPermission{
		Owner: owner, AppName: app, Name: "p1", Resources: []string{"/orders"}, Actions: []string{"GET"},
		Effect: EffectAllow, IsEnabled: true, State: StateApproved,
	}
	if _, err := ormer.Engine.Insert(perm); err != nil {
		t.Fatal(err)
	}
	if _, err := ormer.Engine.Insert(&BizPermissionGrantee{PermissionId: perm.Id, SubjectType: BizPermGranteeUser, SubjectId: "alice", AddedTime: util.GetCurrentTime()}); err != nil {
		t.Fatal(err)
	}
	if _, err := SyncAppPolicies(owner, app); err != nil {
		t.Fatal(err)
	}
	version, _ := GetBizPolicyVersion(owner, app)

	// Simulate this instance's cache lagging: an empty enforcer is cached.
	cfg, _ := getBizAppConfig(owner, app)
	stale, err := buildEnforcerInMemory(cfg.ModelText, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	bizEnforcerCache.Store(util.GetId(owner, app), stale)

	res, err := buildBizWatchResult(owner, app, 0, false, version)
	if err != nil || res.Full == nil {
		t.Fatalf("full snapshot: %+v err=%v", res, err)
	}
	if res.Full.Version != version || len(res.Full.Policies) != 1 {
		t.Fatalf("snapshot version=%d policies=%v; want version %d with 1 policy (stale cache leaked)", res.Full.Version, res.Full.Policies, version)
	}
}
