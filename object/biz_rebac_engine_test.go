// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for the ReBAC Check engine skeleton — no DB access —
// so they run in CI. Rewrite-specific tests arrive in the follow-up commits
// (this / computed_userset / tuple_to_userset / union / intersection /
// difference), each with its own focused test file.

package object

import (
	"strings"
	"sync"
	"testing"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
)

func TestReBACCheck_NilRequestRejected(t *testing.T) {
	_, err := ReBACCheck(nil)
	if err == nil || !strings.Contains(err.Error(), "nil request") {
		t.Fatalf("want 'nil request' error, got: %v", err)
	}
}

func TestReBACCheck_EmptyStoreIdRejected(t *testing.T) {
	_, err := ReBACCheck(&CheckRequest{
		TupleKey: TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
	})
	if err == nil || !strings.Contains(err.Error(), "empty storeId") {
		t.Fatalf("want 'empty storeId' error, got: %v", err)
	}
}

func TestReBACCheck_IncompleteTupleRejected(t *testing.T) {
	cases := []struct {
		name  string
		tuple TupleKey
	}{
		{"missing object", TupleKey{Relation: "viewer", User: "user:alice"}},
		{"missing relation", TupleKey{Object: "document:d1", User: "user:alice"}},
		{"missing user", TupleKey{Object: "document:d1", Relation: "viewer"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ReBACCheck(&CheckRequest{
				StoreId:  "owner/app",
				TupleKey: tc.tuple,
			})
			if err == nil || !strings.Contains(err.Error(), "incomplete tuple key") {
				t.Fatalf("want 'incomplete tuple key' error, got: %v", err)
			}
		})
	}
}

// TestMaxResolutionDepth pins the cap at the OpenFGA reference default.
// A future contributor bumping this must edit the test, and the edit will
// show up in review — silent tuning here masks real schema cycles.
func TestMaxResolutionDepth(t *testing.T) {
	if maxResolutionDepth != 25 {
		t.Fatalf("maxResolutionDepth = %d, want 25 (OpenFGA v1.x default)", maxResolutionDepth)
	}
}

// dispatchTestCtx builds a checkContext from a DSL snippet. Pure — no DB.
func dispatchTestCtx(t *testing.T, dsl string) *checkContext {
	t.Helper()
	parsed, err := ParseSchemaDSL(dsl)
	if err != nil {
		t.Fatalf("dispatchTestCtx: parse DSL: %v", err)
	}
	return &checkContext{storeId: "owner/app", model: parsed.Proto}
}

// TestCheck_UnknownObjectType verifies the dispatcher surfaces a specific
// error when the tuple's object type isn't in the loaded schema. This path
// must not reach any rewrite stub — failing earlier keeps error messages
// actionable.
func TestCheck_UnknownObjectType(t *testing.T) {
	ctx := dispatchTestCtx(t, minimalDSL) // defines user + document only
	_, err := ctx.check(TupleKey{Object: "widget:w1", Relation: "viewer", User: "user:a"}, 0)
	if err == nil || !strings.Contains(err.Error(), `object type "widget" not in schema`) {
		t.Fatalf("want 'widget not in schema' error, got: %v", err)
	}
}

// TestCheck_UnknownRelation verifies a relation absent from the type's
// definition errors out before any rewrite runs.
func TestCheck_UnknownRelation(t *testing.T) {
	ctx := dispatchTestCtx(t, minimalDSL) // document has only viewer
	_, err := ctx.check(TupleKey{Object: "document:d1", Relation: "editor", User: "user:a"}, 0)
	if err == nil || !strings.Contains(err.Error(), `relation "editor" not defined`) {
		t.Fatalf("want 'editor not defined' error, got: %v", err)
	}
}

// TestCheck_MaxDepth verifies the cap fires before any rewrite is invoked.
// Starting at depth == maxResolutionDepth is the minimal reproducer.
func TestCheck_MaxDepth(t *testing.T) {
	ctx := dispatchTestCtx(t, minimalDSL)
	_, err := ctx.check(
		TupleKey{Object: "document:d1", Relation: "viewer", User: "user:a"},
		maxResolutionDepth,
	)
	if err == nil || !strings.Contains(err.Error(), "max resolution depth") {
		t.Fatalf("want 'max resolution depth' error, got: %v", err)
	}
}

