// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import "testing"

const directGrantDSL = `model
  schema 1.1

type user

type group
  relations
    define member: [user]

type document
  relations
    define owner: [user]
    define blocked: [user]
    define a: [user]
    define b: [user]
    define direct: [user]
    define viewer: [user, group#member] or owner
    define editor: owner
    define both: a and b
    define allowed: [user] but not blocked
    define wild: [user:*]
`

func TestDirectGrantSafe(t *testing.T) {
	parsed, err := ParseSchemaDSL(directGrantDSL)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	m := parsed.Proto
	cases := []struct {
		name     string
		relation string
		user     string
		want     bool
	}{
		{"this-only", "direct", "user:alice", true},
		{"union with this", "viewer", "user:alice", true},
		{"pure computed", "editor", "user:alice", false},
		{"intersection", "both", "user:alice", false},
		{"difference", "allowed", "user:alice", false},
		{"userset caller", "viewer", "group:g#member", false},
		{"wildcard caller", "viewer", "user:*", false},
		{"type restriction rejects subject", "wild", "user:alice", false},
		{"unknown relation", "nope", "user:alice", false},
	}
	for _, c := range cases {
		if got := directGrantSafe(m, "document", c.relation, c.user); got != c.want {
			t.Errorf("%s: directGrantSafe = %v, want %v", c.name, got, c.want)
		}
	}
}
