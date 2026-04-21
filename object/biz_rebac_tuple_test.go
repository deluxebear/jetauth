// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

package object

import (
	"strings"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// TestParseObjectString verifies the pure parser for OpenFGA-style object
// strings (spec §4.3: "type:id" where id may itself contain colons).
func TestParseObjectString(t *testing.T) {
	cases := []struct {
		input      string
		wantType   string
		wantId     string
		wantErrSub string
	}{
		{"document:doc-1", "document", "doc-1", ""},
		{"user:alice", "user", "alice", ""},
		// only the first colon delimits — multi-colon ids are valid
		{"team:eng-team:sub", "team", "eng-team:sub", ""},
		{"bad", "", "", "object must be of form type:id"},
		{"", "", "", "object must be of form type:id"},
		{":onlyid", "", "", "object type cannot be empty"},
		{"onlytype:", "", "", "object id cannot be empty"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.input, func(t *testing.T) {
			gotType, gotId, err := parseObjectString(tc.input)
			if tc.wantErrSub != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantErrSub)
				}
				if !strings.Contains(err.Error(), tc.wantErrSub) {
					t.Fatalf("error %q does not contain %q", err.Error(), tc.wantErrSub)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if gotType != tc.wantType || gotId != tc.wantId {
				t.Fatalf("got (%q, %q), want (%q, %q)", gotType, gotId, tc.wantType, tc.wantId)
			}
		})
	}
}

// TestParseUserString verifies the pure parser for OpenFGA-style user strings
// (spec §4.3: supports plain user:id, userset team:id#relation, wildcard user:*).
func TestParseUserString(t *testing.T) {
	cases := []struct {
		input      string
		wantType   string
		wantId     string
		wantRel    string
		wantErrSub string
	}{
		{"user:alice", "user", "alice", "", ""},
		{"team:eng#member", "team", "eng", "member", ""},
		{"user:*", "user", "*", "", ""},
		{"document:doc1#viewer", "document", "doc1", "viewer", ""},
		{"bad", "", "", "", "user must be of form type:id"},
		// After stripping #member, remaining string is "" which has no colon →
		// "user must be of form type:id" (not "user type cannot be empty")
		{"#member", "", "", "", "user must be of form type:id"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.input, func(t *testing.T) {
			gotType, gotId, gotRel, err := parseUserString(tc.input)
			if tc.wantErrSub != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantErrSub)
				}
				if !strings.Contains(err.Error(), tc.wantErrSub) {
					t.Fatalf("error %q does not contain %q", err.Error(), tc.wantErrSub)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if gotType != tc.wantType || gotId != tc.wantId || gotRel != tc.wantRel {
				t.Fatalf("got (%q, %q, %q), want (%q, %q, %q)",
					gotType, gotId, gotRel, tc.wantType, tc.wantId, tc.wantRel)
			}
		})
	}
}

// TestPopulateDerived verifies that BizTuple.PopulateDerived correctly fills
// derived columns (StoreId, ObjectType, UserType, UserRelation) from raw fields.
func TestPopulateDerived(t *testing.T) {
	t.Run("simple user tuple", func(t *testing.T) {
		tup := &BizTuple{
			Owner:    "org-x",
			AppName:  "app-y",
			Object:   "document:doc-1",
			Relation: "viewer",
			User:     "user:alice",
		}
		if err := tup.PopulateDerived(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if tup.StoreId != "org-x/app-y" {
			t.Errorf("StoreId = %q, want %q", tup.StoreId, "org-x/app-y")
		}
		if tup.ObjectType != "document" {
			t.Errorf("ObjectType = %q, want %q", tup.ObjectType, "document")
		}
		if tup.UserType != "user" {
			t.Errorf("UserType = %q, want %q", tup.UserType, "user")
		}
		if tup.UserRelation != "" {
			t.Errorf("UserRelation = %q, want %q", tup.UserRelation, "")
		}
	})

	t.Run("userset tuple", func(t *testing.T) {
		tup := &BizTuple{
			Owner:    "org-x",
			AppName:  "app-y",
			Object:   "folder:eng",
			Relation: "viewer",
			User:     "team:eng-team#member",
		}
		if err := tup.PopulateDerived(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if tup.UserType != "team" {
			t.Errorf("UserType = %q, want %q", tup.UserType, "team")
		}
		if tup.UserRelation != "member" {
			t.Errorf("UserRelation = %q, want %q", tup.UserRelation, "member")
		}
	})

	t.Run("wildcard user", func(t *testing.T) {
		tup := &BizTuple{
			Owner:    "org-x",
			AppName:  "app-y",
			Object:   "document:readme",
			Relation: "viewer",
			User:     "user:*",
		}
		if err := tup.PopulateDerived(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if tup.ObjectType != "document" {
			t.Errorf("ObjectType = %q, want %q", tup.ObjectType, "document")
		}
		if tup.UserType != "user" {
			t.Errorf("UserType = %q, want %q", tup.UserType, "user")
		}
		if tup.UserRelation != "" {
			t.Errorf("UserRelation = %q, want %q", tup.UserRelation, "")
		}
	})

	t.Run("missing owner", func(t *testing.T) {
		tup := &BizTuple{
			Owner:   "",
			AppName: "app-y",
			Object:  "document:doc-1",
			User:    "user:alice",
		}
		err := tup.PopulateDerived()
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "missing owner") {
			t.Errorf("error %q does not contain %q", err.Error(), "missing owner")
		}
	})

	t.Run("bad object", func(t *testing.T) {
		tup := &BizTuple{
			Owner:   "org-x",
			AppName: "app-y",
			Object:  "noSemi",
			User:    "user:alice",
		}
		err := tup.PopulateDerived()
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "tuple object") {
			t.Errorf("error %q does not contain %q", err.Error(), "tuple object")
		}
	})
}

// TestAddBizTuples_DuplicateRejected verifies that the composite unique index
// uq_tuple on (store_id, object, relation, user) rejects phantom duplicates, so
// OpenFGA set semantics hold in Check/ListObjects (spec §4.4 row 188).
func TestAddBizTuples_DuplicateRejected(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-dup-" + util.GenerateUUID()[:8]
	appName := "app-dup"
	tup := &BizTuple{
		Owner:                owner,
		AppName:              appName,
		Object:               "document:doc-1",
		Relation:             "viewer",
		User:                 "user:alice",
		AuthorizationModelId: "fake-model-id",
	}
	if _, err := AddBizTuples([]*BizTuple{tup}); err != nil {
		t.Fatalf("first insert failed: %v", err)
	}
	// Re-insert identical triple (different struct instance, same key).
	dup := &BizTuple{
		Owner:                owner,
		AppName:              appName,
		Object:               "document:doc-1",
		Relation:             "viewer",
		User:                 "user:alice",
		AuthorizationModelId: "fake-model-id",
	}
	_, err := AddBizTuples([]*BizTuple{dup})
	if err == nil {
		t.Fatalf("duplicate insert unexpectedly succeeded (unique index missing?)")
	}
	// Cleanup
	_, _ = DeleteBizTuplesForApp(owner, appName)
}
