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

// Pure-function tests — no DB access — so they run in CI under the skipCi
// tag like the rest of the repo. The !skipCi tag is reserved for DB-bound
// or environment-dependent tests.

package object

import (
	"strings"
	"testing"
)

const minimalDSL = `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
`

func TestParseSchemaDSL_Minimal(t *testing.T) {
	parsed, err := ParseSchemaDSL(minimalDSL)
	if err != nil {
		t.Fatalf("parse err: %v", err)
	}
	if parsed.Proto == nil {
		t.Fatalf("Proto is nil")
	}
	if len(parsed.Proto.GetTypeDefinitions()) != 2 {
		t.Fatalf("want 2 types, got %d", len(parsed.Proto.GetTypeDefinitions()))
	}
	if parsed.JSON == "" {
		t.Fatalf("JSON was not populated")
	}
	// protojson produces compact output; just verify "user" appears as a type value.
	if !strings.Contains(parsed.JSON, `"user"`) {
		t.Fatalf("JSON missing type=user; got: %s", parsed.JSON)
	}
}

func TestParseSchemaDSL_EmptyRejected(t *testing.T) {
	_, err := ParseSchemaDSL("")
	if err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("want 'empty' error, got: %v", err)
	}
}

func TestParseSchemaDSL_InvalidReportsError(t *testing.T) {
	_, err := ParseSchemaDSL("this is not a valid DSL\n")
	if err == nil {
		t.Fatalf("expected error for invalid DSL")
	}
	if !strings.Contains(err.Error(), "parse DSL") {
		t.Fatalf("error should be wrapped with 'parse DSL: ', got: %v", err)
	}
}

func TestRenderSchemaFromProto_RoundTrip(t *testing.T) {
	parsed, err := ParseSchemaDSL(minimalDSL)
	if err != nil {
		t.Fatalf("parse err: %v", err)
	}
	rendered, err := RenderSchemaFromProto(parsed.Proto)
	if err != nil {
		t.Fatalf("render err: %v", err)
	}
	again, err := ParseSchemaDSL(rendered)
	if err != nil {
		t.Fatalf("re-parse err: %v\nrendered=%s", err, rendered)
	}
	if len(again.Proto.GetTypeDefinitions()) != len(parsed.Proto.GetTypeDefinitions()) {
		t.Fatalf("type count drift after roundtrip")
	}
}

func TestRenderSchemaFromProto_NilRejected(t *testing.T) {
	_, err := RenderSchemaFromProto(nil)
	if err == nil || !strings.Contains(err.Error(), "nil proto") {
		t.Fatalf("want 'nil proto' error, got: %v", err)
	}
}

func TestParseSchemaJSON_RoundTrip(t *testing.T) {
	parsed, err := ParseSchemaDSL(minimalDSL)
	if err != nil {
		t.Fatalf("parse err: %v", err)
	}
	proto, err := ParseSchemaJSON(parsed.JSON)
	if err != nil {
		t.Fatalf("parse JSON err: %v", err)
	}
	if len(proto.GetTypeDefinitions()) != 2 {
		t.Fatalf("type count drift after JSON roundtrip")
	}
}

func TestExtractRelationKeys(t *testing.T) {
	parsed, err := ParseSchemaDSL(minimalDSL)
	if err != nil {
		t.Fatalf("parse err: %v", err)
	}
	keys := ExtractRelationKeys(parsed.Proto)
	want := map[string]bool{"document#viewer": true}
	if len(keys) != len(want) {
		t.Fatalf("got %d keys, want %d: %v", len(keys), len(want), keys)
	}
	for _, k := range keys {
		if !want[k] {
			t.Fatalf("unexpected key %q", k)
		}
	}
}

func TestExtractTypeNames(t *testing.T) {
	parsed, err := ParseSchemaDSL(minimalDSL)
	if err != nil {
		t.Fatalf("parse err: %v", err)
	}
	names := ExtractTypeNames(parsed.Proto)
	if len(names) != 2 {
		t.Fatalf("got %d names, want 2: %v", len(names), names)
	}
	set := map[string]bool{}
	for _, n := range names {
		set[n] = true
	}
	if !set["user"] || !set["document"] {
		t.Fatalf("missing expected type names: %v", names)
	}
}

const complexDSL = `model
  schema 1.1

type user

type team
  relations
    define member: [user, team#member]

type folder
  relations
    define owner: [user]
    define editor: [user, team#member] or owner
    define viewer: [user, team#member] or editor

type document
  relations
    define parent: [folder]
    define owner: [user]
    define editor: [user] or owner or editor from parent
    define viewer: [user] or editor or viewer from parent
`

func TestComplexDSL_RoundTrip(t *testing.T) {
	parsed, err := ParseSchemaDSL(complexDSL)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	rendered, err := RenderSchemaFromProto(parsed.Proto)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	again, err := ParseSchemaDSL(rendered)
	if err != nil {
		t.Fatalf("re-parse: %v\nrendered=\n%s", err, rendered)
	}
	if len(again.Proto.GetTypeDefinitions()) != 4 {
		t.Fatalf("want 4 types after roundtrip, got %d", len(again.Proto.GetTypeDefinitions()))
	}
	keys := ExtractRelationKeys(again.Proto)
	if len(keys) < 8 { // team(1) + folder(3) + document(4) = 8; user has 0 relations
		t.Fatalf("want ≥8 relations after roundtrip, got %d: %v", len(keys), keys)
	}
}

func TestParseSchemaJSON_EmptyRejected(t *testing.T) {
	_, err := ParseSchemaJSON("")
	if err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("want 'empty' error, got: %v", err)
	}
}

func TestExtractRelationKeys_NilReturnsNil(t *testing.T) {
	keys := ExtractRelationKeys(nil)
	if keys != nil {
		t.Fatalf("want nil, got %v", keys)
	}
}

func TestExtractTypeNames_NilReturnsNil(t *testing.T) {
	names := ExtractTypeNames(nil)
	if names != nil {
		t.Fatalf("want nil, got %v", names)
	}
}
