// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"testing"
	"time"

	"golang.org/x/time/rate"
)

// TestReBACRateLimit_BurstThenBlock exercises the CK-B acceptance case:
// with rps=20 / burst=40, 40 instantaneous requests are all admitted,
// but the 41st (still within the same burst window) is rejected.
func TestReBACRateLimit_BurstThenBlock(t *testing.T) {
	rl := newReBACRateLimiter(rate.Limit(20), 40)
	defer rl.Close()
	for i := 0; i < 40; i++ {
		if !rl.Allow("store/a", "user:alice") {
			t.Fatalf("expected first 40 to be allowed, blocked at i=%d", i)
		}
	}
	if rl.Allow("store/a", "user:alice") {
		t.Error("41st request should have been blocked by the token bucket")
	}
}

// TestReBACRateLimit_IsolationPerKey asserts that exhausting one user's
// bucket does not affect another user in the same store.
func TestReBACRateLimit_IsolationPerKey(t *testing.T) {
	rl := newReBACRateLimiter(rate.Limit(20), 40)
	defer rl.Close()
	for i := 0; i < 40; i++ {
		_ = rl.Allow("store/a", "user:alice")
	}
	if !rl.Allow("store/a", "user:bob") {
		t.Error("different user shouldn't share alice's bucket")
	}
	if !rl.Allow("store/b", "user:alice") {
		t.Error("different store shouldn't share alice's bucket")
	}
}

// TestReBACRateLimit_ColdKeyGC verifies that idle buckets are reclaimed
// by gcOnce. Uses short intervals + gcOnce() directly so the test isn't
// flaky against real tickers.
func TestReBACRateLimit_ColdKeyGC(t *testing.T) {
	rl := newReBACRateLimiter(rate.Limit(20), 40)
	defer rl.Close()
	rl.idleTimeout = 50 * time.Millisecond
	_ = rl.Allow("store/a", "user:idle")
	if rl.size() != 1 {
		t.Fatalf("expected 1 bucket, got %d", rl.size())
	}
	time.Sleep(80 * time.Millisecond)
	rl.gcOnce()
	if rl.size() != 0 {
		t.Errorf("expected 0 buckets after GC, got %d", rl.size())
	}
}

// TestReBACRateLimit_MaxKeysEvictsOldest asserts that once maxKeys is
// reached, the LRU bucket is evicted to make room for a new one.
func TestReBACRateLimit_MaxKeysEvictsOldest(t *testing.T) {
	rl := newReBACRateLimiter(rate.Limit(20), 40)
	defer rl.Close()
	rl.maxKeys = 3

	// Fill to max with staggered lastUse so "oldest" is well-defined.
	for _, u := range []string{"alice", "bob", "carol"} {
		rl.Allow("store/a", u)
		time.Sleep(2 * time.Millisecond)
	}
	if rl.size() != 3 {
		t.Fatalf("expected 3 at cap, got %d", rl.size())
	}

	// 4th user — should evict alice (oldest).
	rl.Allow("store/a", "dave")
	if rl.size() != 3 {
		t.Fatalf("expected size 3 after eviction, got %d", rl.size())
	}
	rl.mu.Lock()
	_, aliceStillThere := rl.buckets["store/a|alice"]
	_, daveAdmitted := rl.buckets["store/a|dave"]
	rl.mu.Unlock()
	if aliceStillThere {
		t.Error("oldest key (alice) should have been evicted")
	}
	if !daveAdmitted {
		t.Error("new key (dave) should be present after eviction")
	}
}

// TestInitBizReBACRateLimiter_Defaults checks that bad config (zero
// rps / burst) still yields a working limiter rather than crashing.
func TestInitBizReBACRateLimiter_Defaults(t *testing.T) {
	prev := bizListRateLimiter
	defer func() {
		if bizListRateLimiter != nil {
			bizListRateLimiter.Close()
		}
		bizListRateLimiter = prev
	}()

	InitBizReBACRateLimiter(0, 0)
	if bizListRateLimiter == nil {
		t.Fatal("InitBizReBACRateLimiter(0,0) should still install a limiter")
	}
	if !AllowBizReBACListObjects("store/a", "user:alice") {
		t.Error("fresh limiter with default burst=40 should admit the first request")
	}
}
