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

// permission_enforcer_cache.go is an in-memory LRU+TTL cache of the Casbin
// enforcers that the PLATFORM permission system builds in
// getPermissionEnforcer(). Without it every authorization check re-creates
// an enforcer and re-reads the model, the p rules and the whole role tree.
//
// Safety model (stale authorization is a security bug):
//
//   - Every entry records which permission ids and which owners (orgs) it was
//     derived from. Writers invalidate by permission id, by owner, or flush
//     everything when the scope is unknown (see permission_enforcer_invalidate.go).
//   - A generation counter is bumped on every invalidation. An entry built
//     while an invalidation happened is NOT stored, which closes the
//     "read old rows, invalidate, then store" race.
//   - A TTL bounds staleness for anything that bypasses the hooks (manual SQL
//     edits, another instance without the Redis watcher).
//
// Cached enforcers are shared between goroutines and must be treated as
// read-only. Code that mutates policies must use newPermissionEnforcer().

package object

import (
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/casbin/casbin/v3"
	"github.com/deluxebear/jetauth/conf"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const (
	defaultPermissionEnforcerCacheSize = 1000
	defaultPermissionEnforcerCacheTTL  = 60 * time.Second
)

var (
	permissionEnforcerCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "permission_enforcer_cache_hits_total",
		Help: "Platform permission enforcer cache hits.",
	})

	permissionEnforcerCacheMisses = promauto.NewCounter(prometheus.CounterOpts{
		Name: "permission_enforcer_cache_misses_total",
		Help: "Platform permission enforcer cache misses (includes expired entries).",
	})

	permissionEnforcerCacheEvictions = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "permission_enforcer_cache_evictions_total",
		Help: "Platform permission enforcer cache removals, labeled by reason (lru|ttl|invalidate).",
	}, []string{"reason"})

	permissionEnforcerCacheInvalidations = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "permission_enforcer_cache_invalidations_total",
		Help: "Platform permission enforcer cache invalidation calls, labeled by scope (permission|owner|all) and source (local|remote).",
	}, []string{"scope", "source"})

	permissionEnforcerCacheSizeGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "permission_enforcer_cache_entries",
		Help: "Current number of cached platform permission enforcers.",
	})
)

// permissionEnforcerDeps is what a cached enforcer was derived from.
type permissionEnforcerDeps struct {
	permissionIds []string
	owners        []string
}

type permissionEnforcerEntry struct {
	key       string
	enforcer  *casbin.Enforcer
	expiresAt time.Time
	permIds   map[string]struct{}
	owners    map[string]struct{}
}

// PermissionEnforcerCache is a concurrency-safe LRU cache with TTL.
type PermissionEnforcerCache struct {
	mu      sync.Mutex
	maxSize int
	ttl     time.Duration
	now     func() time.Time
	ll      *list.List // front = most recently used
	items   map[string]*list.Element
	gen     atomic.Uint64
}

// NewPermissionEnforcerCache creates a cache. maxSize <= 0 or ttl <= 0 fall
// back to the defaults.
func NewPermissionEnforcerCache(maxSize int, ttl time.Duration) *PermissionEnforcerCache {
	if maxSize <= 0 {
		maxSize = defaultPermissionEnforcerCacheSize
	}
	if ttl <= 0 {
		ttl = defaultPermissionEnforcerCacheTTL
	}
	return &PermissionEnforcerCache{
		maxSize: maxSize,
		ttl:     ttl,
		now:     time.Now,
		ll:      list.New(),
		items:   map[string]*list.Element{},
	}
}

// Generation returns the current invalidation generation. Read it BEFORE
// building an enforcer and hand it to Put.
func (c *PermissionEnforcerCache) Generation() uint64 { return c.gen.Load() }

// Get returns a live entry and refreshes its LRU position.
func (c *PermissionEnforcerCache) Get(key string) (*casbin.Enforcer, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	el, ok := c.items[key]
	if !ok {
		permissionEnforcerCacheMisses.Inc()
		return nil, false
	}
	entry := el.Value.(*permissionEnforcerEntry)
	if !c.now().Before(entry.expiresAt) {
		c.removeLocked(el, "ttl")
		permissionEnforcerCacheMisses.Inc()
		return nil, false
	}
	c.ll.MoveToFront(el)
	permissionEnforcerCacheHits.Inc()
	return entry.enforcer, true
}

// Put stores an enforcer unless an invalidation happened since gen was read.
// Returns whether the entry was stored.
func (c *PermissionEnforcerCache) Put(key string, enforcer *casbin.Enforcer, deps permissionEnforcerDeps, gen uint64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.gen.Load() != gen {
		return false
	}

	entry := &permissionEnforcerEntry{
		key:       key,
		enforcer:  enforcer,
		expiresAt: c.now().Add(c.ttl),
		permIds:   toSet(deps.permissionIds),
		owners:    toSet(deps.owners),
	}
	if el, ok := c.items[key]; ok {
		el.Value = entry
		c.ll.MoveToFront(el)
	} else {
		c.items[key] = c.ll.PushFront(entry)
	}
	for len(c.items) > c.maxSize {
		c.removeLocked(c.ll.Back(), "lru")
	}
	permissionEnforcerCacheSizeGauge.Set(float64(len(c.items)))
	return true
}

