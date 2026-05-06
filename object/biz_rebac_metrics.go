// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_metrics.go owns the ReBAC-specific Prometheus metric
// families (spec §SC-4). All names are prefixed biz_rebac_ so they
// coexist cleanly with the casdoor_api_* families already exposed by
// object/prometheus.go.
//
// Observability contract:
//   - biz_rebac_check_duration_seconds{outcome}                — Check latency.
//   - biz_rebac_list_objects_duration_seconds{outcome,op}      — ListObjects/ListUsers latency.
//   - biz_rebac_cache_hits_total{level}  / _misses_total       — tupleset cache tier outcomes.
//   - biz_rebac_ratelimit_rejected_total{endpoint}             — 429s per endpoint.
//   - biz_rebac_engine_errors_total{kind}                      — engine error taxonomy.
//
// promauto registers against prometheus.DefaultRegisterer at package
// init, matching the style already used by object/prometheus.go — no
// explicit "RegisterReBACMetrics" call is required from main.go.

package object

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	rebacCheckDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "biz_rebac_check_duration_seconds",
		Help:    "Duration of ReBACCheck calls in seconds. Outcome is allowed|denied|error.",
		Buckets: prometheus.DefBuckets,
	}, []string{"outcome"})

	rebacListObjectsDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "biz_rebac_list_objects_duration_seconds",
		Help:    "Duration of ReBACListObjects / ReBACListUsers calls in seconds. Op is objects|users.",
		Buckets: prometheus.DefBuckets,
	}, []string{"outcome", "op"})

	rebacCacheHits = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "biz_rebac_cache_hits_total",
		Help: "ReBAC tupleset cache hits, labeled by tier (l2 in-memory, l3 Redis).",
	}, []string{"level"})

	rebacCacheMisses = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "biz_rebac_cache_misses_total",
		Help: "ReBAC tupleset cache misses, labeled by tier (l2 in-memory, l3 Redis).",
	}, []string{"level"})

	rebacRateLimitRejected = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "biz_rebac_ratelimit_rejected_total",
		Help: "ReBAC requests rejected by the per-(store,user) rate limiter, labeled by endpoint.",
	}, []string{"endpoint"})

	rebacEngineErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "biz_rebac_engine_errors_total",
		Help: "ReBAC engine errors, labeled by kind (schema|resolve_model|tuple_read|unknown).",
	}, []string{"kind"})
)

// observeReBACCheck records a Check-duration sample under the outcome label.
func observeReBACCheck(outcome string, d time.Duration) {
	rebacCheckDuration.WithLabelValues(outcome).Observe(d.Seconds())
}

// observeReBACListObjects records a List-duration sample under (outcome, op).
// Both ListObjects and ListUsers share the metric family — distinguished by
// the op label — because their SLA bucketing (p99<300ms) is identical.
func observeReBACListObjects(op, outcome string, d time.Duration) {
	rebacListObjectsDuration.WithLabelValues(outcome, op).Observe(d.Seconds())
}

func recordReBACCacheHit(level string)  { rebacCacheHits.WithLabelValues(level).Inc() }
func recordReBACCacheMiss(level string) { rebacCacheMisses.WithLabelValues(level).Inc() }

// recordReBACRateLimitRejected bumps the rejection counter for an endpoint.
// Endpoint label is free-form ("list_objects"|"list_users"|…); the set of
// values grows as new endpoints gate on the limiter.
func recordReBACRateLimitRejected(endpoint string) {
	rebacRateLimitRejected.WithLabelValues(endpoint).Inc()
}

// RecordBizReBACRateLimitRejected is the exported wrapper for the
// biz_rebac_ratelimit_rejected_total counter. The controller package
// calls this from the 429 return path so the rejection metric flips
// before the response is written (guarantees SC-4 dashboards show the
// bump even if the client disconnects).
func RecordBizReBACRateLimitRejected(endpoint string) { recordReBACRateLimitRejected(endpoint) }

