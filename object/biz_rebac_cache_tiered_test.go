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

package object

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

// testingCounterValue reads the current value of a CounterVec label
// without pulling in prometheus/client_golang/prometheus/testutil
// (not vendored). Returns 0.0 if the labeled counter doesn't exist yet.
func testingCounterValue(t *testing.T, cv *prometheus.CounterVec, label string) float64 {
	t.Helper()
	c, err := cv.GetMetricWithLabelValues(label)
	if err != nil {
		t.Fatalf("GetMetricWithLabelValues(%q): %v", label, err)
	}
	var m dto.Metric
	if err := c.Write(&m); err != nil {
		t.Fatalf("counter.Write: %v", err)
	}
	return m.GetCounter().GetValue()
}

// fakeL3 is a tiny in-process stand-in for RedisBizReBACCache — implements
// BizReBACCache but doesn't talk to Redis. Used to exercise TieredCache
// behavior without requiring REBAC_REDIS_TEST_ADDR.
type fakeL3 struct {
	mu           sync.Mutex
	data         map[cacheKey][]tupleRef
	invalidated  []cacheKey
	flushed      []string
	onInvalidate func(k cacheKey)
	onFlushStore func(storeId string)
}

func newFakeL3() *fakeL3 { return &fakeL3{data: map[cacheKey][]tupleRef{}} }

func (f *fakeL3) Get(_ context.Context, k cacheKey) ([]tupleRef, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	v, ok := f.data[k]
	return v, ok
}

func (f *fakeL3) Set(_ context.Context, k cacheKey, refs []tupleRef, _ time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.data[k] = refs
}

func (f *fakeL3) Invalidate(_ context.Context, k cacheKey) {
	f.mu.Lock()
	f.invalidated = append(f.invalidated, k)
	delete(f.data, k)
	f.mu.Unlock()
	// Echo back like the real L3's pub/sub would.
	if f.onInvalidate != nil {
		f.onInvalidate(k)
	}
}

func (f *fakeL3) FlushStore(_ context.Context, storeId string) {
	f.mu.Lock()
	f.flushed = append(f.flushed, storeId)
	for k := range f.data {
		if k.StoreId == storeId {
			delete(f.data, k)
		}
	}
	f.mu.Unlock()
	if f.onFlushStore != nil {
		f.onFlushStore(storeId)
	}
}
func (f *fakeL3) Close() error { return nil }

func TestTieredCache_Contract(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	// Wire fake callbacks BEFORE NewTieredCache so the test mirrors the
	// production order (callbacks set before subscriber goroutine — see
	// NewTieredCacheWithRedis).
	l3.onInvalidate = func(k cacheKey) { l2.Invalidate(context.Background(), k) }
	l3.onFlushStore = func(id string) { l2.FlushStore(context.Background(), id) }
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	BizReBACCacheContractTest(t, tc)
}

func TestTieredCache_ReadThroughL3(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	key := cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}
	// Seed only L3 (simulate another instance wrote it).
	l3.data[key] = []tupleRef{{User: "u:alice"}}

	refs, ok := tc.Get(ctx, key)
	if !ok || len(refs) != 1 || refs[0].User != "u:alice" {
		t.Fatalf("expected L3 read-through hit, got ok=%v refs=%v", ok, refs)
	}
	// Subsequent L2 hit — L3 should NOT be consulted again. We can't easily
	// assert "not consulted" without instrumentation; verify L2 contains it:
	if l2Refs, l2ok := l2.Get(ctx, key); !l2ok || len(l2Refs) != 1 {
		t.Error("L2 must be warmed from L3 read-through")
	}
}

func TestTieredCache_WriteTouchesBothTiers(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	key := cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}
	tc.Set(ctx, key, []tupleRef{{User: "u:alice"}}, 5*time.Second)

	if _, ok := l2.Get(ctx, key); !ok {
		t.Error("L2 must see write")
	}
	if _, ok := l3.Get(ctx, key); !ok {
		t.Error("L3 must see write")
	}
}

func TestTieredCache_InvalidateTouchesBothTiers(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	// Wire fake callbacks BEFORE NewTieredCache so the test mirrors the
	// production order (callbacks set before subscriber goroutine — see
	// NewTieredCacheWithRedis).
	l3.onInvalidate = func(k cacheKey) { l2.Invalidate(context.Background(), k) }
	l3.onFlushStore = func(id string) { l2.FlushStore(context.Background(), id) }
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	key := cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}
	tc.Set(ctx, key, []tupleRef{{User: "u:alice"}}, 5*time.Second)
	tc.Invalidate(ctx, key)

	if _, ok := l2.Get(ctx, key); ok {
		t.Error("L2 must miss after invalidate")
	}
	if _, ok := l3.Get(ctx, key); ok {
		t.Error("L3 must miss after invalidate")
	}
	if len(l3.invalidated) != 1 {
		t.Errorf("L3 Invalidate called %d times, want 1", len(l3.invalidated))
	}
}

