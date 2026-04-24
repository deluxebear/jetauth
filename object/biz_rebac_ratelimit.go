// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_ratelimit.go is the per-(store,user) token-bucket rate
// limiter gating ReBAC list endpoints (spec §6.3.1, §SC-3). It keeps
// one rate.Limiter per key in a map protected by a single mutex, and
// runs a background GC that evicts idle buckets so cardinality can't
// grow without bound.
//
// Defaults:
//   - 20 rps sustained, 40 burst — so a well-behaved client can page
//     through a large result set in parallel without hitting 429, while
//     a script hammering the same key saturates on the 41st unblocked
//     request (CK-B acceptance case).
//   - 10 000-key soft cap — when exceeded, the least-recently-used
//     bucket is evicted to make room. 10k is ~1 MB of liveness map at
//     steady state, cheap on server RAM, generous enough to cover tens
//     of thousands of active users.
//   - 10-minute idle timeout — matches the longest reasonable "user
//     ran a batch script" window.

package object

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// reBACRateLimiter is the per-(store,user) token bucket. Zero value is
// NOT usable — always construct via newReBACRateLimiter so the GC
// goroutine is actually launched.
type reBACRateLimiter struct {
	rps   rate.Limit
	burst int

	mu      sync.Mutex
	buckets map[string]*rlBucket

	gcInterval  time.Duration
	idleTimeout time.Duration
	maxKeys     int

	// stopCh signals the GC loop to exit. Close() closes it; repeated
	// Close is safe via sync.Once.
	stopCh    chan struct{}
	stopOnce  sync.Once
	gcStopped chan struct{}
}

type rlBucket struct {
	l       *rate.Limiter
	lastUse time.Time
}

// newReBACRateLimiter builds a limiter and launches its GC loop. The GC
// runs every gcInterval (default 5 min) and evicts buckets untouched
// for idleTimeout (default 10 min).
func newReBACRateLimiter(rps rate.Limit, burst int) *reBACRateLimiter {
	r := &reBACRateLimiter{
		rps:         rps,
		burst:       burst,
		buckets:     make(map[string]*rlBucket),
		gcInterval:  5 * time.Minute,
		idleTimeout: 10 * time.Minute,
		maxKeys:     10000,
		stopCh:      make(chan struct{}),
		gcStopped:   make(chan struct{}),
	}
	go r.gcLoop()
	return r
}

// Allow reports whether the (storeId, user) pair may proceed. The
// token bucket is created on first access and touched on every call so
// the GC loop sees recent activity.
//
// The user argument may be empty — callers that gate on "the subject
// being queried" (e.g. ListUsers uses object as its cardinality key)
// pass a descriptive non-user string; isolation is still per-key.
func (r *reBACRateLimiter) Allow(storeId, user string) bool {
	key := storeId + "|" + user
	r.mu.Lock()
	b, ok := r.buckets[key]
	if !ok {
		if len(r.buckets) >= r.maxKeys {
			r.evictOldestLocked()
		}
		b = &rlBucket{l: rate.NewLimiter(r.rps, r.burst)}
		r.buckets[key] = b
	}
	b.lastUse = time.Now()
	r.mu.Unlock()
	return b.l.Allow()
}

// size returns the current number of live buckets. Intended for tests
// and the biz_rebac_ratelimit_map_size gauge if/when we wire one.
func (r *reBACRateLimiter) size() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.buckets)
}

// Close stops the GC goroutine. Safe to call multiple times — stopOnce
// guards the channel close, and a second caller simply re-reads the
// already-closed gcStopped channel (reads from a closed channel return
// the zero value immediately). Blocks until the GC loop observes stopCh
// and exits, so callers can rely on "no more GC ticks" after this
// returns. Only valid on instances built via newReBACRateLimiter.
func (r *reBACRateLimiter) Close() {
	r.stopOnce.Do(func() {
		close(r.stopCh)
	})
	<-r.gcStopped
}

func (r *reBACRateLimiter) gcLoop() {
	defer close(r.gcStopped)
	ticker := time.NewTicker(r.gcInterval)
	defer ticker.Stop()
	for {
		select {
		case <-r.stopCh:
			return
		case <-ticker.C:
			r.gcOnce()
		}
	}
}

// gcOnce evicts every bucket older than idleTimeout. Exported-for-tests
// via its lowercase name from the same package; the unit test uses it
// directly instead of waiting for a real tick.
func (r *reBACRateLimiter) gcOnce() {
	cutoff := time.Now().Add(-r.idleTimeout)
	r.mu.Lock()
	defer r.mu.Unlock()
	for k, b := range r.buckets {
		if b.lastUse.Before(cutoff) {
			delete(r.buckets, k)
		}
	}
}

// evictOldestLocked drops the single oldest bucket. Must be called with
// r.mu held. Linear scan of the map is fine at 10k entries — a heap
// would cost more (allocations on every Allow) than we save.
func (r *reBACRateLimiter) evictOldestLocked() {
	var oldestKey string
	var oldestAt time.Time
	for k, b := range r.buckets {
		if oldestKey == "" || b.lastUse.Before(oldestAt) {
			oldestKey = k
			oldestAt = b.lastUse
		}
	}
	if oldestKey != "" {
		delete(r.buckets, oldestKey)
	}
}

// bizListRateLimiter is the process-wide limiter instance gated by the
// biz-list-* HTTP handlers. Initialised by InitBizReBACRateLimiter at
// boot; tests may also assign a custom limiter directly. Nil means "no
// limiting" — the handler falls through.
var bizListRateLimiter *reBACRateLimiter

// InitBizReBACRateLimiter constructs the process-wide limiter using
// configured (or default) rps + burst values. Called from main.go.
// Replaces any prior instance (Close is called so the GC goroutine
// exits) to make repeated init calls from tests safe.
func InitBizReBACRateLimiter(rps float64, burst int) {
	if rps <= 0 {
		rps = 20
	}
	if burst <= 0 {
		burst = 40
	}
	if bizListRateLimiter != nil {
		bizListRateLimiter.Close()
	}
	bizListRateLimiter = newReBACRateLimiter(rate.Limit(rps), burst)
}

// AllowBizReBACListObjects returns false if the caller is rate-limited.
// A nil limiter (i.e. InitBizReBACRateLimiter never ran, e.g. in a
// stripped-down test) admits everything.
func AllowBizReBACListObjects(storeId, user string) bool {
	if bizListRateLimiter == nil {
		return true
	}
	return bizListRateLimiter.Allow(storeId, user)
}
