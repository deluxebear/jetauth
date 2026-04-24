// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// biz_rebac_cache_tiered.go composes the in-memory L2 (fast, per-process)
// and the Redis L3 (slow, cross-instance) tiers into a single BizReBACCache.
// Reads: L2 → L3 (warm L2 on hit) → miss.
// Writes: L2 + L3 (sync).
// Invalidate / FlushStore: both tiers, plus L3's pub/sub broadcasts the
// event to every peer instance's subscriber goroutine, which calls back
// into this wrapper's L2 invalidation. See CP-8 C6 spec SC-6.
//
// Design decision: L3.Set is called sync, not async. A failure is logged
// inside RedisBizReBACCache and the cache tier degrades to L2-only for
// that write; no exception surfaces to callers. This keeps the call
// ordering simple and avoids managing a goroutine pool for a cold write
// path.

package object

import (
	"context"
	"time"

	"github.com/beego/beego/v2/core/logs"
)

// TieredCache is the L2+L3 composition. Safe for concurrent use as long
// as the underlying tiers are (both InMemoryBizReBACCache and
// RedisBizReBACCache are).
type TieredCache struct {
	l2 BizReBACCache
	l3 BizReBACCache

	// onInvalidateForTest / onFlushStoreForTest — unexported handles the
	// unit tests use to simulate pub/sub echo. In production the real L3
	// invokes these callbacks via its subscriber goroutine; tests don't
	// want to rely on Redis being reachable so they call directly.
	onInvalidateForTest func(k cacheKey)
	onFlushStoreForTest func(storeId string)
}

// Compile-time interface guard.
var _ BizReBACCache = (*TieredCache)(nil)

// NewTieredCache wires a pair of tiers into one BizReBACCache. The caller
// is responsible for ensuring L3's OnInvalidate/OnFlushStore callbacks
// are already wired to flush L2 before passing L3 to this constructor —
// post-hoc mutation would race with the subscriber goroutine. Use
// NewTieredCacheWithRedis below when starting with raw RedisBizReBACCacheOptions.
//
// For fakes / custom L3 impls used in tests: wire callbacks on the fake
// BEFORE calling NewTieredCache so the initialization order matches production.
// The onInvalidateForTest / onFlushStoreForTest handles expose the same
// closures this constructor would build internally for direct invocation.
func NewTieredCache(l2, l3 BizReBACCache) *TieredCache {
	tc := &TieredCache{l2: l2, l3: l3}
	tc.onInvalidateForTest = func(k cacheKey) { l2.Invalidate(context.Background(), k) }
	tc.onFlushStoreForTest = tc.buildFlushL2()
	return tc
}

// buildFlushL2 returns the flush-L2 closure used both as the test handle
// and by NewTieredCacheWithRedis. Factored out because the star-flush
// path needs access to the L2 reference for the type assertion.
func (t *TieredCache) buildFlushL2() func(storeId string) {
	return func(storeId string) {
		if storeId == "*" {
			if fresh, ok := t.l2.(*InMemoryBizReBACCache); ok {
				fresh.flushAll()
				return
			}
			// Non-InMemory L2 can't flush-all via the current interface.
			// This is the pessimistic-recovery path: a silent no-op here
			// means the cache may serve stale data until TTLs expire on
			// cross-instance writes that arrived during a pub/sub outage.
			// Log at WARNING so operators can detect the mismatch.
			logs.Warning("rebac tiered cache: star-flush requested but L2 is not *InMemoryBizReBACCache — cache may serve stale data after pub/sub disconnect")
			return
		}
		t.l2.FlushStore(context.Background(), storeId)
	}
}

// NewTieredCacheWithRedis constructs both tiers together: an
// in-memory L2 (auto-created) and a RedisBizReBACCache L3 built from
// `redisOpts`. The callbacks that fan pub/sub invalidations into L2
// are wired into `redisOpts` BEFORE NewRedisBizReBACCache runs, so
// the subscriber goroutine sees them at start — no race.
//
// This is the constructor main.go's boot wiring (CP-8 B3.4) should use.
// Tests with a fakeL3 should use NewTieredCache directly and wire their
// fake's callbacks manually before calling NewTieredCache.
func NewTieredCacheWithRedis(redisOpts RedisBizReBACCacheOptions) (*TieredCache, error) {
	l2 := NewInMemoryBizReBACCache()
	// Pre-populate the flush closure using a throwaway TieredCache so we
	// can reference t.l2 from the flush closure. We'll replace t.l3 below.
	tc := &TieredCache{l2: l2}
	invalidateL2 := func(k cacheKey) { l2.Invalidate(context.Background(), k) }
	flushL2 := tc.buildFlushL2()

	// Install callbacks before constructing the Redis client so the
	// subscriber goroutine captures them at startup.
	redisOpts.OnInvalidate = invalidateL2
	redisOpts.OnFlushStore = flushL2

	r, err := NewRedisBizReBACCache(redisOpts)
	if err != nil {
		return nil, err
	}
	tc.l3 = r
	tc.onInvalidateForTest = invalidateL2
	tc.onFlushStoreForTest = flushL2
	return tc, nil
}

// Get checks L2 first, falls through to L3 on miss. On L3 hit, copies
// the value into L2 with L2's TTL so subsequent reads within the TTL
// are local-only.
func (t *TieredCache) Get(ctx context.Context, k cacheKey) ([]tupleRef, bool) {
	if refs, ok := t.l2.Get(ctx, k); ok {
		return refs, true
	}
	if refs, ok := t.l3.Get(ctx, k); ok {
		t.l2.Set(ctx, k, refs, bizTuplesetCacheTTL)
		return refs, true
	}
	return nil, false
}

// Set writes to both tiers synchronously. L2 TTL is min(caller TTL,
// bizTuplesetCacheTTL) so L2 never outlives L3. The invariant that
// L2's TTL ≤ L3's TTL is enforced here.
func (t *TieredCache) Set(ctx context.Context, k cacheKey, refs []tupleRef, ttl time.Duration) {
	l2TTL := ttl
	if l2TTL > bizTuplesetCacheTTL {
		l2TTL = bizTuplesetCacheTTL
	}
	t.l2.Set(ctx, k, refs, l2TTL)
	t.l3.Set(ctx, k, refs, ttl)
}

// Invalidate evicts the key from both tiers. L3's Invalidate broadcasts
// on the pub/sub channel, causing a return-trip that also invalidates
// the local L2 — that second call is idempotent.
func (t *TieredCache) Invalidate(ctx context.Context, k cacheKey) {
	t.l2.Invalidate(ctx, k)
	t.l3.Invalidate(ctx, k)
}

// FlushStore evicts an entire store from both tiers.
func (t *TieredCache) FlushStore(ctx context.Context, storeId string) {
	t.l2.FlushStore(ctx, storeId)
	t.l3.FlushStore(ctx, storeId)
}

// Close closes both tiers. Returns the first non-nil error encountered.
func (t *TieredCache) Close() error {
	err1 := t.l3.Close()
	err2 := t.l2.Close()
	if err1 != nil {
		return err1
	}
	return err2
}
