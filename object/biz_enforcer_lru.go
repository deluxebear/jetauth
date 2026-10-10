// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// biz_enforcer_lru.go is the local store behind GetBizEnforcer. It replaces a
// bare sync.Map with an optional LRU size cap and an optional idle TTL.
//
// Both limits default to off (0), in which case the store behaves like the
// former sync.Map: entries live until explicitly deleted. Evicting an entry
// only drops the in-process enforcer; the next GetBizEnforcer call rebuilds
// it from the Redis policy cache or the DB, so eviction can never change an
// authorization decision, only latency.
//
// Composition with invalidation:
//   - Delete (used by ClearBizEnforcerCache and the Redis watcher) bumps a
//     generation counter. A fill that started before the Delete is not stored
//     (StoreIfGen), closing the "build from old rows, invalidate, then store"
//     race that an unbounded map also has.
//   - Config keys: bizEnforcerCacheMaxEntries, bizEnforcerCacheIdleTtlSeconds.

package object

import (
	"container/list"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/util"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	bizEnforcerCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "biz_enforcer_cache_hits_total",
		Help: "Business Casbin enforcer local cache hits.",
	})

	bizEnforcerCacheMisses = promauto.NewCounter(prometheus.CounterOpts{
		Name: "biz_enforcer_cache_misses_total",
		Help: "Business Casbin enforcer local cache misses (includes idle-expired entries).",
	})

	bizEnforcerCacheEvictions = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "biz_enforcer_cache_evictions_total",
		Help: "Business Casbin enforcer local cache removals, labeled by reason (lru|ttl|invalidate).",
	}, []string{"reason"})

	bizEnforcerCacheEntries = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "biz_enforcer_cache_entries",
		Help: "Current number of locally cached business Casbin enforcers.",
	})
)

type bizEnforcerEntry struct {
	key      string
	value    interface{}
	lastUsed time.Time
}

// bizEnforcerLRU is a concurrency-safe map with optional LRU cap and idle TTL.
type bizEnforcerLRU struct {
	mu      sync.RWMutex
	maxSize int           // 0 = unlimited
	idleTTL time.Duration // 0 = off
	now     func() time.Time
	ll      *list.List // front = most recently used
	items   map[string]*list.Element
	gen     atomic.Uint64

	fromConf  bool
	confOnce  sync.Once
	sweepOnce sync.Once
}

func newBizEnforcerLRU(maxSize int, idleTTL time.Duration) *bizEnforcerLRU {
	return &bizEnforcerLRU{
		maxSize: maxSize,
		idleTTL: idleTTL,
		now:     time.Now,
		ll:      list.New(),
		items:   map[string]*list.Element{},
	}
}

// newBizEnforcerLRUFromConf defers reading app.conf until first use so that
// package-level initialisation does not depend on config load order.
func newBizEnforcerLRUFromConf() *bizEnforcerLRU {
	c := newBizEnforcerLRU(0, 0)
	c.fromConf = true
	return c
}

func (c *bizEnforcerLRU) loadConf() {
	if !c.fromConf {
		return
	}
	c.confOnce.Do(func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		if n, err := strconv.Atoi(conf.GetConfigString("bizEnforcerCacheMaxEntries")); err == nil && n > 0 {
			c.maxSize = n
		}
		if n, err := strconv.Atoi(conf.GetConfigString("bizEnforcerCacheIdleTtlSeconds")); err == nil && n > 0 {
			c.idleTTL = time.Duration(n) * time.Second
		}
	})
}

// Generation returns the invalidation counter; capture it before building an
// enforcer and pass it to StoreIfGen.
func (c *bizEnforcerLRU) Generation() uint64 { return c.gen.Load() }

