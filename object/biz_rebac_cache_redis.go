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

// biz_rebac_cache_redis.go is the L3 tier of the ReBAC tupleset cache.
// Invalidations are broadcast across instances via Redis pub/sub so a
// tuple write on instance A takes effect in instance B's L2 cache
// within one network round-trip, instead of waiting out the 10s TTL.
// See spec §6.3 and CP-8 C6.
//
// B3.2 ships the single-instance piece: Get/Set/Invalidate/FlushStore
// through Redis + a subscriber goroutine that fires per-message
// callbacks. B3.3 composes this with the L2 impl into a TieredCache
// wrapper and plumbs invalidation callbacks into L2 flushes.

package object

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/redis/go-redis/v9"
)

// RedisBizReBACCacheOptions configures a RedisBizReBACCache.
type RedisBizReBACCacheOptions struct {
	// Addr is the Redis host:port. Required.
	Addr string
	// Password — optional, empty for no auth.
	Password string
	// DB — Redis database index (0 by default).
	DB int
	// KeyPrefix is prepended to every cache key so multiple JetAuth
	// deployments (or tests) sharing a Redis don't collide. Default:
	// "jetauth:rebac:".
	KeyPrefix string
	// ChannelKey is the pub/sub channel name for cross-instance
	// invalidation broadcasts. Default: "jetauth:rebac:invalidations".
	ChannelKey string
	// OnInvalidate, if non-nil, is called when a single-key invalidation
	// arrives on the pub/sub channel — used by the TieredCache wrapper to
	// flush matching L2 entries. Runs in the subscriber goroutine; should
	// not block or panic.
	OnInvalidate func(k cacheKey)
	// OnFlushStore, if non-nil, is called when a store-flush broadcast
	// arrives. Same threading contract as OnInvalidate.
	OnFlushStore func(storeId string)
}

// RedisBizReBACCache is the L3 tier of BizReBACCache. Safe for concurrent
// use. Not started until NewRedisBizReBACCache succeeds.
type RedisBizReBACCache struct {
	client    *redis.Client
	opts      RedisBizReBACCacheOptions
	sub       *redis.PubSub
	cancelSub context.CancelFunc
	closeOnce sync.Once
}

// redisInvalidateMsg is the broadcast payload shape over the pub/sub channel.
type redisInvalidateMsg struct {
	StoreId    string `json:"storeId"`
	Object     string `json:"object,omitempty"`
	Relation   string `json:"relation,omitempty"`
	FlushStore bool   `json:"flushStore,omitempty"`
}

// NewRedisBizReBACCache connects to Redis (with a 3s Ping timeout) and
// launches the subscriber goroutine. Returns an error if the connection
// or subscribe fails — callers typically fall back to L2-only in that case.
func NewRedisBizReBACCache(opts RedisBizReBACCacheOptions) (*RedisBizReBACCache, error) {
	if opts.Addr == "" {
		return nil, fmt.Errorf("rebac redis cache: Addr is required")
	}
	if opts.KeyPrefix == "" {
		opts.KeyPrefix = "jetauth:rebac:"
	}
	if opts.ChannelKey == "" {
		opts.ChannelKey = "jetauth:rebac:invalidations"
	}
	client := redis.NewClient(&redis.Options{
		Addr:     opts.Addr,
		Password: opts.Password,
		DB:       opts.DB,
	})
	pingCtx, cancelPing := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancelPing()
	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("rebac redis cache: ping failed: %w", err)
	}
	subCtx, cancelSub := context.WithCancel(context.Background())
	sub := client.Subscribe(subCtx, opts.ChannelKey)
	// Wait for the subscription to actually register — Subscribe returns
	// immediately but the SUBSCRIBE command runs async on the connection.
	if _, err := sub.Receive(pingCtx); err != nil {
		cancelSub()
		_ = sub.Close()
		_ = client.Close()
		return nil, fmt.Errorf("rebac redis cache: subscribe failed: %w", err)
	}
	rc := &RedisBizReBACCache{
		client:    client,
		opts:      opts,
		sub:       sub,
		cancelSub: cancelSub,
	}
	go rc.consumeInvalidations(subCtx)
	logs.Info("rebac redis cache: connected at %s, channel=%q, prefix=%q", opts.Addr, opts.ChannelKey, opts.KeyPrefix)
	return rc, nil
}

func (c *RedisBizReBACCache) redisKey(k cacheKey) string {
	return c.opts.KeyPrefix + k.StoreId + ":" + k.Object + ":" + k.Relation
}

// Get retrieves cached tuplerefs from Redis. Returns (nil, false) on miss or error.
func (c *RedisBizReBACCache) Get(ctx context.Context, k cacheKey) ([]tupleRef, bool) {
	raw, err := c.client.Get(ctx, c.redisKey(k)).Bytes()
	if err == redis.Nil {
		return nil, false
	}
	if err != nil {
		logs.Warning("rebac redis cache: Get failed: %v", err)
		return nil, false
	}
	var refs []tupleRef
	if err := json.Unmarshal(raw, &refs); err != nil {
		logs.Warning("rebac redis cache: Get unmarshal failed: %v", err)
		return nil, false
	}
	return refs, true
}

