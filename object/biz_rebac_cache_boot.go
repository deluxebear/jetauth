// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_cache_boot.go wires the process-wide ReBAC tupleset cache
// at startup. Default path leaves the in-memory L2 installed by
// biz_rebac_cache.go's init(). When both bizReBACCacheL3Enabled=true
// and a Redis endpoint is configured, this swaps in a TieredCache
// (L2 + RedisBizReBACCache) via SetBizReBACCache.
//
// main.go calls InitBizReBACCache after conf is loaded. Any failure
// to reach Redis is logged and degrades to L2-only — the goal is that
// a misconfigured Redis never takes the admin API offline.

package object

import (
	"strconv"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/conf"
)

// InitBizReBACCache is the boot-time hook. It is safe to call before
// any cache access; the default L2 has already been installed by
// init() in biz_rebac_cache.go, so skipping this function (or failing
// silently) leaves the cache in a working state.
//
// Config keys (all read via conf.GetConfigString so env-var overrides
// work the same as app.conf):
//   - bizReBACCacheL3Enabled  — bool, default false; if false this
//     function is a no-op.
//   - bizReBACCacheL3Addr     — string host:port for Redis; falls back
//     to redisEndpoint (the session store's address) when empty, so
//     typical deployments need only one key to switch on L3.
//   - bizReBACCacheL3Password — string, optional.
//   - bizReBACCacheL3DB       — int, default 0.
//   - bizReBACCacheL3KeyPrefix — string, default "jetauth:rebac:".
//   - bizReBACCacheL3Channel  — string, default "jetauth:rebac:invalidations".
func InitBizReBACCache() {
	if !conf.GetConfigBool("bizReBACCacheL3Enabled") {
		logs.Info("biz rebac cache: L3 disabled, using L2-only (set bizReBACCacheL3Enabled=true to enable)")
		return
	}

	addr := conf.GetConfigString("bizReBACCacheL3Addr")
	if addr == "" {
		addr = conf.GetConfigString("redisEndpoint")
	}
	if addr == "" {
		logs.Warning("biz rebac cache: L3 enabled but no Redis address configured (bizReBACCacheL3Addr / redisEndpoint) — staying on L2-only")
		return
	}

	opts := RedisBizReBACCacheOptions{
		Addr:       addr,
		Password:   conf.GetConfigString("bizReBACCacheL3Password"),
		KeyPrefix:  conf.GetConfigString("bizReBACCacheL3KeyPrefix"),
		ChannelKey: conf.GetConfigString("bizReBACCacheL3Channel"),
	}
	if dbStr := conf.GetConfigString("bizReBACCacheL3DB"); dbStr != "" {
		if db, err := strconv.Atoi(dbStr); err == nil {
			opts.DB = db
		} else {
			logs.Warning("biz rebac cache: invalid bizReBACCacheL3DB=%q, defaulting to 0: %v", dbStr, err)
		}
	}

	tc, err := NewTieredCacheWithRedis(opts)
	if err != nil {
		// Don't fail boot — L2-only is a correct fallback.
		logs.Warning("biz rebac cache: L3 Redis connect failed at %s, staying on L2-only: %v", addr, err)
		return
	}
	SetBizReBACCache(tc)
	logs.Info("biz rebac cache: L3 Redis connected at %s (prefix=%q, channel=%q)", addr, opts.KeyPrefix, opts.ChannelKey)
}