func (c *bizEnforcerLRU) Load(key string) (interface{}, bool) {
	c.loadConf() // limits are immutable after this returns
	if c.maxSize == 0 && c.idleTTL == 0 {
		// Unbounded (default): shared lock, no recency bookkeeping, so the
		// hot path scales like the former sync.Map.
		c.mu.RLock()
		el, ok := c.items[key]
		var v interface{}
		if ok {
			v = el.Value.(*bizEnforcerEntry).value
		}
		c.mu.RUnlock()
		if !ok {
			bizEnforcerCacheMisses.Inc()
			return nil, false
		}
		bizEnforcerCacheHits.Inc()
		return v, true
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[key]
	if !ok {
		bizEnforcerCacheMisses.Inc()
		return nil, false
	}
	ent := el.Value.(*bizEnforcerEntry)
	now := c.now()
	if c.idleTTL > 0 && now.Sub(ent.lastUsed) > c.idleTTL {
		c.removeLocked(el, "ttl")
		bizEnforcerCacheMisses.Inc()
		return nil, false
	}
	ent.lastUsed = now
	c.ll.MoveToFront(el)
	bizEnforcerCacheHits.Inc()
	return ent.value, true
}

func (c *bizEnforcerLRU) Store(key string, value interface{}) {
	c.loadConf()
	c.mu.Lock()
	c.storeLocked(key, value)
	c.mu.Unlock()
	c.startSweeper()
}

// StoreIfGen stores only when no invalidation happened since gen was read.
// It reports whether the value was stored.
func (c *bizEnforcerLRU) StoreIfGen(key string, value interface{}, gen uint64) bool {
	c.loadConf()
	c.mu.Lock()
	if c.gen.Load() != gen {
		c.mu.Unlock()
		return false
	}
	c.storeLocked(key, value)
	c.mu.Unlock()
	c.startSweeper()
	return true
}

func (c *bizEnforcerLRU) storeLocked(key string, value interface{}) {
	now := c.now()
	if el, ok := c.items[key]; ok {
		ent := el.Value.(*bizEnforcerEntry)
		ent.value, ent.lastUsed = value, now
		c.ll.MoveToFront(el)
		return
	}
	c.items[key] = c.ll.PushFront(&bizEnforcerEntry{key: key, value: value, lastUsed: now})
	for c.maxSize > 0 && c.ll.Len() > c.maxSize {
		c.removeLocked(c.ll.Back(), "lru")
	}
	bizEnforcerCacheEntries.Set(float64(len(c.items)))
}

// Delete drops one entry and bumps the invalidation generation.
func (c *bizEnforcerLRU) Delete(key string) {
	c.mu.Lock()
	c.gen.Add(1)
	if el, ok := c.items[key]; ok {
		c.removeLocked(el, "invalidate")
	}
	c.mu.Unlock()
}

func (c *bizEnforcerLRU) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

func (c *bizEnforcerLRU) removeLocked(el *list.Element, reason string) {
	ent := el.Value.(*bizEnforcerEntry)
	c.ll.Remove(el)
	delete(c.items, ent.key)
	bizEnforcerCacheEvictions.WithLabelValues(reason).Inc()
	bizEnforcerCacheEntries.Set(float64(len(c.items)))
}

// sweepExpired removes idle-expired entries (oldest first, so it can stop at
// the first live one). Returns the number removed.
func (c *bizEnforcerLRU) sweepExpired() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.idleTTL <= 0 {
		return 0
	}
	now := c.now()
	n := 0
	for el := c.ll.Back(); el != nil; el = c.ll.Back() {
		if now.Sub(el.Value.(*bizEnforcerEntry).lastUsed) <= c.idleTTL {
			break
		}
		c.removeLocked(el, "ttl")
		n++
	}
	return n
}

// startSweeper launches the background idle sweeper once, only when an idle
// TTL is configured. Without it, apps that are never requested again would
// keep their enforcer in memory (Load only expires lazily).
func (c *bizEnforcerLRU) startSweeper() {
	c.mu.RLock()
	ttl := c.idleTTL
	c.mu.RUnlock()
	if ttl <= 0 {
		return
	}
	c.sweepOnce.Do(func() {
		interval := ttl / 2
		if interval < time.Second {
			interval = time.Second
		}
		util.SafeGoroutine(func() {
			t := time.NewTicker(interval)
			defer t.Stop()
			for range t.C {
				if n := c.sweepExpired(); n > 0 {
					logs.Debug("biz enforcer cache: swept %d idle enforcers", n)
				}
			}
		})
	})
}
