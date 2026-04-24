// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"os"
	"testing"
)

// TestInitBizReBACCache_DefaultIsL2Only verifies that InitBizReBACCache is a
// no-op when bizReBACCacheL3Enabled=false (the default). The process-wide
// cache must remain non-tiered so behavior matches pre-CP-8.
func TestInitBizReBACCache_DefaultIsL2Only(t *testing.T) {
	origCache := *bizReBACCache.Load()
	defer SetBizReBACCache(origCache)

	// Reset to a known baseline mirroring init(): an instrumented L2 wrapper.
	fresh := NewInstrumentedBizReBACCache(NewInMemoryBizReBACCache(), "l2")
	SetBizReBACCache(fresh)

	// No env flag set → InitBizReBACCache should not touch the cache.
	_ = os.Unsetenv("bizReBACCacheL3Enabled")
	InitBizReBACCache()

	got := *bizReBACCache.Load()
	if got != fresh {
		t.Fatalf("L3 disabled by default: expected cache untouched, got different instance")
	}
	if _, tiered := got.(*TieredCache); tiered {
		t.Fatalf("expected non-tiered cache when L3 disabled, got *TieredCache")
	}
}

// TestInitBizReBACCache_EnabledWithoutAddrStaysL2 verifies that flipping the
// flag on without a Redis address does not tear down the default L2 — we
// log a warning and keep the process healthy rather than crash at boot.
func TestInitBizReBACCache_EnabledWithoutAddrStaysL2(t *testing.T) {
	origCache := *bizReBACCache.Load()
	defer SetBizReBACCache(origCache)

	fresh := NewInstrumentedBizReBACCache(NewInMemoryBizReBACCache(), "l2")
	SetBizReBACCache(fresh)

	t.Setenv("bizReBACCacheL3Enabled", "true")
	t.Setenv("redisEndpoint", "")
	t.Setenv("bizReBACCacheL3Addr", "")

	InitBizReBACCache()

	if got := *bizReBACCache.Load(); got != fresh {
		t.Fatalf("empty addr: L2 should be untouched, got different instance")
	}
}
