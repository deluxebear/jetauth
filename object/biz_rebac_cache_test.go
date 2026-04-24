// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for the L2 tupleset cache. No DB required —
// exercises the package-level helper functions that delegate to the
// BizReBACCache interface.

package object

import (
	"context"
	"testing"
	"time"
)

func TestBizTuplesetCache_LoadHit(t *testing.T) {
	refs := []tupleRef{{User: "user:alice"}}
	storeBizTuplesetCache("s1", "document:d1", "viewer", refs)
	got, ok := loadBizTuplesetCache("s1", "document:d1", "viewer")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if len(got) != 1 || got[0].User != "user:alice" {
		t.Fatalf("got %+v, want [user:alice]", got)
	}
}

func TestBizTuplesetCache_LoadMiss(t *testing.T) {
	_, ok := loadBizTuplesetCache("s1", "never:stored", "nope")
	if ok {
		t.Fatal("unexpected hit on empty cache slot")
	}
}

func TestBizTuplesetCache_Invalidate(t *testing.T) {
	storeBizTuplesetCache("s-inv", "doc:d1", "viewer", []tupleRef{{User: "user:a"}})
	if _, ok := loadBizTuplesetCache("s-inv", "doc:d1", "viewer"); !ok {
		t.Fatal("precondition: cache miss")
	}
	invalidateBizTuplesetCacheKey("s-inv", "doc:d1", "viewer")
	if _, ok := loadBizTuplesetCache("s-inv", "doc:d1", "viewer"); ok {
		t.Fatal("expected miss after invalidate")
	}
}

func TestBizTuplesetCache_FlushStore(t *testing.T) {
	storeBizTuplesetCache("s-flush", "doc:d1", "viewer", []tupleRef{{User: "u:a"}})
	storeBizTuplesetCache("s-flush", "doc:d2", "editor", []tupleRef{{User: "u:b"}})
	// Sibling store should survive the flush.
	storeBizTuplesetCache("s-other", "doc:d1", "viewer", []tupleRef{{User: "u:c"}})

	flushBizTuplesetCacheForStore("s-flush")

	if _, ok := loadBizTuplesetCache("s-flush", "doc:d1", "viewer"); ok {
		t.Fatal("s-flush d1 viewer should be gone")
	}
	if _, ok := loadBizTuplesetCache("s-flush", "doc:d2", "editor"); ok {
		t.Fatal("s-flush d2 editor should be gone")
	}
	if _, ok := loadBizTuplesetCache("s-other", "doc:d1", "viewer"); !ok {
		t.Fatal("s-other should survive the flush")
	}
	// Clean up for sibling tests.
	invalidateBizTuplesetCacheKey("s-other", "doc:d1", "viewer")
}

func TestBizTuplesetCache_TTLExpires(t *testing.T) {
	t.Cleanup(func() { SetBizReBACCache(NewInMemoryBizReBACCache()) })

	// Inject an already-expired entry by passing a negative TTL so the
	// impl sets expires = now - 1s. Previously this poked the sync.Map
	// directly; using the interface keeps the test impl-agnostic.
	key := cacheKey{StoreId: "s-ttl", Object: "doc:d1", Relation: "viewer"}
	(*bizReBACCache.Load()).Set(context.Background(), key, []tupleRef{{User: "u:a"}}, -1*time.Second)

	if _, ok := loadBizTuplesetCache("s-ttl", "doc:d1", "viewer"); ok {
		t.Fatal("expired entry should miss")
	}
	// A second Get on the same key confirms the entry was evicted (not lingering).
	if _, ok := (*bizReBACCache.Load()).Get(context.Background(), key); ok {
		t.Fatal("expired entry should have been evicted on miss")
	}
}
