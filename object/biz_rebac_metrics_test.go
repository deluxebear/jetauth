// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// TestReBACMetrics_FamiliesExposed asserts that all five metric families
// from spec §SC-4 are registered with the default gatherer after a few
// sample observations. Without the observations some counters are at 0
// and may still be returned by Gather — we observe first to be safe
// across both client_golang versions.
func TestReBACMetrics_FamiliesExposed(t *testing.T) {
	observeReBACCheck("allowed", time.Millisecond)
	observeReBACListObjects("objects", "allowed", time.Millisecond)
	recordReBACCacheHit("l2")
	recordReBACCacheMiss("l3")
	recordReBACRateLimitRejected("list_objects")
	recordReBACEngineError(errors.New("rebac check: not in schema"))

	metrics, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	want := map[string]bool{
		"biz_rebac_check_duration_seconds":        false,
		"biz_rebac_list_objects_duration_seconds": false,
		"biz_rebac_cache_hits_total":              false,
		"biz_rebac_cache_misses_total":            false,
		"biz_rebac_ratelimit_rejected_total":      false,
		"biz_rebac_engine_errors_total":           false,
	}
	for _, mf := range metrics {
		if _, ok := want[mf.GetName()]; ok {
			want[mf.GetName()] = true
		}
	}
	for name, seen := range want {
		if !seen {
			t.Errorf("metric family %s not exposed", name)
		}
	}
}

// TestClassifyReBACError spot-checks the substring bucketing so a
// typo-rename in the classifier's keywords surfaces loudly.
func TestClassifyReBACError(t *testing.T) {
	tests := map[string]string{
		"rebac check: object type \"doc\" not in schema":   "schema",
		"rebac resolve authorization model: missing id":    "resolve_model",
		"rebac: reading tupleset from db: connection lost": "tuple_read",
		"unexpected internal explosion":                    "unknown",
	}
	for in, want := range tests {
		if got := classifyReBACError(errors.New(in)); got != want {
			t.Errorf("classify(%q) = %q, want %q", in, got, want)
		}
	}
	if got := classifyReBACError(nil); got != "" {
		t.Errorf("classify(nil) = %q, want empty", got)
	}
}

// TestInstrumentedCacheForwardsBehavior verifies the metrics wrapper
// is otherwise transparent: Get/Set/Invalidate/FlushStore/flushAll are
// all behaviorally identical to the inner cache.
func TestInstrumentedCacheForwardsBehavior(t *testing.T) {
	inner := NewInMemoryBizReBACCache()
	c := NewInstrumentedBizReBACCache(inner, "l2")

	ctx := context.Background()
	k := cacheKey{StoreId: "s", Object: "o", Relation: "r"}
	refs := []tupleRef{{}}
	c.Set(ctx, k, refs, 5*time.Second)

	if _, ok := c.Get(ctx, k); !ok {
		t.Fatal("Get after Set should hit")
	}
	c.Invalidate(ctx, k)
	if _, ok := c.Get(ctx, k); ok {
		t.Error("Get after Invalidate should miss")
	}

	// Re-fill and exercise FlushStore.
	c.Set(ctx, k, refs, 5*time.Second)
	c.FlushStore(ctx, "s")
	if _, ok := c.Get(ctx, k); ok {
		t.Error("Get after FlushStore should miss")
	}

	// flushAll is package-private — exercised via the flushAller interface.
	c.Set(ctx, k, refs, 5*time.Second)
	if f, ok := any(c).(flushAller); ok {
		f.flushAll()
	} else {
		t.Fatal("InstrumentedBizReBACCache should satisfy flushAller")
	}
	if _, ok := c.Get(ctx, k); ok {
		t.Error("Get after flushAll should miss")
	}

	if err := c.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
	if c.Unwrap() != inner {
		t.Error("Unwrap should return the original inner cache")
	}
}