// recordReBACEngineError classifies an engine error and bumps the counter.
// classifyReBACError is intentionally cheap — callers pass the raw error
// and we bucket by substring for now, tightening as real error types emerge.
func recordReBACEngineError(err error) {
	rebacEngineErrors.WithLabelValues(classifyReBACError(err)).Inc()
}

// classifyReBACError reduces an arbitrary error to one of a small set of
// metric labels. Kept open-ended ("unknown" fallback) so new error paths
// don't silently drop off the dashboard — they show up as "unknown" and
// someone can promote them to a dedicated label when the pattern repeats.
//
// Ordering matters: "schema" is checked before "resolve_model" and
// "tuple_read" because schema errors often mention models/tuples too,
// and we'd rather see them under the more specific label.
func classifyReBACError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	switch {
	case containsAnyOf(msg, "not in schema", "not defined", "validateCheckRequestTuple", "schema"):
		return "schema"
	case containsAnyOf(msg, "resolve authorization model", "resolveAuthorizationModel"):
		return "resolve_model"
	case containsAnyOf(msg, "tuple", "tupleset", "db"):
		return "tuple_read"
	default:
		return "unknown"
	}
}

// containsAnyOf returns true if s contains any of the provided substrings.
// Thin wrapper over strings.Contains to keep the switch above readable.
func containsAnyOf(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

// InstrumentedBizReBACCache decorates a BizReBACCache with hit/miss
// counters. Used for the default L2-only install path so metrics still
// flow when bizReBACCacheL3Enabled=false. TieredCache emits its own
// per-tier metrics inline — do NOT double-wrap its sub-tiers.
type InstrumentedBizReBACCache struct {
	inner BizReBACCache
	level string
}

// NewInstrumentedBizReBACCache wraps inner, tagging hit/miss counters
// with the given tier label ("l2" or "l3").
func NewInstrumentedBizReBACCache(inner BizReBACCache, level string) *InstrumentedBizReBACCache {
	return &InstrumentedBizReBACCache{inner: inner, level: level}
}

// Unwrap returns the underlying cache, bypassing the metrics layer.
// Tests use this to poke at concrete impls without peeking at the label.
func (c *InstrumentedBizReBACCache) Unwrap() BizReBACCache { return c.inner }

func (c *InstrumentedBizReBACCache) Get(ctx context.Context, k cacheKey) ([]tupleRef, bool) {
	refs, ok := c.inner.Get(ctx, k)
	if ok {
		recordReBACCacheHit(c.level)
	} else {
		recordReBACCacheMiss(c.level)
	}
	return refs, ok
}

func (c *InstrumentedBizReBACCache) Set(ctx context.Context, k cacheKey, refs []tupleRef, ttl time.Duration) {
	c.inner.Set(ctx, k, refs, ttl)
}

func (c *InstrumentedBizReBACCache) Invalidate(ctx context.Context, k cacheKey) {
	c.inner.Invalidate(ctx, k)
}

func (c *InstrumentedBizReBACCache) FlushStore(ctx context.Context, storeId string) {
	c.inner.FlushStore(ctx, storeId)
}

func (c *InstrumentedBizReBACCache) Close() error { return c.inner.Close() }

// flushAll forwards to the wrapped cache's flushAll when available. This
// lets TieredCache.buildFlushL2 treat an instrumented L2 wrapper as if
// it were the raw in-memory impl for the pessimistic "*" recovery path.
func (c *InstrumentedBizReBACCache) flushAll() {
	if f, ok := c.inner.(flushAller); ok {
		f.flushAll()
	}
}

// flushAller is the narrow interface used by TieredCache's star-flush
// path. InMemoryBizReBACCache and InstrumentedBizReBACCache both
// implement it. Kept package-private because "flush everything" is a
// tier-composition concern, not part of the public cache contract.
type flushAller interface {
	flushAll()
}

// checkQpsRing maintains a 60-bucket-per-store circular counter of
// /api/biz-check invocations, sampled at 1-minute granularity. Reading
// last-hour totals backs the admin Overview "CHECK QPS" tile — Prometheus
// is the source of truth for billing/SLA, this ring is a cheap admin-UI
// affordance with no persistence (resets on process restart).
//
// Each store gets its own [60]int64. The slot index is (now/minute) % 60,
// and a per-store "last seen minute" lets us evict stale slots on first
// touch in a new minute (otherwise wrap-around would re-read a 60-min-old
// count as if it were current).
type checkQpsRing struct {
	mu     sync.Mutex
	now    func() time.Time
	stores map[string]*qpsRingState
}

type qpsRingState struct {
	buckets    [60]int64
	lastMinute int64 // unix minute of the most recent Inc; -1 sentinel means "never"
}

func newCheckQpsRing(now func() time.Time) *checkQpsRing {
	return &checkQpsRing{now: now, stores: map[string]*qpsRingState{}}
}

// Inc records one Check invocation for storeId in the current minute's
// bucket, lazily evicting any buckets that have aged out since the last
// Inc on this store.
func (r *checkQpsRing) Inc(storeId string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.stores[storeId]
	if !ok {
		state = &qpsRingState{lastMinute: -1}
		r.stores[storeId] = state
	}
	curMin := r.now().Unix() / 60
	r.evictStaleLocked(state, curMin)
	state.buckets[curMin%60]++
	state.lastMinute = curMin
}

// LastHour returns the sum of all 60 buckets for storeId, after evicting
// stale slots. Returns 0 for an unknown store. Caller divides by 3600 to
// get average QPS over the trailing hour.
func (r *checkQpsRing) LastHour(storeId string) int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.stores[storeId]
	if !ok {
		return 0
	}
	curMin := r.now().Unix() / 60
	r.evictStaleLocked(state, curMin)
	var sum int64
	for _, v := range state.buckets {
		sum += v
	}
	return sum
}

