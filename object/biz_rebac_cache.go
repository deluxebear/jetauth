// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_cache.go owns the L2 in-process tuple cache layer for the
// ReBAC engine (spec §6.6 row 2). Keyed by (storeId, object, relation)
// with a short TTL; read path hits cache before DB, write path
// invalidates touched keys. L1 (per-request memo) stays inside
// checkContext; L3 (Redis) is a follow-up — the read/write hooks here
// are the same shape so adding it later is additive, not surgical.
//
// Design decisions:
//   - TTL is short (10s) because Check correctness after tuple writes
//     must converge fast. Write-path invalidation is the primary
//     freshness mechanism; TTL is only a safety net for missed
//     invalidations (e.g. cross-process writes in the multi-instance
//     era CP-8 plans to handle via Redis pub/sub).
//   - Entry value is []tupleRef (not raw *BizTuple) so callers stay
//     oblivious to ORM types.
//   - Contextual tuples are NEVER cached — they're per-request grants
//     by definition.
//   - Cache is keyed by (storeId, object, relation) — the same
//     granularity tuplesetTuples queries at. Finer keying (per-user)
//     would cache Check results, which spec §6.6 explicitly rules out
//     ("Check 结果不缓存").

package object

import (
	"context"
	"sync/atomic"
	"time"
)

// bizTuplesetCacheTTL is the TTL applied when a tupleset is cached
// at the tier-1 (in-memory) layer. Kept as a package constant so
// callers share the same value with every cache tier.
const bizTuplesetCacheTTL = 10 * time.Second

// bizReBACCache is the active tupleset cache for this process.
// Default is the in-memory L2 impl (BizReBACCache interface from
// biz_rebac_cache_interface.go). CP-8 C6 will replace this with a
// TieredCache(L2, L3Redis) at boot when bizReBACCacheL3Enabled=true.
// Wrapped in atomic.Pointer so SetBizReBACCache is safe to call
// concurrently with cache access (e.g. tests swapping fakes in parallel).
var bizReBACCache atomic.Pointer[BizReBACCache]

func init() {
	bizReBACCache.Store(ptrTo[BizReBACCache](NewInMemoryBizReBACCache()))
}

// ptrTo returns a pointer to v. Used with atomic.Pointer[interface] where
// the compiler requires an addressable value.
func ptrTo[T any](v T) *T { return &v }

// SetBizReBACCache replaces the process-wide tupleset cache. Intended for
// main.go boot-time wiring (CP-8 C6 TieredCache); tests may also swap
// in fakes. Safe to call concurrently with cache access via atomic store.
// Passing nil panics fast rather than deferring a later NPE.
func SetBizReBACCache(c BizReBACCache) {
	if c == nil {
		panic("SetBizReBACCache: nil cache")
	}
	bizReBACCache.Store(&c)
}

// TODO(CP-8 C6): thread request ctx from engine callers instead of
// constructing Background() here; matters for Redis L3 Get cancellation.

// loadBizTuplesetCache returns cached tuplerefs for (storeId, object, relation)
// or (nil, false) on miss / expired. Preserves the pre-CP-8 package API.
func loadBizTuplesetCache(storeId, object, relation string) ([]tupleRef, bool) {
	return (*bizReBACCache.Load()).Get(context.Background(), cacheKey{StoreId: storeId, Object: object, Relation: relation})
}

// storeBizTuplesetCache writes an entry with the default TTL. Callers
// pass the already-deduplicated refs slice from the DB path.
func storeBizTuplesetCache(storeId, object, relation string, refs []tupleRef) {
	(*bizReBACCache.Load()).Set(context.Background(), cacheKey{StoreId: storeId, Object: object, Relation: relation}, refs, bizTuplesetCacheTTL)
}

// invalidateBizTuplesetCacheKey evicts a single tupleset from the cache.
// Called after tuple writes/deletes that change that exact (object, relation) set.
func invalidateBizTuplesetCacheKey(storeId, object, relation string) {
	(*bizReBACCache.Load()).Invalidate(context.Background(), cacheKey{StoreId: storeId, Object: object, Relation: relation})
}

// flushBizTuplesetCacheForStore evicts every entry for a store. Called on
// schema advance, which can change which tuples are admitted by type
// restrictions.
func flushBizTuplesetCacheForStore(storeId string) {
	(*bizReBACCache.Load()).FlushStore(context.Background(), storeId)
}
