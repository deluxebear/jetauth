// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for cursor encode/decode + candidate generation
// that doesn't touch the DB. End-to-end ListObjects tests live in
// biz_rebac_list_db_test.go behind !skipCi.

package object

import (
	"strings"
	"testing"
)

func TestListCursor_RoundTrip(t *testing.T) {
	cases := []listCursor{
		{LastObjectId: "document:d1"},
		{LastObjectId: "folder:project_a/sub"},
		{LastUser: "user:alice"},
		{LastObjectId: "document:x", LastUser: "user:y"},
	}
	for _, c := range cases {
		t.Run(c.LastObjectId+"|"+c.LastUser, func(t *testing.T) {
			token := encodeListCursor(c)
			if token == "" {
				t.Fatalf("encoded empty string for non-empty cursor %+v", c)
			}
			got, err := parseListCursor(token)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if got != c {
				t.Fatalf("round-trip drift: got %+v want %+v", got, c)
			}
		})
	}
}

func TestListCursor_EmptyToken(t *testing.T) {
	c, err := parseListCursor("")
	if err != nil {
		t.Fatalf("empty token: %v", err)
	}
	if (c != listCursor{}) {
		t.Fatalf("empty token should yield zero cursor, got %+v", c)
	}
}

func TestListCursor_InvalidBase64(t *testing.T) {
	_, err := parseListCursor("not-base-64!!!")
	if err == nil || !strings.Contains(err.Error(), "cursor") {
		t.Fatalf("want cursor error, got %v", err)
	}
}

func TestListCursor_InvalidJSON(t *testing.T) {
	// Valid base64, invalid inner JSON
	token := "eyBiYWQganNvbg==" // base64 of "{ bad json"
	_, err := parseListCursor(token)
	if err == nil || !strings.Contains(err.Error(), "cursor") {
		t.Fatalf("want cursor error, got %v", err)
	}
}

func TestListCursor_EmptyStructEncodesToEmpty(t *testing.T) {
	// A cursor with zero fields means "no prior position" and must
	// round-trip to empty string so the caller can tell they're at the
	// start of the list.
	if got := encodeListCursor(listCursor{}); got != "" {
		t.Fatalf("empty cursor encoded to %q, want \"\"", got)
	}
}

// TestGatherCandidateObjects_ContextualOnly exercises the candidate
// generator without a DB: only contextual tuples contribute, sorted,
// and filtered by lastObjectId if set.
func TestGatherCandidateObjects_ContextualOnly(t *testing.T) {
	contextual := []TupleKey{
		{Object: "document:d3", Relation: "viewer", User: "user:a"},
		{Object: "document:d1", Relation: "viewer", User: "user:a"},
		{Object: "folder:f1", Relation: "viewer", User: "user:a"},
		{Object: "document:d2", Relation: "viewer", User: "user:a"},
	}
	cands, err := gatherCandidateObjects("owner", "app", "document", nil, contextual, "")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	want := []string{"document:d1", "document:d2", "document:d3"}
	if len(cands) != len(want) {
		t.Fatalf("len = %d, want %d (cands=%v)", len(cands), len(want), cands)
	}
	for i, c := range cands {
		if c != want[i] {
			t.Fatalf("cands[%d] = %q, want %q", i, c, want[i])
		}
	}
}

func TestGatherCandidateObjects_CursorFilter(t *testing.T) {
	contextual := []TupleKey{
		{Object: "document:d1", Relation: "viewer", User: "user:a"},
		{Object: "document:d2", Relation: "viewer", User: "user:a"},
		{Object: "document:d3", Relation: "viewer", User: "user:a"},
	}
	cands, err := gatherCandidateObjects("owner", "app", "document", nil, contextual, "document:d1")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	want := []string{"document:d2", "document:d3"}
	if len(cands) != len(want) {
		t.Fatalf("len = %d, want %d (cands=%v)", len(cands), len(want), cands)
	}
}