// Set writes tuplerefs to Redis with the given TTL.
func (c *RedisBizReBACCache) Set(ctx context.Context, k cacheKey, refs []tupleRef, ttl time.Duration) {
	raw, err := json.Marshal(refs)
	if err != nil {
		logs.Warning("rebac redis cache: Set marshal failed: %v", err)
		return
	}
	if err := c.client.Set(ctx, c.redisKey(k), raw, ttl).Err(); err != nil {
		logs.Warning("rebac redis cache: Set failed: %v", err)
	}
}

// Invalidate deletes the key from Redis and broadcasts the invalidation to
// all subscribed instances so they can flush their L2 caches.
func (c *RedisBizReBACCache) Invalidate(ctx context.Context, k cacheKey) {
	if err := c.client.Del(ctx, c.redisKey(k)).Err(); err != nil {
		logs.Warning("rebac redis cache: Del failed: %v", err)
	}
	// Broadcast so other instances flush their L2.
	msg := redisInvalidateMsg{StoreId: k.StoreId, Object: k.Object, Relation: k.Relation}
	c.publish(ctx, msg)
}

// FlushStore removes all entries matching storeId. Uses SCAN + DEL in
// batches of 100 so a huge store doesn't block Redis for long.
func (c *RedisBizReBACCache) FlushStore(ctx context.Context, storeId string) {
	prefix := c.opts.KeyPrefix + storeId + ":"
	iter := c.client.Scan(ctx, 0, prefix+"*", 100).Iterator()
	var batch []string
	for iter.Next(ctx) {
		batch = append(batch, iter.Val())
		if len(batch) >= 100 {
			if err := c.client.Del(ctx, batch...).Err(); err != nil {
				logs.Warning("rebac redis cache: FlushStore batch Del failed: %v", err)
			}
			batch = batch[:0]
		}
	}
	if len(batch) > 0 {
		if err := c.client.Del(ctx, batch...).Err(); err != nil {
			logs.Warning("rebac redis cache: FlushStore final Del failed: %v", err)
		}
	}
	if err := iter.Err(); err != nil {
		logs.Warning("rebac redis cache: FlushStore scan failed: %v", err)
	}
	// Broadcast so other instances flush their L2.
	c.publish(ctx, redisInvalidateMsg{StoreId: storeId, FlushStore: true})
}

// Close stops the subscriber and releases the connection. Idempotent.
func (c *RedisBizReBACCache) Close() error {
	var err error
	c.closeOnce.Do(func() {
		c.cancelSub()
		_ = c.sub.Close()
		err = c.client.Close()
	})
	return err
}

// flushPrefix removes every key under opts.KeyPrefix. Exposed for tests
// so the contract test starts from a clean slate; not part of the
// BizReBACCache interface.
func (c *RedisBizReBACCache) flushPrefix(ctx context.Context) error {
	iter := c.client.Scan(ctx, 0, c.opts.KeyPrefix+"*", 100).Iterator()
	var batch []string
	for iter.Next(ctx) {
		batch = append(batch, iter.Val())
		if len(batch) >= 100 {
			if err := c.client.Del(ctx, batch...).Err(); err != nil {
				return err
			}
			batch = batch[:0]
		}
	}
	if len(batch) > 0 {
		if err := c.client.Del(ctx, batch...).Err(); err != nil {
			return err
		}
	}
	return iter.Err()
}

func (c *RedisBizReBACCache) publish(ctx context.Context, msg redisInvalidateMsg) {
	raw, err := json.Marshal(msg)
	if err != nil {
		logs.Warning("rebac redis cache: publish marshal failed: %v", err)
		return
	}
	if err := c.client.Publish(ctx, c.opts.ChannelKey, raw).Err(); err != nil {
		logs.Warning("rebac redis cache: publish failed: %v", err)
	}
}

// consumeInvalidations is the subscriber goroutine. Exits when subCtx is
// cancelled (by Close). Logs at WARN on errors and continues; if the
// subscription permanently fails, the caller's L2 will fall out of sync
// until the next restart — but the cache remains functional for reads.
func (c *RedisBizReBACCache) consumeInvalidations(ctx context.Context) {
	ch := c.sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case m, ok := <-ch:
			if !ok {
				return
			}
			var msg redisInvalidateMsg
			if err := json.Unmarshal([]byte(m.Payload), &msg); err != nil {
				logs.Warning("rebac redis cache: malformed invalidation: %v payload=%q", err, m.Payload)
				continue
			}
			if msg.FlushStore {
				if c.opts.OnFlushStore != nil {
					c.opts.OnFlushStore(msg.StoreId)
				}
				continue
			}
			if c.opts.OnInvalidate != nil {
				c.opts.OnInvalidate(cacheKey{StoreId: msg.StoreId, Object: msg.Object, Relation: msg.Relation})
			}
		}
	}
}