func TestTieredCache_FlushStoreTouchesBothTiers(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	// Wire fake callbacks BEFORE NewTieredCache so the test mirrors the
	// production order (callbacks set before subscriber goroutine — see
	// NewTieredCacheWithRedis).
	l3.onInvalidate = func(k cacheKey) { l2.Invalidate(context.Background(), k) }
	l3.onFlushStore = func(id string) { l2.FlushStore(context.Background(), id) }
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	k1 := cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}
	k2 := cacheKey{StoreId: "s/b", Object: "o:2", Relation: "r"}
	tc.Set(ctx, k1, []tupleRef{{User: "u:a"}}, 5*time.Second)
	tc.Set(ctx, k2, []tupleRef{{User: "u:b"}}, 5*time.Second)
	tc.FlushStore(ctx, "s/a")

	if _, ok := l2.Get(ctx, k1); ok {
		t.Error("k1 L2 miss expected")
	}
	if _, ok := l2.Get(ctx, k2); !ok {
		t.Error("k2 L2 should survive (different store)")
	}
	if _, ok := l3.Get(ctx, k1); ok {
		t.Error("k1 L3 miss expected")
	}
	if _, ok := l3.Get(ctx, k2); !ok {
		t.Error("k2 L3 should survive")
	}
}

func TestTieredCache_PubSubEchoInvalidatesL2(t *testing.T) {
	// Simulates the real L3's pub/sub echo: when any instance invalidates,
	// the echo fires L3.OnInvalidate on ALL instances (including the
	// publisher). TieredCache.invalidateL2 is that callback's target.
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	// Wire fake callbacks BEFORE NewTieredCache so the test mirrors the
	// production order (callbacks set before subscriber goroutine — see
	// NewTieredCacheWithRedis).
	l3.onInvalidate = func(k cacheKey) { l2.Invalidate(context.Background(), k) }
	l3.onFlushStore = func(id string) { l2.FlushStore(context.Background(), id) }
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	key := cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}
	tc.Set(ctx, key, []tupleRef{{User: "u:a"}}, 5*time.Second)
	// Simulate the echo by directly invoking the callback — this is what
	// the real L3 pub/sub does on a cross-instance invalidation arrival.
	if tc.onInvalidateForTest != nil {
		tc.onInvalidateForTest(key)
	}
	if _, ok := l2.Get(ctx, key); ok {
		t.Error("L2 must be invalidated via pub/sub echo callback")
	}
}

func TestTieredCache_StarFlushAllStores(t *testing.T) {
	// When L3 pub/sub disconnects, B3.2 fires OnFlushStore("*") pessimistically.
	// TieredCache must treat "*" as "flush all L2 entries".
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	// Wire fake callbacks BEFORE NewTieredCache so the test mirrors the
	// production order (callbacks set before subscriber goroutine — see
	// NewTieredCacheWithRedis).
	l3.onInvalidate = func(k cacheKey) { l2.Invalidate(context.Background(), k) }
	l3.onFlushStore = func(id string) { l2.FlushStore(context.Background(), id) }
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	tc.Set(ctx, cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}, []tupleRef{{User: "u:a"}}, 5*time.Second)
	tc.Set(ctx, cacheKey{StoreId: "s/b", Object: "o:2", Relation: "r"}, []tupleRef{{User: "u:b"}}, 5*time.Second)

	if tc.onFlushStoreForTest != nil {
		tc.onFlushStoreForTest("*")
	}
	if _, ok := l2.Get(ctx, cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}); ok {
		t.Error("expected all L2 entries flushed on *")
	}
	if _, ok := l2.Get(ctx, cacheKey{StoreId: "s/b", Object: "o:2", Relation: "r"}); ok {
		t.Error("expected all L2 entries flushed on *")
	}
}

// TestTieredCache_SetCapsL2TTL locks in the B3.3 invariant: the L2
// tier must never outlive L3. A caller passing ttl > bizTuplesetCacheTTL
// should see L2 expire at bizTuplesetCacheTTL while L3 keeps the caller
// TTL. We can't observe L3's TTL on the fake, but we can verify the L2
// value used via the in-memory cache's internal expiresAt.
func TestTieredCache_SetCapsL2TTL(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	k := cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"}
	tc.Set(ctx, k, []tupleRef{{User: "u:a"}}, time.Hour)

	v, ok := l2.m.Load(k)
	if !ok {
		t.Fatal("expected L2 to have the entry after Set")
	}
	entry := v.(*cacheEntry)
	// Entry must expire no later than bizTuplesetCacheTTL from now.
	if time.Until(entry.expires) > bizTuplesetCacheTTL+time.Second {
		t.Errorf("L2 TTL not capped: expires in %v, want <= %v",
			time.Until(entry.expires), bizTuplesetCacheTTL)
	}

	// ttl <= 0 must still write both tiers (not a no-op) with the default
	// L2 cap, otherwise Redis would persist-forever on L3 and invert the
	// invariant.
	k2 := cacheKey{StoreId: "s/a", Object: "o:2", Relation: "r"}
	tc.Set(ctx, k2, []tupleRef{{User: "u:a"}}, 0)
	if _, ok := l2.Get(ctx, k2); !ok {
		t.Error("expected L2 to have the entry even when caller passes ttl=0")
	}
	if _, ok := l3.Get(ctx, k2); !ok {
		t.Error("expected L3 to have the entry even when caller passes ttl=0")
	}
}

