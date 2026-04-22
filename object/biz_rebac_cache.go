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
	"sync"
	"time"
)

const bizTuplesetCacheTTL = 10 * time.Second

// tuplesetCacheEntry wraps the cached value with its expiry. Using
// value-type (not pointer) so sync.Map stores the copy; no shared
// mutation after Store.
type tuplesetCacheEntry struct {
	value   []tupleRef
	expires time.Time
}

// bizTuplesetCache is keyed by "{storeId}|{object}#{relation}" →
// *tuplesetCacheEntry. Package-level so multiple Check requests across
// the same app share the cache. Cleared entirely on schema advance via
// flushBizTuplesetCacheForStore.
var bizTuplesetCache sync.Map // string -> *tuplesetCacheEntry

func bizTuplesetCacheKey(storeId, object, relation string) string {
	return storeId + "|" + object + "#" + relation
}

// loadBizTuplesetCache returns the cached tupleset for
// (storeId, object, relation) or nil,false if missing/expired.
func loadBizTuplesetCache(storeId, object, relation string) ([]tupleRef, bool) {
	v, ok := bizTuplesetCache.Load(bizTuplesetCacheKey(storeId, object, relation))
	if !ok {
		return nil, false
	}
	entry := v.(*tuplesetCacheEntry)
	if time.Now().After(entry.expires) {
		bizTuplesetCache.Delete(bizTuplesetCacheKey(storeId, object, relation))
		return nil, false
	}
	return entry.value, true
}

// storeBizTuplesetCache writes an entry with the default TTL. Callers
// pass the already-deduplicated refs slice from the DB path.
func storeBizTuplesetCache(storeId, object, relation string, refs []tupleRef) {
	bizTuplesetCache.Store(
		bizTuplesetCacheKey(storeId, object, relation),
		&tuplesetCacheEntry{
			value:   refs,
			expires: time.Now().Add(bizTuplesetCacheTTL),
		},
	)
}

// invalidateBizTuplesetCacheKey evicts a single (storeId, object,
// relation) slot. Called by tuple writes / deletes that touched only
// that slot's rows.
func invalidateBizTuplesetCacheKey(storeId, object, relation string) {
	bizTuplesetCache.Delete(bizTuplesetCacheKey(storeId, object, relation))
}

// flushBizTuplesetCacheForStore evicts every entry belonging to the
// store. Called when the app's authorization model advances — a schema
// change can reclassify which subjects are valid under which relation,
// so a pre-advance cached set might be stale.
func flushBizTuplesetCacheForStore(storeId string) {
	prefix := storeId + "|"
	bizTuplesetCache.Range(func(k, _ any) bool {
		ks, ok := k.(string)
		if !ok {
			return true
		}
		if len(ks) >= len(prefix) && ks[:len(prefix)] == prefix {
			bizTuplesetCache.Delete(ks)
		}
		return true
	})
}
