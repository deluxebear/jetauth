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
// cache must still be the in-memory L2 installed by init().
func TestInitBizReBACCache_DefaultIsL2Only(t *testing.T) {
	origCache := *bizReBACCache.Load()
	defer SetBizReBACCache(origCache)

	// Reset to known L2 baseline so the test is hermetic.
	fresh := NewInMemoryBizReBACCache()
	SetBizReBACCache(fresh)

	// No env flag set → InitBizReBACCache should not touch the cache.
	_ = os.Unsetenv("bizReBACCacheL3Enabled")
	InitBizReBACCache()

	if got := *bizReBACCache.Load(); got != fresh {
		t.Fatalf("L3 disabled by default: expected L2 untouched, got different instance")
	}
	if _, ok := (*bizReBACCache.Load()).(*InMemoryBizReBACCache); !ok {
		t.Fatalf("expected *InMemoryBizReBACCache after default init, got %T", *bizReBACCache.Load())
	}
}

// TestInitBizReBACCache_EnabledWithoutAddrStaysL2 verifies that flipping the
// flag on without a Redis address does not tear down the default L2 — we
// log a warning and keep the process healthy rather than crash at boot.
func TestInitBizReBACCache_EnabledWithoutAddrStaysL2(t *testing.T) {
	origCache := *bizReBACCache.Load()
	defer SetBizReBACCache(origCache)

	fresh := NewInMemoryBizReBACCache()
	SetBizReBACCache(fresh)

	t.Setenv("bizReBACCacheL3Enabled", "true")
	t.Setenv("redisEndpoint", "")
	t.Setenv("bizReBACCacheL3Addr", "")

	InitBizReBACCache()

	if got := *bizReBACCache.Load(); got != fresh {
		t.Fatalf("empty addr: L2 should be untouched, got different instance")
	}
}
