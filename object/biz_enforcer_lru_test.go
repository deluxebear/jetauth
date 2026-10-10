// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestBizEnforcerLRUUnboundedByDefault(t *testing.T) {
	c := newBizEnforcerLRU(0, 0)
	for i := 0; i < 500; i++ {
		c.Store(fmt.Sprintf("o/a%d", i), i)
	}
	if c.Len() != 500 {
		t.Fatalf("unbounded cache must keep everything, got %d", c.Len())
	}
	if v, ok := c.Load("o/a7"); !ok || v.(int) != 7 {
		t.Fatalf("load: %v %v", v, ok)
	}
}

func TestBizEnforcerLRUEvictsLeastRecentlyUsed(t *testing.T) {
	c := newBizEnforcerLRU(2, 0)
	before := testutil.ToFloat64(bizEnforcerCacheEvictions.WithLabelValues("lru"))
	c.Store("a", 1)
	c.Store("b", 2)
	c.Load("a") // a becomes most recent
	c.Store("c", 3)
	if _, ok := c.Load("b"); ok {
		t.Fatal("b should have been evicted")
	}
	if _, ok := c.Load("a"); !ok {
		t.Fatal("a should survive")
	}
	if _, ok := c.Load("c"); !ok {
		t.Fatal("c should survive")
	}
	if got := testutil.ToFloat64(bizEnforcerCacheEvictions.WithLabelValues("lru")) - before; got != 1 {
		t.Fatalf("lru evictions = %v, want 1", got)
	}
}

func TestBizEnforcerLRUIdleTTL(t *testing.T) {
	c := newBizEnforcerLRU(0, time.Minute)
	now := time.Unix(1000, 0)
	c.now = func() time.Time { return now }
	c.Store("a", 1)
	c.Store("b", 2)

	now = now.Add(40 * time.Second)
	if _, ok := c.Load("a"); !ok { // touch a: resets its idle clock
		t.Fatal("a should be live")
	}
	now = now.Add(40 * time.Second) // b idle 80s, a idle 40s
	if n := c.sweepExpired(); n != 1 {
		t.Fatalf("sweep removed %d, want 1", n)
	}
	if _, ok := c.Load("b"); ok {
		t.Fatal("b should be expired")
	}
	now = now.Add(2 * time.Minute)
	if _, ok := c.Load("a"); ok { // lazy expiry on Load
		t.Fatal("a should expire lazily")
	}
	if c.Len() != 0 {
		t.Fatalf("len = %d", c.Len())
	}
}

func TestBizEnforcerLRUDeleteBlocksStaleFill(t *testing.T) {
	c := newBizEnforcerLRU(10, 0)
	gen := c.Generation()
	c.Delete("a") // invalidation (watcher / ClearBizEnforcerCache) during a build
	if c.StoreIfGen("a", 1, gen) {
		t.Fatal("stale fill must not be stored after invalidation")
	}
	if !c.StoreIfGen("a", 1, c.Generation()) {
		t.Fatal("fresh fill should store")
	}
	c.Delete("a")
	if _, ok := c.Load("a"); ok {
		t.Fatal("delete should remove")
	}
}

func TestBizEnforcerLRUMetrics(t *testing.T) {
	c := newBizEnforcerLRU(0, 0)
	h0 := testutil.ToFloat64(bizEnforcerCacheHits)
	m0 := testutil.ToFloat64(bizEnforcerCacheMisses)
	c.Load("x")
	c.Store("x", 1)
	c.Load("x")
	if testutil.ToFloat64(bizEnforcerCacheHits)-h0 != 1 || testutil.ToFloat64(bizEnforcerCacheMisses)-m0 != 1 {
		t.Fatal("hit/miss counters not updated")
	}
}

func TestBizEnforcerLRUConcurrent(t *testing.T) {
	for _, c := range []*bizEnforcerLRU{newBizEnforcerLRU(0, 0), newBizEnforcerLRU(8, time.Minute)} {
		var wg sync.WaitGroup
		for g := 0; g < 8; g++ {
			wg.Add(1)
			go func(g int) {
				defer wg.Done()
				for i := 0; i < 500; i++ {
					k := fmt.Sprintf("k%d", (g*7+i)%20)
					switch i % 4 {
					case 0:
						c.Store(k, i)
					case 1:
						c.Load(k)
					case 2:
						c.StoreIfGen(k, i, c.Generation())
					default:
						c.Delete(k)
						c.sweepExpired()
					}
				}
			}(g)
		}
		wg.Wait()
		if c.maxSize > 0 && c.Len() > c.maxSize {
			t.Fatalf("len %d exceeds cap %d", c.Len(), c.maxSize)
		}
	}
}
