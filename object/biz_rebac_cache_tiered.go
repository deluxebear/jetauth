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

// NewTieredCache wires a pair of tiers into one BizReBACCache. If the
// L3 is a *RedisBizReBACCache whose OnInvalidate / OnFlushStore aren't
// yet set, this constructor installs callbacks that push L3 broadcasts
// into L2.
//
// For fakes / custom L3 impls: the constructor exposes
// onInvalidateForTest / onFlushStoreForTest so test code can invoke the
// same callback wiring without a real RedisBizReBACCache.
func NewTieredCache(l2, l3 BizReBACCache) *TieredCache {
	tc := &TieredCache{l2: l2, l3: l3}
	invalidateL2 := func(k cacheKey) {
		l2.Invalidate(context.Background(), k)
	}
	flushL2 := func(storeId string) {
		if storeId == "*" {
			// Pessimistic flush: flush every L2 entry. The
			// InMemoryBizReBACCache doesn't expose a "flush all" method
			// in the BizReBACCache interface (deliberately — only the
			// tiered wrapper has the authority to declare "all stores
			// are suspect"). We delegate to flushAll() on the concrete
			// type. This is safe as long as no caller holds a direct
			// reference to the old L2 (the wrapper owns it).
			if inMem, ok := l2.(*InMemoryBizReBACCache); ok {
				inMem.flushAll()
				return
			}
			// For non-InMemory L2 impls we can't flush-all; fall back
			// to no-op with no warning — the interface doesn't expose
			// FlushAll by design. Future: add FlushAll if needed.
			return
		}
		l2.FlushStore(context.Background(), storeId)
	}
	// If L3 is the real Redis impl, install callbacks. Otherwise caller
	// can wire manually via the test handles.
	if r, ok := l3.(*RedisBizReBACCache); ok {
		r.opts.OnInvalidate = invalidateL2
		r.opts.OnFlushStore = flushL2
	}
	tc.onInvalidateForTest = invalidateL2
	tc.onFlushStoreForTest = flushL2
	return tc
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

// Set writes to both tiers synchronously. L2 uses bizTuplesetCacheTTL;
// the caller's TTL is forwarded to L3 (typically longer, e.g. 5 min).
// The invariant that L2's TTL ≤ L3's is enforced by convention.
func (t *TieredCache) Set(ctx context.Context, k cacheKey, refs []tupleRef, ttl time.Duration) {
	t.l2.Set(ctx, k, refs, bizTuplesetCacheTTL)
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
