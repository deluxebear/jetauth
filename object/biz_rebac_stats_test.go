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

func TestGetReBACStats_ShapesAndCounts(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-stats-" + util.GenerateUUID()[:8]
	appName := "drive_stats"
	seedRebacAppConfigForTest(t, owner, appName)
	storeId := BuildStoreId(owner, appName)

	if _, err := SaveAuthorizationModel(owner, appName,
		"model\n  schema 1.1\n\ntype user\n\ntype document\n  relations\n    define viewer: [user]\n\ntype folder\n  relations\n    define viewer: [user]\n",
		"test-user", "v1"); err != nil {
		t.Fatal(err)
	}
	if _, err := AddBizTuples([]*BizTuple{
		{StoreId: storeId, Owner: owner, AppName: appName, Object: "document:roadmap-2026", Relation: "viewer", User: "user:carol"},
		{StoreId: storeId, Owner: owner, AppName: appName, Object: "document:roadmap-2026", Relation: "editor", User: "user:bob"},
		{StoreId: storeId, Owner: owner, AppName: appName, Object: "document:roadmap-2026", Relation: "owner", User: "user:alice"},
		{StoreId: storeId, Owner: owner, AppName: appName, Object: "folder:design", Relation: "viewer", User: "user:david"},
	}); err != nil {
		t.Fatal(err)
	}

	s, err := GetReBACStats(owner, appName)
	if err != nil {
		t.Fatalf("GetReBACStats: %v", err)
	}
	if s.TupleCount != 4 {
		t.Errorf("TupleCount = %d, want 4", s.TupleCount)
	}
	if s.TodayDelta != 4 {
		t.Errorf("TodayDelta = %d, want 4", s.TodayDelta)
	}
	if s.ModelCount != 1 {
		t.Errorf("ModelCount = %d, want 1", s.ModelCount)
	}
	if s.ActiveModelId == "" {
		t.Errorf("ActiveModelId empty, want a non-empty id")
	}
	if len(s.TypeDistribution) != 2 {
		t.Errorf("TypeDistribution = %+v, want 2 rows (document, folder)", s.TypeDistribution)
	} else {
		// document has 3, folder has 1 — ordered by count desc.
		if s.TypeDistribution[0].Type != "document" || s.TypeDistribution[0].Count != 3 {
			t.Errorf("first type distrib = %+v, want {document, 3}", s.TypeDistribution[0])
		}
		if s.TypeDistribution[1].Type != "folder" || s.TypeDistribution[1].Count != 1 {
			t.Errorf("second type distrib = %+v, want {folder, 1}", s.TypeDistribution[1])
		}
	}
	if len(s.RecentWrites) != 4 {
		t.Errorf("RecentWrites = %d, want 4", len(s.RecentWrites))
	}
	for i, w := range s.RecentWrites {
		if w.Op != "write" {
			t.Errorf("recent[%d].Op = %q, want \"write\"", i, w.Op)
		}
	}
}
