// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"fmt"
	"time"
)

// ReBACStats bundles every Overview-screen number the admin UI needs in
// one round-trip. Sources of truth:
//   - TupleCount, TodayDelta, TypeDistribution, RecentWrites: SELECTs on biz_<app>_tuple
//   - CheckQpsLastHour: in-process ring buffer (biz_rebac_metrics_qps), resets on restart
//   - ModelCount, ActiveModelId, LastUpdated: ListBizAuthorizationModels + BizAppConfig
type ReBACStats struct {
	TupleCount       int64                   `json:"tupleCount"`
	TodayDelta       int64                   `json:"todayDelta"`
	CheckQpsLastHour int64                   `json:"checkQpsLastHour"`
	ModelCount       int64                   `json:"modelCount"`
	ActiveModelId    string                  `json:"activeModelId,omitempty"`
	LastUpdated      string                  `json:"lastUpdated,omitempty"`
	TypeDistribution []ReBACTypeDistribution `json:"typeDistribution"`
	RecentWrites     []ReBACRecentWrite      `json:"recentWrites"`
}

// ReBACTypeDistribution is the per-object-type tuple count, sorted by count desc.
type ReBACTypeDistribution struct {
	Type  string `json:"type"`
	Count int64  `json:"count"`
}

// ReBACRecentWrite mirrors a tuple insertion. Op is always "write" for now;
// "delete" requires a tuple-audit log (deferred to iteration 2).
type ReBACRecentWrite struct {
	Object   string `json:"object"`
	Relation string `json:"relation"`
	User     string `json:"user"`
	Op       string `json:"op"`
	At       string `json:"at"`
}

// GetReBACStats aggregates the admin Overview snapshot for one app. Each
// component is one bounded query; the result is small enough to JSON-encode
// without paging. Recent writes are limited to 8 rows, type distribution
// has no hard cap (a schema with 100 types is unusual; the largest store
// in production has <20).
func GetReBACStats(owner, appName string) (*ReBACStats, error) {
	storeId := BuildStoreId(owner, appName)

	tupleCount, err := CountBizTuples(owner, appName)
	if err != nil {
		return nil, fmt.Errorf("count tuples: %w", err)
	}

	// Today's delta: tuples created since local midnight. RFC3339 strings
	// are lexicographically comparable when their offset matches the server's
	// local zone, so a simple string >= comparison is enough.
	now := time.Now()
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayDelta, err := ormer.Engine.
		Where("store_id = ? AND created_time >= ?", storeId, midnight.Format(time.RFC3339)).
		Count(new(BizTuple))
	if err != nil {
		return nil, fmt.Errorf("today delta: %w", err)
	}

	// Type distribution: GROUP BY object_type. The column is indexed
	// (idx_reverse) so this is cheap.
	type typeRow struct {
		ObjectType string `xorm:"object_type"`
		N          int64  `xorm:"n"`
	}
	var typeRows []typeRow
	if err := ormer.Engine.Table(new(BizTuple)).
		Select("object_type, COUNT(*) AS n").
		Where("store_id = ?", storeId).
		GroupBy("object_type").
		OrderBy("n DESC").
		Find(&typeRows); err != nil {
		return nil, fmt.Errorf("type distribution: %w", err)
	}
	typeDist := make([]ReBACTypeDistribution, 0, len(typeRows))
	for _, r := range typeRows {
		typeDist = append(typeDist, ReBACTypeDistribution{Type: r.ObjectType, Count: r.N})
	}

	// Recent writes: last 8 tuples ORDER BY created_time DESC.
	recent := []*BizTuple{}
	if err := ormer.Engine.
		Where("store_id = ?", storeId).
		Desc("created_time").
		Limit(8).
		Find(&recent); err != nil {
		return nil, fmt.Errorf("recent writes: %w", err)
	}
	recentWrites := make([]ReBACRecentWrite, 0, len(recent))
	for _, t := range recent {
		recentWrites = append(recentWrites, ReBACRecentWrite{
			Object: t.Object, Relation: t.Relation, User: t.User,
			Op: "write", At: t.CreatedTime,
		})
	}

	// Models: count + active id + lastUpdated (newest model's CreatedTime).
	models, err := ListBizAuthorizationModels(owner, appName)
	if err != nil {
		return nil, fmt.Errorf("list models: %w", err)
	}
	var lastUpdated string
	if len(models) > 0 {
		lastUpdated = models[0].CreatedTime // ListBizAuthorizationModels returns newest first
	}
	// cfg may legitimately be nil for an app whose ReBAC config hasn't been
	// seeded yet. A transient DB error is also swallowed here on purpose:
	// the four SELECTs above already failed-fast on outage, so reaching this
	// line with an error is a "config row read flaked" race that should
	// degrade to empty ActiveModelId, not blank the whole Overview screen.
	cfg, _ := GetBizAppConfig(BuildStoreId(owner, appName))
	var activeModelId string
	if cfg != nil {
		activeModelId = cfg.CurrentAuthorizationModelId
	}

	return &ReBACStats{
		TupleCount:       tupleCount,
		TodayDelta:       todayDelta,
		CheckQpsLastHour: GetBizReBACCheckLastHour(storeId),
		ModelCount:       int64(len(models)),
		ActiveModelId:    activeModelId,
		LastUpdated:      lastUpdated,
		TypeDistribution: typeDist,
		RecentWrites:     recentWrites,
	}, nil
}
