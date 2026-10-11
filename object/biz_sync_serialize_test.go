// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestBizSyncCoalescerSerializesAndCoalesces(t *testing.T) {
	c := &bizSyncCoalescerT{apps: map[string]*bizSyncApp{}}
	var active, maxActive, runs int32
	started := make(chan struct{}, 16)
	release := make(chan struct{})
	var hints []*bizChangeHint
	var hintsMu sync.Mutex

	run := func(h *bizChangeHint) (*SyncStats, error) {
		n := atomic.AddInt32(&active, 1)
		for {
			m := atomic.LoadInt32(&maxActive)
			if n <= m || atomic.CompareAndSwapInt32(&maxActive, m, n) {
				break
			}
		}
		atomic.AddInt32(&runs, 1)
		hintsMu.Lock()
		hints = append(hints, h)
		hintsMu.Unlock()
		started <- struct{}{}
		<-release
		atomic.AddInt32(&active, -1)
		return &SyncStats{}, nil
	}

	var wg sync.WaitGroup
	call := func(h *bizChangeHint) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := c.do("o/a", h, run); err != nil {
				t.Error(err)
			}
		}()
	}

	call(&bizChangeHint{})
	<-started // first run is in flight
	for i := 0; i < 9; i++ {
		call(&bizChangeHint{})
	}
	// Wait until all 9 are queued behind the running one.
	deadline := time.Now().Add(2 * time.Second)
	for {
		c.mu.Lock()
		queued := 0
		if st := c.apps["o/a"]; st != nil && st.next != nil {
			queued = st.next.callers
		}
		c.mu.Unlock()
		if queued == 9 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("callers did not queue, got %d", queued)
		}
		time.Sleep(time.Millisecond)
	}
	close(release)
	wg.Wait()

	if maxActive != 1 {
		t.Fatalf("runs overlapped: max concurrent = %d", maxActive)
	}
	if runs != 2 {
		t.Fatalf("expected 1 running + 1 coalesced follow-up = 2 runs, got %d", runs)
	}
	if hints[0] == nil || hints[1] != nil {
		t.Fatalf("merged follow-up must drop its hint (full_rebuild), got %v", hints)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.apps) != 0 {
		t.Fatalf("coalescer leaked state: %d apps", len(c.apps))
	}
}

func TestBizSyncCoalescerKeepsSingleQueuedHintAndIndependentKeys(t *testing.T) {
	c := &bizSyncCoalescerT{apps: map[string]*bizSyncApp{}}
	release := make(chan struct{})
	started := make(chan string, 4)
	var mu sync.Mutex
	var seen []*bizChangeHint
	run := func(h *bizChangeHint) (*SyncStats, error) {
		mu.Lock()
		seen = append(seen, h)
		mu.Unlock()
		started <- "x"
		<-release
		return &SyncStats{}, nil
	}
	var wg sync.WaitGroup
	h2 := &bizChangeHint{}
	wg.Add(2)
	go func() { defer wg.Done(); _, _ = c.do("o/a", &bizChangeHint{}, run) }()
	<-started
	go func() { defer wg.Done(); _, _ = c.do("o/a", h2, run) }()
	// A different app must not be blocked by o/a.
	done := make(chan struct{})
	go func() {
		_, _ = c.do("o/b", nil, func(*bizChangeHint) (*SyncStats, error) { return &SyncStats{}, nil })
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("independent app blocked")
	}
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()
	mu.Lock()
	defer mu.Unlock()
	if len(seen) != 2 || seen[1] != h2 {
		t.Fatalf("a lone queued caller must keep its hint, seen=%v", seen)
	}
}
