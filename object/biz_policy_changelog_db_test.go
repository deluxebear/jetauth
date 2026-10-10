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
	"context"
	"strings"
	"testing"
	"time"

	"github.com/deluxebear/jetauth/util"
)

const bizChangelogTestModel = `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
`

// newBizChangelogTestApp creates a Casbin biz app config and registers cleanup.
func newBizChangelogTestApp(t *testing.T) (owner, appName string) {
	t.Helper()
	initBizRoleTestDb(t)
	owner = "biz-cl-" + util.GenerateId()
	appName = "app"
	cfg := &BizAppConfig{
		Owner:       owner,
		AppName:     appName,
		CreatedTime: util.GetCurrentTime(),
		UpdatedTime: util.GetCurrentTime(),
		ModelText:   bizChangelogTestModel,
		PolicyTable: "biz_cl_" + strings.ReplaceAll(util.GenerateId()[:12], "-", "_"),
		IsEnabled:   true,
		ModelType:   "casbin",
	}
	if ok, err := AddBizAppConfig(cfg); err != nil || !ok {
		t.Fatalf("AddBizAppConfig: ok=%v err=%v", ok, err)
	}
	t.Cleanup(func() {
		_, _ = ormer.Engine.Where("owner = ?", owner).Delete(&BizPolicyChangelog{})
		_, _ = ormer.Engine.Where("owner = ?", owner).Delete(&BizPermission{})
		_, _ = ormer.Engine.Where("organization = ?", owner).Delete(&BizRole{})
		_, _ = ormer.Engine.Where("owner = ?", owner).Delete(&BizAppConfig{})
		ClearBizEnforcerCache(owner, appName)
	})
	return owner, appName
}

func TestAppendChangelogBumpsVersionAndRecordsRules(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)

	v, err := appendChangelog(owner, app, BizChangeAdd, "p", [][]string{{"alice", "/a", "GET"}, {"alice", "/b", "GET"}})
	if err != nil || v != 1 {
		t.Fatalf("first append: v=%d err=%v", v, err)
	}
	// Empty add is a no-op: version unchanged.
	v, err = appendChangelog(owner, app, BizChangeAdd, "p", nil)
	if err != nil || v != 1 {
		t.Fatalf("empty append must not bump: v=%d err=%v", v, err)
	}
	v, err = appendChangelog(owner, app, BizChangeFullRebuild, "", nil)
	if err != nil || v != 2 {
		t.Fatalf("full_rebuild: v=%d err=%v", v, err)
	}

	if cur, _ := GetBizPolicyVersion(owner, app); cur != 2 {
		t.Fatalf("GetBizPolicyVersion = %d, want 2", cur)
	}

	rows, err := getBizChangelogSince(owner, app, 0, 2)
	if err != nil || len(rows) != 3 {
		t.Fatalf("rows=%d err=%v", len(rows), err)
	}
	if rows[0].Version != 1 || rows[1].Version != 1 || rows[2].Version != 2 || rows[2].Action != BizChangeFullRebuild {
		t.Fatalf("unexpected rows: %+v %+v %+v", rows[0], rows[1], rows[2])
	}
}

func TestUpdateBizAppConfigPreservesPolicyVersion(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)
	if _, err := appendChangelog(owner, app, BizChangeFullRebuild, "", nil); err != nil {
		t.Fatal(err)
	}
	cfg, err := getBizAppConfig(owner, app)
	if err != nil || cfg == nil {
		t.Fatalf("get config: %v", err)
	}
	cfg.PolicyVersion = 0 // a client echoing back a stale/zero value
	cfg.DisplayName = "renamed"
	if _, err := UpdateBizAppConfig(util.GetId(owner, app), cfg); err != nil {
		t.Fatal(err)
	}
	// UpdateBizAppConfig kicks a sync that bumps the version; it must never go backwards.
	time.Sleep(300 * time.Millisecond)
	if cur, _ := GetBizPolicyVersion(owner, app); cur < 1 {
		t.Fatalf("policy_version regressed to %d", cur)
	}
}

