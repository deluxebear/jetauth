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

package object

import (
	"context"
	"os"
	"testing"
	"time"
)

// testRedisAddr returns the Redis endpoint for tests if configured,
// otherwise "" meaning skip. CI provides this; local dev skips unless
// the developer spins up a local Redis.
func testRedisAddr() string {
	return os.Getenv("REBAC_REDIS_TEST_ADDR")
}

func TestRedisBizReBACCache_Contract(t *testing.T) {
	addr := testRedisAddr()
	if addr == "" {
		t.Skip("REBAC_REDIS_TEST_ADDR not set; skipping Redis L3 contract test")
	}
	c, err := NewRedisBizReBACCache(RedisBizReBACCacheOptions{
		Addr:       addr,
		KeyPrefix:  "jetauth:rebac-test:" + t.Name() + ":",
		ChannelKey: "jetauth:rebac-test:invalidations:" + t.Name(),
	})
	if err != nil {
		t.Fatalf("NewRedisBizReBACCache: %v", err)
	}
	defer c.Close()
	// Flush the test prefix so we start clean.
	if err := c.flushPrefix(context.Background()); err != nil {
		t.Fatalf("flushPrefix: %v", err)
	}

	BizReBACCacheContractTest(t, c)
}

func TestRedisBizReBACCache_PubSubInvalidation(t *testing.T) {
	addr := testRedisAddr()
	if addr == "" {
		t.Skip("REBAC_REDIS_TEST_ADDR not set")
	}
	prefix := "jetauth:rebac-test:pubsub:"
	channel := "jetauth:rebac-test:invalidations:" + t.Name()

	// Two independent clients — simulate 2 app instances sharing Redis.
	invalidations := make(chan cacheKey, 4)
	flushes := make(chan string, 4)
	optsA := RedisBizReBACCacheOptions{
		Addr: addr, KeyPrefix: prefix, ChannelKey: channel,
		OnInvalidate: func(k cacheKey) { invalidations <- k },
		OnFlushStore: func(id string) { flushes <- id },
	}
	a, err := NewRedisBizReBACCache(optsA)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()

	b, err := NewRedisBizReBACCache(RedisBizReBACCacheOptions{
		Addr: addr, KeyPrefix: prefix, ChannelKey: channel,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()

	// Give subscribers a moment to register.
	time.Sleep(100 * time.Millisecond)

	// B invalidates a key → A's subscriber callback fires.
	b.Invalidate(context.Background(), cacheKey{StoreId: "s/a", Object: "o:1", Relation: "r"})
	select {
	case got := <-invalidations:
		if got.StoreId != "s/a" || got.Object != "o:1" || got.Relation != "r" {
			t.Errorf("invalidation payload wrong: %+v", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for invalidation")
	}

	// B flushes store → A's flush callback fires.
	b.FlushStore(context.Background(), "s/a")
	select {
	case got := <-flushes:
		if got != "s/a" {
			t.Errorf("flush store payload wrong: %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for flush")
	}
}
