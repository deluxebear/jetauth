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
)

func TestCheckQpsRing_BasicAccumulation(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	r := newCheckQpsRing(func() time.Time { return now })
	for i := 0; i < 42; i++ {
		r.Inc("admin/drive_prod")
	}
	if got := r.LastHour("admin/drive_prod"); got != 42 {
		t.Fatalf("LastHour = %d, want 42", got)
	}
}

func TestCheckQpsRing_RolloverDropsOldBucket(t *testing.T) {
	clock := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	r := newCheckQpsRing(func() time.Time { return clock })

	// Minute 0: 5 increments.
	for i := 0; i < 5; i++ {
		r.Inc("s")
	}

	// Advance 1 minute, 7 increments.
	clock = clock.Add(time.Minute)
	for i := 0; i < 7; i++ {
		r.Inc("s")
	}

	if got := r.LastHour("s"); got != 12 {
		t.Fatalf("after 2 minutes LastHour = %d, want 12", got)
	}

	// Advance 60 minutes — the original 5 from minute 0 should be evicted
	// because we land back on the same ring slot. Increment once so the
	// new bucket is no longer the stale value.
	clock = clock.Add(60 * time.Minute)
	r.Inc("s")

	got := r.LastHour("s")
	// 7 from minute 1 (still in ring at slot 1) + 1 just added (slot 0). The
	// 5 from the original minute 0 must be gone.
	if got != 8 {
		t.Fatalf("after 1h rollover LastHour = %d, want 8 (5 old must be evicted)", got)
	}
}

func TestCheckQpsRing_PerStoreIsolation(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	r := newCheckQpsRing(func() time.Time { return now })
	r.Inc("admin/app_a")
	r.Inc("admin/app_a")
	r.Inc("admin/app_b")
	if got := r.LastHour("admin/app_a"); got != 2 {
		t.Fatalf("app_a LastHour = %d, want 2", got)
	}
	if got := r.LastHour("admin/app_b"); got != 1 {
		t.Fatalf("app_b LastHour = %d, want 1", got)
	}
	if got := r.LastHour("admin/app_unknown"); got != 0 {
		t.Fatalf("unknown LastHour = %d, want 0", got)
	}
}

func TestCheckQpsRing_ConcurrentInc(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	r := newCheckQpsRing(func() time.Time { return now })
	const goroutines = 8
	const perG = 250
	done := make(chan struct{})
	for g := 0; g < goroutines; g++ {
		go func() {
			for i := 0; i < perG; i++ {
				r.Inc("s")
			}
			done <- struct{}{}
		}()
	}
	for g := 0; g < goroutines; g++ {
		<-done
	}
	if got := r.LastHour("s"); got != goroutines*perG {
		t.Fatalf("concurrent: got %d, want %d", got, goroutines*perG)
	}
}
