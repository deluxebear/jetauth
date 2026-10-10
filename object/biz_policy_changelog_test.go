// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"reflect"
	"testing"
)

func clRow(version int64, action, ptype, rule string) *BizPolicyChangelog {
	return &BizPolicyChangelog{Version: version, Action: action, Ptype: ptype, Rule: rule}
}

func TestClassifyBizChangelog(t *testing.T) {
	t.Run("incremental over contiguous versions", func(t *testing.T) {
		rows := []*BizPolicyChangelog{
			clRow(6, BizChangeAdd, "p", `["bob","/reports/*","GET"]`),
			clRow(7, BizChangeAdd, "g", `["bob","admin"]`),
			clRow(7, BizChangeAdd, "g", `["bob","staff"]`),
		}
		changes, full := classifyBizChangelog(5, 7, rows)
		if full {
			t.Fatal("expected incremental")
		}
		want := []*BizPolicyChange{
			{Action: "add", Ptype: "p", Rule: []string{"bob", "/reports/*", "GET"}},
			{Action: "add", Ptype: "g", Rule: []string{"bob", "admin"}},
			{Action: "add", Ptype: "g", Rule: []string{"bob", "staff"}},
		}
		if !reflect.DeepEqual(changes, want) {
			t.Fatalf("changes = %+v, want %+v", changes, want)
		}
	})

	t.Run("full_rebuild marker forces full", func(t *testing.T) {
		rows := []*BizPolicyChangelog{
			clRow(6, BizChangeAdd, "p", `["a","b","c"]`),
			clRow(7, BizChangeFullRebuild, "", ""),
		}
		if _, full := classifyBizChangelog(5, 7, rows); !full {
			t.Fatal("expected full")
		}
	})

	t.Run("purged gap forces full", func(t *testing.T) {
		// versions 6 missing (purged); only 7 remains
		rows := []*BizPolicyChangelog{clRow(7, BizChangeAdd, "p", `["a","b","c"]`)}
		if _, full := classifyBizChangelog(5, 7, rows); !full {
			t.Fatal("expected full on gap")
		}
	})

	t.Run("client ahead of or equal to server forces full", func(t *testing.T) {
		if _, full := classifyBizChangelog(9, 7, nil); !full {
			t.Fatal("client ahead must be full")
		}
		if _, full := classifyBizChangelog(-1, 7, nil); !full {
			t.Fatal("negative version must be full")
		}
	})

	t.Run("corrupt rule forces full", func(t *testing.T) {
		rows := []*BizPolicyChangelog{clRow(6, BizChangeAdd, "p", `not json`)}
		if _, full := classifyBizChangelog(5, 6, rows); !full {
			t.Fatal("expected full on corrupt rule")
		}
	})
}

func TestFilterRulesBySubject(t *testing.T) {
	rules := [][]string{{"alice", "/a", "GET"}, {"bob", "/a", "GET"}, {"alice", "/b", "GET"}}
	got := filterRulesBySubject(rules, "alice")
	if len(got) != 2 || got[0][1] != "/a" || got[1][1] != "/b" {
		t.Fatalf("unexpected filter result: %v", got)
	}
	if len(filterRulesBySubject(rules, "")) != 3 {
		t.Fatal("empty subject must not filter")
	}
}

func TestResolveBizHint(t *testing.T) {
	policies := [][]string{{"alice", "/a", "GET"}}
	grouping := [][]string{{"bob", "admin"}}
	hintP := &bizChangeHint{compute: func(bizSyncCtx) (string, [][]string, error) {
		return "p", [][]string{{"alice", "/a", "GET"}}, nil
	}}
	if ptype, rules, ok := resolveBizHint(hintP, bizSyncCtx{}, policies, grouping); !ok || ptype != "p" || len(rules) != 1 {
		t.Fatalf("expected trusted p hint, got %v %v %v", ptype, rules, ok)
	}

	// A rule that is not in the rebuilt set must not be trusted.
	hintMissing := &bizChangeHint{compute: func(bizSyncCtx) (string, [][]string, error) {
		return "g", [][]string{{"carol", "admin"}}, nil
	}}
	if _, _, ok := resolveBizHint(hintMissing, bizSyncCtx{}, policies, grouping); ok {
		t.Fatal("hint naming an absent rule must degrade to full_rebuild")
	}

	if _, _, ok := resolveBizHint(nil, bizSyncCtx{}, policies, grouping); ok {
		t.Fatal("nil hint must not be trusted")
	}

	// Empty delta is valid (nothing to record).
	hintEmpty := &bizChangeHint{compute: func(bizSyncCtx) (string, [][]string, error) { return "p", nil, nil }}
	if _, rules, ok := resolveBizHint(hintEmpty, bizSyncCtx{}, policies, grouping); !ok || len(rules) != 0 {
		t.Fatal("empty delta should be trusted")
	}
}