// TestTieredCache_FlushOrderProtectsL2 guards against the race where
// Get fall-through (L2 miss → L3 hit → L2 warm) could re-populate L2
// with a stale tupleset if FlushStore cleared L2 before L3. The
// regression shape is: FlushStore returns, but a subsequent Get on the
// same instance still sees stale data. With L3-first ordering this
// can't happen — if the Get won the race, it's on cached data that
// hasn't been invalidated yet, which is fine; if the flush won, both
// tiers are clear.
func TestTieredCache_FlushOrderProtectsL2(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	storeId := "s/a"
	k := cacheKey{StoreId: storeId, Object: "o:1", Relation: "r"}
	tc.Set(ctx, k, []tupleRef{{User: "u:a"}}, 5*time.Second)

	tc.FlushStore(ctx, storeId)

	// After FlushStore returns, neither tier may be able to serve the key.
	if _, ok := l2.Get(ctx, k); ok {
		t.Error("L2 still has entry after FlushStore — flush order bug")
	}
	if _, ok := l3.Get(ctx, k); ok {
		t.Error("L3 still has entry after FlushStore")
	}

	// Same shape for Invalidate.
	tc.Set(ctx, k, []tupleRef{{User: "u:a"}}, 5*time.Second)
	tc.Invalidate(ctx, k)
	if _, ok := l2.Get(ctx, k); ok {
		t.Error("L2 still has entry after Invalidate — flush order bug")
	}
	if _, ok := l3.Get(ctx, k); ok {
		t.Error("L3 still has entry after Invalidate")
	}
}

// TestTieredCache_PerTierMetrics asserts that TieredCache.Get emits the
// correct hit/miss counters per tier. The commit wiring inlines the
// recordReBACCacheHit/Miss calls rather than wrapping sub-tiers with
// InstrumentedBizReBACCache — this test guards against flipping "l2"/
// "l3" labels or dropping an emit.
func TestTieredCache_PerTierMetrics(t *testing.T) {
	l2 := NewInMemoryBizReBACCache()
	l3 := newFakeL3()
	tc := NewTieredCache(l2, l3)
	defer tc.Close()
	ctx := context.Background()
	k := cacheKey{StoreId: "s/a", Object: "o:m", Relation: "r"}

	l2HitBefore := testingCounterValue(t, rebacCacheHits, "l2")
	l2MissBefore := testingCounterValue(t, rebacCacheMisses, "l2")
	l3HitBefore := testingCounterValue(t, rebacCacheHits, "l3")
	l3MissBefore := testingCounterValue(t, rebacCacheMisses, "l3")

	// Case 1: full miss — L2 miss + L3 miss.
	_, _ = tc.Get(ctx, k)
	if got := testingCounterValue(t, rebacCacheMisses, "l2") - l2MissBefore; got != 1 {
		t.Errorf("full miss: l2 miss delta = %v, want 1", got)
	}
	if got := testingCounterValue(t, rebacCacheMisses, "l3") - l3MissBefore; got != 1 {
		t.Errorf("full miss: l3 miss delta = %v, want 1", got)
	}

	// Case 2: L3 populated, L2 empty — L2 miss + L3 hit + L2 warm.
	l3.Set(ctx, k, []tupleRef{{User: "u:a"}}, time.Minute)
	_, _ = tc.Get(ctx, k)
	if got := testingCounterValue(t, rebacCacheMisses, "l2") - l2MissBefore; got != 2 {
		t.Errorf("l3 hit: l2 miss delta = %v, want 2", got)
	}
	if got := testingCounterValue(t, rebacCacheHits, "l3") - l3HitBefore; got != 1 {
		t.Errorf("l3 hit: l3 hit delta = %v, want 1", got)
	}

	// Case 3: second Get — L2 has been warmed, so L2 hit and L3 untouched.
	_, _ = tc.Get(ctx, k)
	if got := testingCounterValue(t, rebacCacheHits, "l2") - l2HitBefore; got != 1 {
		t.Errorf("l2 hit: l2 hit delta = %v, want 1", got)
	}
	if got := testingCounterValue(t, rebacCacheHits, "l3") - l3HitBefore; got != 1 {
		t.Errorf("l2 hit: l3 hit delta = %v, want 1 (unchanged from case 2)", got)
	}
}
