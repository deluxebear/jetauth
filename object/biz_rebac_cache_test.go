// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for the L2 tupleset cache. No DB required —
// direct Load/Store/Delete against the package-level sync.Map.

package object

import (
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
	key := bizTuplesetCacheKey("s-ttl", "doc:d1", "viewer")
	// Store a manually-constructed entry that's already expired.
	bizTuplesetCache.Store(key, &tuplesetCacheEntry{
		value:   []tupleRef{{User: "u:a"}},
		expires: time.Now().Add(-1 * time.Second),
	})
	if _, ok := loadBizTuplesetCache("s-ttl", "doc:d1", "viewer"); ok {
		t.Fatal("expired entry should miss")
	}
	// Expired miss should also evict — verify no lingering entry.
	if _, raw := bizTuplesetCache.Load(key); raw {
		t.Fatal("expired entry should have been evicted on miss")
	}
}
