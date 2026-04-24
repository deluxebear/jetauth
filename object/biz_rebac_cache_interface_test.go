package object

import (
	"context"
	"testing"
	"time"
)

// BizReBACCacheContractTest is the behavioral contract any L2/L3 impl must satisfy.
// Exported so C6's Redis impl test can reuse it.
func BizReBACCacheContractTest(t *testing.T, c BizReBACCache) {
	t.Helper()
	ctx := context.Background()
	key := cacheKey{StoreId: "test/app", Object: "doc:1", Relation: "viewer"}
	refs := []tupleRef{{User: "user:alice"}}

	// miss
	if got, ok := c.Get(ctx, key); ok || got != nil {
		t.Fatalf("expected miss, got ok=%v got=%v", ok, got)
	}

	// set + hit
	c.Set(ctx, key, refs, 10*time.Second)
	got, ok := c.Get(ctx, key)
	if !ok || len(got) != 1 || got[0].User != "user:alice" {
		t.Fatalf("expected hit with refs, got ok=%v got=%v", ok, got)
	}

	// invalidate
	c.Invalidate(ctx, key)
	if _, ok := c.Get(ctx, key); ok {
		t.Fatal("expected miss after invalidate")
	}

	// flush store
	c.Set(ctx, key, refs, 10*time.Second)
	c.FlushStore(ctx, "test/app")
	if _, ok := c.Get(ctx, key); ok {
		t.Fatal("expected miss after FlushStore")
	}
}

func TestInMemoryCache_Contract(t *testing.T) {
	BizReBACCacheContractTest(t, NewInMemoryBizReBACCache())
}

func TestInMemoryCache_Expiry(t *testing.T) {
	c := NewInMemoryBizReBACCache()
	ctx := context.Background()
	key := cacheKey{StoreId: "s", Object: "o:1", Relation: "r"}
	c.Set(ctx, key, []tupleRef{{User: "u:a"}}, 10*time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	if _, ok := c.Get(ctx, key); ok {
		t.Fatal("expected miss after expiry")
	}
}