func TestPurgeBizPolicyChangelogKeepsRecentVersions(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)
	for i := 0; i < 10; i++ {
		if _, err := appendChangelog(owner, app, BizChangeAdd, "p", [][]string{{"u", "/r", "GET"}}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := PurgeBizPolicyChangelog(3); err != nil {
		t.Fatal(err)
	}
	rows, err := getBizChangelogSince(owner, app, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 || rows[0].Version != 8 {
		t.Fatalf("expected versions 8..10 kept, got %d rows first=%v", len(rows), rows)
	}
	// A client at version 2 now hits a gap -> full.
	if _, full := classifyBizChangelog(2, 10, mustSince(t, owner, app, 2, 10)); !full {
		t.Fatal("client older than retention must fall back to full")
	}
	// A client at version 7 is still incremental.
	if changes, full := classifyBizChangelog(7, 10, mustSince(t, owner, app, 7, 10)); full || len(changes) != 3 {
		t.Fatalf("client at 7 should get 3 incremental changes, full=%v n=%d", full, len(changes))
	}
}

func mustSince(t *testing.T, owner, app string, since, upTo int64) []*BizPolicyChangelog {
	t.Helper()
	rows, err := getBizChangelogSince(owner, app, since, upTo)
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestSyncRecordsPreciseAddAndFullRebuild(t *testing.T) {
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

	// Precise add: hint matches the rebuilt set.
	if _, err := syncAppPolicies(owner, app, bizPermissionAddedHint(perm.Id, "alice")); err != nil {
		t.Fatal(err)
	}
	rows := mustSince(t, owner, app, 0, 100)
	if len(rows) != 1 || rows[0].Action != BizChangeAdd || rows[0].Ptype != "p" || rows[0].Rule != `["alice","/orders","GET"]` {
		t.Fatalf("expected one precise p add, got %+v", rows)
	}

	// Manual sync (no hint) records a full_rebuild marker.
	if _, err := SyncAppPolicies(owner, app); err != nil {
		t.Fatal(err)
	}
	rows = mustSince(t, owner, app, 1, 100)
	if len(rows) != 1 || rows[0].Action != BizChangeFullRebuild || rows[0].Version != 2 {
		t.Fatalf("expected full_rebuild at v2, got %+v", rows)
	}

	// A hint naming a rule that was not produced degrades to full_rebuild.
	if _, err := syncAppPolicies(owner, app, bizPermissionAddedHint(perm.Id, "nobody-granted")); err != nil {
		t.Fatal(err)
	}
	// ("nobody-granted" filters to an empty delta -> trusted/no-op: version stays 2)
	if cur, _ := GetBizPolicyVersion(owner, app); cur != 2 {
		t.Fatalf("empty trusted delta must not bump version, got %d", cur)
	}
}

func TestWatchBizPolicies(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)
	if _, err := SyncAppPolicies(owner, app); err != nil { // v1 = full_rebuild
		t.Fatal(err)
	}
	ctx := context.Background()

	// First connect -> full snapshot at the current version.
	res, err := WatchBizPolicies(ctx, owner, app, 0, false, time.Second)
	if err != nil || res.Full == nil || res.Full.Type != "full" || res.Full.Version != 1 || res.Full.ModelText == "" {
		t.Fatalf("expected full snapshot, got %+v err=%v", res, err)
	}

	// Behind across a full_rebuild marker -> full.
	res, err = WatchBizPolicies(ctx, owner, app, 0, true, time.Second)
	if err != nil || res.Full == nil {
		t.Fatalf("expected full across marker, got %+v err=%v", res, err)
	}

	// Up to date, nothing changes -> empty result (HTTP 304) after the timeout.
	start := time.Now()
	res, err = WatchBizPolicies(ctx, owner, app, 1, true, 200*time.Millisecond)
	if err != nil || res.Full != nil || res.Incremental != nil {
		t.Fatalf("expected timeout/no-change, got %+v err=%v", res, err)
	}
	if time.Since(start) < 150*time.Millisecond {
		t.Fatal("returned before the timeout")
	}

	// Waiting watcher is woken by a precise change and gets an incremental response.
	done := make(chan *BizWatchResult, 1)
	go func() {
		r, _ := WatchBizPolicies(ctx, owner, app, 1, true, 5*time.Second)
		done <- r
	}()
	time.Sleep(150 * time.Millisecond)
	if _, err := appendChangelog(owner, app, BizChangeAdd, "p", [][]string{{"bob", "/x", "GET"}}); err != nil {
		t.Fatal(err)
	}
	notifyBizPolicyWatchers(owner, app)
	select {
	case r := <-done:
		if r == nil || r.Incremental == nil || r.Incremental.FromVersion != 1 || r.Incremental.ToVersion != 2 ||
			len(r.Incremental.Changes) != 1 || r.Incremental.Changes[0].Rule[0] != "bob" {
			t.Fatalf("unexpected incremental result: %+v", r)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("watcher was not woken")
	}

	// Client ahead of the server -> full.
	res, err = WatchBizPolicies(ctx, owner, app, 99, true, time.Second)
	if err != nil || res.Full == nil {
		t.Fatalf("client ahead must get full, got %+v err=%v", res, err)
	}

	// Cancelled context aborts the wait.
	cctx, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := WatchBizPolicies(cctx, owner, app, 2, true, 5*time.Second); err == nil {
		t.Fatal("expected context error")
	}
}
