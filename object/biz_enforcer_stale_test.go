// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"testing"
)

// A reader that captured the generation before a sync stored its fresh
// enforcer must not be able to overwrite it afterwards (M1).
func TestStoreInvalidatingBlocksStaleReaderStore(t *testing.T) {
	c := newBizEnforcerLRU(0, 0)
	gen := c.Generation() // reader starts building (may read a half-written table)
	c.StoreInvalidating("o/a", "fresh")
	if c.StoreIfGen("o/a", "stale", gen) {
		t.Fatal("stale reader store must be rejected after StoreInvalidating")
	}
	if v, _ := c.Load("o/a"); v != "fresh" {
		t.Fatalf("cache holds %v, want fresh", v)
	}
	// A reader that starts after the store may still cache.
	gen = c.Generation()
	if !c.StoreIfGen("o/b", "ok", gen) {
		t.Fatal("up-to-date reader store should succeed")
	}
}
