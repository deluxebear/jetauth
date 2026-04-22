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
	"testing"
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