// TestCheck_MemoHit verifies a pre-populated memo short-circuits dispatch.
// We store a `true` for the key under test and confirm check returns true
// without stepping into the stubbed `this` rewrite (which would error out
// with "not implemented").
func TestCheck_MemoHit(t *testing.T) {
	ctx := dispatchTestCtx(t, minimalDSL)
	key := TupleKey{Object: "document:d1", Relation: "viewer", User: "user:a"}
	ctx.memo.Store(memoKey(key), true)

	allowed, err := ctx.check(key, 0)
	if err != nil {
		t.Fatalf("memo hit path errored: %v", err)
	}
	if !allowed {
		t.Fatalf("memo hit returned false, want true")
	}
}

// TestMatchesContextualTuple covers the wildcard / userset / irrelevant-key
// edges for the pure helper that powers checkThis's first-pass scan. DB-
// backed verification of the full checkThis path lives in
// biz_rebac_engine_db_test.go.
func TestMatchesContextualTuple(t *testing.T) {
	cases := []struct {
		name     string
		ctuples  []TupleKey
		key      TupleKey
		want     bool
	}{
		{
			name:    "exact plain match",
			ctuples: []TupleKey{{Object: "document:d1", Relation: "viewer", User: "user:alice"}},
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
			want:    true,
		},
		{
			name:    "wildcard expands to plain user of same type",
			ctuples: []TupleKey{{Object: "document:d1", Relation: "viewer", User: "user:*"}},
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
			want:    true,
		},
		{
			name:    "wildcard does not cross to a different type",
			ctuples: []TupleKey{{Object: "document:d1", Relation: "viewer", User: "team:*"}},
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
			want:    false,
		},
		{
			name:    "wildcard does not grant a userset subject",
			ctuples: []TupleKey{{Object: "document:d1", Relation: "viewer", User: "user:*"}},
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "team:eng#member"},
			want:    false,
		},
		{
			name:    "different object is ignored",
			ctuples: []TupleKey{{Object: "document:d2", Relation: "viewer", User: "user:alice"}},
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
			want:    false,
		},
		{
			name:    "different relation is ignored",
			ctuples: []TupleKey{{Object: "document:d1", Relation: "editor", User: "user:alice"}},
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
			want:    false,
		},
		{
			name:    "empty contextual returns false fast",
			ctuples: nil,
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "user:alice"},
			want:    false,
		},
		{
			name:    "malformed user returns false, not panic",
			ctuples: []TupleKey{{Object: "document:d1", Relation: "viewer", User: "user:alice"}},
			key:     TupleKey{Object: "document:d1", Relation: "viewer", User: "bad-no-colon"},
			want:    false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := matchesContextualTuple(tc.ctuples, tc.key); got != tc.want {
				t.Fatalf("matchesContextualTuple = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestCheck_NilUserset verifies the defensive branch for a pathological
// proto whose relation has no oneof populated. The DSL parser never emits
// this, but a malformed JSON payload or partial proto could; the dispatcher
// must error rather than silently return false.
func TestCheck_NilUserset(t *testing.T) {
	model := &openfgav1.AuthorizationModel{
		TypeDefinitions: []*openfgav1.TypeDefinition{
			{Type: "user"},
			{
				Type: "document",
				Relations: map[string]*openfgav1.Userset{
					"viewer": {Userset: nil},
				},
			},
		},
	}
	ctx := &checkContext{storeId: "owner/app", model: model, memo: sync.Map{}}
	_, err := ctx.check(TupleKey{Object: "document:d1", Relation: "viewer", User: "user:a"}, 0)
	if err == nil || !strings.Contains(err.Error(), "no userset type") {
		t.Fatalf("want 'no userset type' error, got: %v", err)
	}
}

func TestParseStoreId(t *testing.T) {
	cases := []struct {
		in          string
		wantOwner   string
		wantAppName string
		wantErr     bool
	}{
		{"foo/bar", "foo", "bar", false},
		// Only the first slash delimits — app names with slashes are
		// already disallowed at entity creation, so this is mostly defence
		// in depth against bad input.
		{"org-1/app:sub", "org-1", "app:sub", false},
		{"foo/", "", "", true},
		{"/bar", "", "", true},
		{"foo", "", "", true},
		{"", "", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			owner, appName, err := parseStoreId(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("want error, got (%q, %q, nil)", owner, appName)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if owner != tc.wantOwner || appName != tc.wantAppName {
				t.Fatalf("got (%q, %q), want (%q, %q)", owner, appName, tc.wantOwner, tc.wantAppName)
			}
		})
	}
}