// evictStaleLocked zeroes any buckets whose timestamp is older than the
// 60-minute window. Called under r.mu. Cheap when no time has passed
// (early return); O(60) when the gap is ≥60 minutes (zero everything).
func (r *checkQpsRing) evictStaleLocked(state *qpsRingState, curMin int64) {
	if state.lastMinute < 0 {
		return
	}
	gap := curMin - state.lastMinute
	if gap <= 0 {
		return
	}
	if gap > 60 {
		state.buckets = [60]int64{}
		return
	}
	// Zero the (gap-1) slots between lastMinute+1 and curMin-1 inclusive.
	// These are "skipped" minutes that now hold stale data from a previous
	// cycle. We deliberately stop before curMin because curMin%60 may
	// alias lastMinute%60 (when gap==60) — in that case lastMinute's data
	// is still within the 60-minute window and must not be evicted.
	for i := int64(1); i < gap; i++ {
		state.buckets[(state.lastMinute+i)%60] = 0
	}
}

// checkQpsCounter is the package-level singleton wired into ReBACCheck.
// time.Now is fine because this is a side-effect counter, not a tested
// pure function — tests construct their own ring with an injectable clock.
var checkQpsCounter = newCheckQpsRing(time.Now)

// RecordBizReBACCheckQps is the exported wrapper kept symmetrical with
// RecordBizReBACRateLimitRejected: callers in the same package use the
// unexported instance directly; an exported wrapper exists for code that
// might compose this from elsewhere.
func RecordBizReBACCheckQps(storeId string) { checkQpsCounter.Inc(storeId) }

// GetBizReBACCheckLastHour returns the trailing-hour Check count for the
// given store. Used by the admin /biz-rebac-stats endpoint.
func GetBizReBACCheckLastHour(storeId string) int64 { return checkQpsCounter.LastHour(storeId) }
