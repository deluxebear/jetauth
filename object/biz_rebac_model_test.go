// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for schema hash — no DB access — so they run in CI.
// DB-bound coverage (insert/get roundtrip) lives in biz_rebac_model_db_test.go.

package object

import "testing"

func TestComputeSchemaHash_Deterministic(t *testing.T) {
	dsl := "model\n  schema 1.1\ntype user\n"
	h1 := computeSchemaHash(dsl)
	h2 := computeSchemaHash(dsl)
	if h1 != h2 {
		t.Fatalf("hash not deterministic: %s vs %s", h1, h2)
	}
	if len(h1) != 64 {
		t.Fatalf("hash length = %d, want 64 (sha256 hex)", len(h1))
	}
}

func TestComputeSchemaHash_DiffersOnByteChange(t *testing.T) {
	h1 := computeSchemaHash("model\n  schema 1.1\ntype user\n")
	h2 := computeSchemaHash("model\n  schema 1.1\ntype user\n ")
	if h1 == h2 {
		t.Fatalf("hash collided on trailing space: %s", h1)
	}
}