// InvalidatePermissions drops every entry derived from any of the permission ids.
func (c *PermissionEnforcerCache) InvalidatePermissions(ids ...string) {
	c.invalidate(func(e *permissionEnforcerEntry) bool {
		for _, id := range ids {
			if _, ok := e.permIds[id]; ok {
				return true
			}
		}
		return false
	})
}

// InvalidateOwner drops every entry that depends on the given owner (org):
// its permissions, roles, model or adapter.
func (c *PermissionEnforcerCache) InvalidateOwner(owner string) {
	c.invalidate(func(e *permissionEnforcerEntry) bool {
		_, ok := e.owners[owner]
		return ok
	})
}

// InvalidateAll flushes the cache.
func (c *PermissionEnforcerCache) InvalidateAll() {
	c.invalidate(func(*permissionEnforcerEntry) bool { return true })
}

// Len returns the number of stored entries (including not-yet-purged expired ones).
func (c *PermissionEnforcerCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items)
}

func (c *PermissionEnforcerCache) invalidate(match func(*permissionEnforcerEntry) bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Bump while holding the lock so a concurrent Put either sees the new
	// generation (and is dropped) or completed before and is swept below.
	c.gen.Add(1)
	for el := c.ll.Front(); el != nil; {
		next := el.Next()
		if match(el.Value.(*permissionEnforcerEntry)) {
			c.removeLocked(el, "invalidate")
		}
		el = next
	}
	permissionEnforcerCacheSizeGauge.Set(float64(len(c.items)))
}

func (c *PermissionEnforcerCache) removeLocked(el *list.Element, reason string) {
	entry := el.Value.(*permissionEnforcerEntry)
	c.ll.Remove(el)
	delete(c.items, entry.key)
	permissionEnforcerCacheEvictions.WithLabelValues(reason).Inc()
	permissionEnforcerCacheSizeGauge.Set(float64(len(c.items)))
}

func toSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, v := range values {
		set[v] = struct{}{}
	}
	return set
}

// permissionEnforcerCacheKey fingerprints everything that, besides database
// content, determines the built enforcer.
func permissionEnforcerCacheKey(p *Permission, permissionIDs []string) string {
	raw, _ := json.Marshal([]interface{}{p.Owner, p.Name, p.Model, p.Adapter, p.Roles, p.Domains, permissionIDs})
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// ---------------------------------------------------------------------------
// process-wide instance

var permissionEnforcerCache atomic.Pointer[PermissionEnforcerCache]

func getPermissionEnforcerCache() *PermissionEnforcerCache {
	return permissionEnforcerCache.Load()
}

// SetPermissionEnforcerCache installs (or, with nil, removes) the process-wide
// cache. Exposed for tests and for InitPermissionEnforcerCache.
func SetPermissionEnforcerCache(c *PermissionEnforcerCache) {
	permissionEnforcerCache.Store(c)
}

func getConfigIntDefault(key string, def int64) int64 {
	value := conf.GetConfigString(key)
	if value == "" {
		return def
	}
	n, err := strconv.ParseInt(value, 10, 64)
	if err != nil || n <= 0 {
		logs.Warning("permission enforcer cache: invalid %s=%q, using %d", key, value, def)
		return def
	}
	return n
}

// InitPermissionEnforcerCache is the boot hook (main.go). Config keys:
//   - permissionEnforcerCacheEnabled    bool, default false
//   - permissionEnforcerCacheSize       max cached enforcers, default 1000
//   - permissionEnforcerCacheTtlSeconds entry TTL, default 60
//   - permissionEnforcerWatcherEnabled  bool, default false (see permission_enforcer_watcher.go)
func InitPermissionEnforcerCache() {
	if !conf.GetConfigBool("permissionEnforcerCacheEnabled") {
		logs.Info("permission enforcer cache: disabled (set permissionEnforcerCacheEnabled=true to enable)")
		return
	}

	size := int(getConfigIntDefault("permissionEnforcerCacheSize", defaultPermissionEnforcerCacheSize))
	ttl := time.Duration(getConfigIntDefault("permissionEnforcerCacheTtlSeconds", int64(defaultPermissionEnforcerCacheTTL/time.Second))) * time.Second
	SetPermissionEnforcerCache(NewPermissionEnforcerCache(size, ttl))
	logs.Info("permission enforcer cache: enabled, size=%d, ttl=%s", size, ttl)

	initPermissionEnforcerWatcher()
}
