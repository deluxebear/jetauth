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
	"sync"
	"time"
)

// BizReBACCache is the abstract contract for ReBAC tupleset caches.
// L2 (in-memory) and L3 (Redis, added in CP-8 C6) both satisfy it.
// Callers interact only through this interface; tier-specific
// behavior (TTL, pub/sub invalidation) lives in each impl.
//
// Note: uses unexported cacheKey and tupleRef types; all impls must
// live in package object. Cross-package adapters are out of scope —
// extend the existing package rather than introducing a new one.
type BizReBACCache interface {
	Get(ctx context.Context, key cacheKey) ([]tupleRef, bool)
	Set(ctx context.Context, key cacheKey, refs []tupleRef, ttl time.Duration)
	Invalidate(ctx context.Context, key cacheKey)
	FlushStore(ctx context.Context, storeId string)
	Close() error
}

// cacheKey uniquely identifies a tupleset (a given object#relation tuple in a given store).
// Matches the shape the existing L2 cache already uses.
type cacheKey struct {
	StoreId  string
	Object   string
	Relation string
}

// InMemoryBizReBACCache is the L2 impl — per-process sync.Map with per-entry expiry.
// Behaviorally equivalent to the pre-refactor logic in biz_rebac_cache.go; it will
// replace that logic in task B1.2.
type InMemoryBizReBACCache struct {
	m sync.Map // cacheKey → *cacheEntry
}

type cacheEntry struct {
	refs    []tupleRef
	expires time.Time
}

func NewInMemoryBizReBACCache() *InMemoryBizReBACCache {
	return &InMemoryBizReBACCache{}
}

func (c *InMemoryBizReBACCache) Get(_ context.Context, key cacheKey) ([]tupleRef, bool) {
	v, ok := c.m.Load(key)
	if !ok {
		return nil, false
	}
	e, ok := v.(*cacheEntry)
	if !ok {
		c.m.Delete(key)
		return nil, false
	}
	if time.Now().After(e.expires) {
		c.m.Delete(key)
		return nil, false
	}
	return e.refs, true
}

func (c *InMemoryBizReBACCache) Set(_ context.Context, key cacheKey, refs []tupleRef, ttl time.Duration) {
	c.m.Store(key, &cacheEntry{refs: refs, expires: time.Now().Add(ttl)})
}

func (c *InMemoryBizReBACCache) Invalidate(_ context.Context, key cacheKey) {
	c.m.Delete(key)
}

func (c *InMemoryBizReBACCache) FlushStore(_ context.Context, storeId string) {
	c.m.Range(func(k, _ any) bool {
		if k.(cacheKey).StoreId == storeId {
			c.m.Delete(k)
		}
		return true
	})
}

func (c *InMemoryBizReBACCache) Close() error { return nil }

// flushAll drops every entry — used by the TieredCache pessimistic
// recovery path on pub/sub disconnect. Not part of the BizReBACCache
// interface because "flush everything" is a tier-composition concern,
// not a per-tier operation.
func (c *InMemoryBizReBACCache) flushAll() {
	c.m.Range(func(k, _ any) bool {
		c.m.Delete(k)
		return true
	})
}
