// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"context"
	"fmt"
	"time"

	"github.com/deluxebear/jetauth/util"
)

const (
	// BizWatchMaxTimeout is the longest a watch request blocks before 304.
	BizWatchMaxTimeout = 60 * time.Second
	// bizWatchPollInterval is how often a waiter re-reads policy_version from
	// the DB, covering changes made by other instances when the Redis
	// watcher is not enabled.
	bizWatchPollInterval = 3 * time.Second
)

// BizWatchIncrementalResponse is returned (type="incremental") when the
// client's version is behind and every change since then is known.
type BizWatchIncrementalResponse struct {
	Type        string             `json:"type" example:"incremental"`
	FromVersion int64              `json:"fromVersion"`
	ToVersion   int64              `json:"toVersion"`
	Changes     []*BizPolicyChange `json:"changes"`
}

// BizWatchFullResponse is returned (type="full") on first connect, when the
// client's version is too old / ahead, or a full_rebuild marker was crossed.
type BizWatchFullResponse struct {
	Type             string     `json:"type" example:"full"`
	Version          int64      `json:"version"`
	ModelText        string     `json:"modelText"`
	Policies         [][]string `json:"policies"`
	GroupingPolicies [][]string `json:"groupingPolicies"`
}

// BizWatchResult holds exactly one of Incremental / Full. Both nil means the
// wait timed out with no change (HTTP 304).
type BizWatchResult struct {
	Incremental *BizWatchIncrementalResponse
	Full        *BizWatchFullResponse
}

// BizPolicyVersionResponse is the body of the lightweight version query.
type BizPolicyVersionResponse struct {
	Version int64 `json:"version"`
}

// WatchBizPolicies implements the long-poll behind /api/biz-watch-policies.
//
//   - hasSince=false (first connect) → full snapshot immediately.
//   - since == current version → block up to timeout; return the result as
//     soon as the version moves, or an empty result on timeout.
//   - since != current → incremental when the whole range is available and
//     free of full_rebuild markers, otherwise full.
//
// ctx cancellation (client disconnect) returns ctx.Err().
func WatchBizPolicies(ctx context.Context, owner, appName string, since int64, hasSince bool, timeout time.Duration) (*BizWatchResult, error) {
	if timeout <= 0 || timeout > BizWatchMaxTimeout {
		timeout = BizWatchMaxTimeout
	}
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	poll := time.NewTicker(bizWatchPollInterval)
	defer poll.Stop()

	for {
		// Grab the wake-up channel BEFORE reading the version so a change
		// landing in between is never missed.
		wake := bizPolicyWaitChan(owner, appName)

		current, err := getBizPolicyVersion(owner, appName)
		if err != nil {
			return nil, err
		}
		if !hasSince || since != current {
			return buildBizWatchResult(owner, appName, since, hasSince, current)
		}

		select {
		case <-wake:
		case <-poll.C:
		case <-deadline.C:
			return &BizWatchResult{}, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

func buildBizWatchResult(owner, appName string, since int64, hasSince bool, current int64) (*BizWatchResult, error) {
	if hasSince && since < current {
		rows, err := getBizChangelogSince(owner, appName, since, current)
		if err != nil {
			return nil, err
		}
		if changes, full := classifyBizChangelog(since, current, rows); !full {
			return &BizWatchResult{Incremental: &BizWatchIncrementalResponse{
				Type: "incremental", FromVersion: since, ToVersion: current, Changes: changes,
			}}, nil
		}
	}

	// Full snapshot. `current` was read before the rows below, and syncs
	// persist the policy table BEFORE bumping policy_version, so rows read
	// from the DB are never older than `current` (re-applying a delta on a
	// newer snapshot is safe). The Redis / local caches are deliberately
	// bypassed: another instance may see the new version before its cache is
	// invalidated, which would label stale data with the new version and keep
	// the SDK from ever converging.
	modelText, policies, grouping, err := loadBizPoliciesFromDB(owner, appName)
	if err != nil {
		return nil, err
	}
	if policies == nil {
		policies = [][]string{}
	}
	if grouping == nil {
		grouping = [][]string{}
	}
	return &BizWatchResult{Full: &BizWatchFullResponse{
		Type: "full", Version: current, ModelText: modelText, Policies: policies, GroupingPolicies: grouping,
	}}, nil
}

// GetBizPolicyVersionForApp resolves the app and returns its policy version.
func GetBizPolicyVersionForApp(owner, appName string) (*BizPolicyVersionResponse, error) {
	if util.IsStringsEmpty(owner, appName) {
		return nil, fmt.Errorf("owner and appName are required")
	}
	v, err := getBizPolicyVersion(owner, appName)
	if err != nil {
		return nil, err
	}
	return &BizPolicyVersionResponse{Version: v}, nil
}

// loadBizPoliciesFromDB reads the model text and the persisted policy rows
// straight from the DB (no cache involved).
func loadBizPoliciesFromDB(owner, appName string) (string, [][]string, [][]string, error) {
	config, err := getBizAppConfigOrError(owner, appName)
	if err != nil {
		return "", nil, nil, err
	}
	e, err := buildBizEnforcer(config)
	if err != nil {
		return "", nil, nil, err
	}
	policies, grouping := extractPolicies(e)
	return config.ModelText, policies, grouping, nil
}
