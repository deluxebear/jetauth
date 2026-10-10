// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_policy_watcher.go implements cross-instance invalidation of the
// per-process biz Casbin enforcer cache using Redis pub/sub (TODO.md
// "业务权限模块 改进计划" 一、阶段 1).
//
// Every instance keeps its own in-memory enforcer (0.01ms enforce). When an
// instance rebuilds an app's policies (SyncAppPolicies) or deletes the app
// config, it publishes {owner, appName, version} on a Redis channel. All
// other instances drop their local enforcer for that app so the next
// GetBizEnforcer repopulates from the Redis policy cache or the DB.
//
// Off by default (bizPolicyWatcherEnabled=false). Any Redis failure degrades
// to the previous single-instance behaviour; the admin API never goes down
// because of the watcher.

package object

import (
	"context"
	"encoding/json"
	"strconv"
	"sync"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/util"
	"github.com/redis/go-redis/v9"
)

const defaultBizPolicyWatcherChannel = "/jetauth/biz-policy-update"

// bizPolicyMessage is the pub/sub payload.
type bizPolicyMessage struct {
	Instance string `json:"instance"`
	Owner    string `json:"owner"`
	AppName  string `json:"appName"`
	Version  int64  `json:"version"`
}

var (
	bizWatcherMu       sync.RWMutex
	bizWatcherClient   *redis.Client
	bizWatcherChannel  string
	bizWatcherInstance = util.GenerateId()
)

// InitBizPolicyWatcher is the boot hook (called from main.go after conf is
// loaded). Config keys:
//   - bizPolicyWatcherEnabled  — bool, default false; false makes this a no-op.
//   - bizPolicyWatcherAddr     — host:port; falls back to redisEndpoint.
//   - bizPolicyWatcherPassword — optional.
//   - bizPolicyWatcherDB       — int, default 0.
//   - bizPolicyWatcherChannel  — default "/jetauth/biz-policy-update".
func InitBizPolicyWatcher() {
	if !conf.GetConfigBool("bizPolicyWatcherEnabled") {
		logs.Info("biz policy watcher: disabled (set bizPolicyWatcherEnabled=true for multi-instance invalidation)")
		return
	}

	addr := conf.GetConfigString("bizPolicyWatcherAddr")
	if addr == "" {
		addr = conf.GetConfigString("redisEndpoint")
	}
	if addr == "" {
		logs.Warning("biz policy watcher: enabled but no Redis address configured (bizPolicyWatcherAddr / redisEndpoint) — staying local-only")
		return
	}

	opts := &redis.Options{Addr: addr, Password: conf.GetConfigString("bizPolicyWatcherPassword")}
	if dbStr := conf.GetConfigString("bizPolicyWatcherDB"); dbStr != "" {
		if db, err := strconv.Atoi(dbStr); err == nil {
			opts.DB = db
		} else {
			logs.Warning("biz policy watcher: invalid bizPolicyWatcherDB=%q, defaulting to 0: %v", dbStr, err)
		}
	}
	channel := conf.GetConfigString("bizPolicyWatcherChannel")
	if channel == "" {
		channel = defaultBizPolicyWatcherChannel
	}

	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		logs.Warning("biz policy watcher: Redis connect failed at %s, staying local-only: %v", addr, err)
		_ = client.Close()
		return
	}

	bizWatcherMu.Lock()
	if bizWatcherClient != nil {
		_ = bizWatcherClient.Close()
	}
	bizWatcherClient = client
	bizWatcherChannel = channel
	bizWatcherMu.Unlock()

	sub := client.Subscribe(context.Background(), channel)
	util.SafeGoroutine(func() {
		// go-redis re-subscribes automatically after reconnects.
		for msg := range sub.Channel() {
			handleBizPolicyMessage([]byte(msg.Payload), bizWatcherInstance)
		}
	})
	logs.Info("biz policy watcher: subscribed to %q at %s (instance=%s)", channel, addr, bizWatcherInstance)
}

// handleBizPolicyMessage applies a received invalidation. Messages published
// by this very instance are ignored (it already holds the fresh enforcer).
func handleBizPolicyMessage(payload []byte, selfInstance string) {
	var m bizPolicyMessage
	if err := json.Unmarshal(payload, &m); err != nil {
		logs.Warning("biz policy watcher: bad message %q: %v", string(payload), err)
		return
	}
	if m.Instance == selfInstance || m.Owner == "" || m.AppName == "" {
		return
	}
	// Local-only drop: the publisher already refreshed/cleared Redis.
	bizEnforcerCache.Delete(util.GetId(m.Owner, m.AppName))
	notifyBizPolicyWatchers(m.Owner, m.AppName)
}

// publishBizPolicyUpdate broadcasts an invalidation to the other instances.
// No-op when the watcher is not initialised.
func publishBizPolicyUpdate(owner, appName string, version int64) {
	bizWatcherMu.RLock()
	client, channel := bizWatcherClient, bizWatcherChannel
	bizWatcherMu.RUnlock()
	if client == nil {
		return
	}
	payload, err := json.Marshal(bizPolicyMessage{Instance: bizWatcherInstance, Owner: owner, AppName: appName, Version: version})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Publish(ctx, channel, payload).Err(); err != nil {
		logs.Warning("biz policy watcher: publish failed for %s/%s: %v", owner, appName, err)
	}
}
