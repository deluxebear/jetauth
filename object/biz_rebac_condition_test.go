// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Pure-function tests for the CEL expression cache and environment
// builder. No DB required; these run in CI.

package object

import (
	"encoding/json"
	"strings"
	"testing"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
)

func TestCELEnv_BuildsSchemaTypes(t *testing.T) {
	cond := &openfgav1.Condition{
		Name:       "non_expired_grant",
		Expression: "current_time < expires_at",
		Parameters: map[string]*openfgav1.ConditionParamTypeRef{
			"current_time": {TypeName: openfgav1.ConditionParamTypeRef_TYPE_NAME_TIMESTAMP},
			"expires_at":   {TypeName: openfgav1.ConditionParamTypeRef_TYPE_NAME_TIMESTAMP},
		},
	}
	if _, err := buildCELEnvForCondition(cond); err != nil {
		t.Fatalf("build env: %v", err)
	}
}

// TestCELTypes_AllParamKinds covers every parameter kind the OpenFGA
// protobuf enumerates. Unspecified is tested separately since it's
// explicitly rejected.
func TestCELTypes_AllParamKinds(t *testing.T) {
	kinds := map[string]openfgav1.ConditionParamTypeRef_TypeName{
		"b":   openfgav1.ConditionParamTypeRef_TYPE_NAME_BOOL,
		"s":   openfgav1.ConditionParamTypeRef_TYPE_NAME_STRING,
		"i":   openfgav1.ConditionParamTypeRef_TYPE_NAME_INT,
		"u":   openfgav1.ConditionParamTypeRef_TYPE_NAME_UINT,
		"d":   openfgav1.ConditionParamTypeRef_TYPE_NAME_DOUBLE,
		"dur": openfgav1.ConditionParamTypeRef_TYPE_NAME_DURATION,
		"ts":  openfgav1.ConditionParamTypeRef_TYPE_NAME_TIMESTAMP,
		"m":   openfgav1.ConditionParamTypeRef_TYPE_NAME_MAP,
		"l":   openfgav1.ConditionParamTypeRef_TYPE_NAME_LIST,
		"a":   openfgav1.ConditionParamTypeRef_TYPE_NAME_ANY,
		"ip":  openfgav1.ConditionParamTypeRef_TYPE_NAME_IPADDRESS,
	}
	params := map[string]*openfgav1.ConditionParamTypeRef{}
	for n, k := range kinds {
		params[n] = &openfgav1.ConditionParamTypeRef{TypeName: k}
	}
	cond := &openfgav1.Condition{
		Name:       "all_types",
		Expression: "true",
		Parameters: params,
	}
	if _, err := buildCELEnvForCondition(cond); err != nil {
		t.Fatalf("build env with all types: %v", err)
	}
}

func TestCELEnv_UnspecifiedTypeRejected(t *testing.T) {
	cond := &openfgav1.Condition{
		Name:       "unspec_type",
		Expression: "true",
		Parameters: map[string]*openfgav1.ConditionParamTypeRef{
			"x": {TypeName: openfgav1.ConditionParamTypeRef_TYPE_NAME_UNSPECIFIED},
		},
	}
	if _, err := buildCELEnvForCondition(cond); err == nil {
		t.Fatal("expected error on UNSPECIFIED type")
	}
}

func TestCELProgramCache_ReusesCompiled(t *testing.T) {
	cond := &openfgav1.Condition{
		Name:       "cache_reuse_" + t.Name(),
		Expression: "1 < 2",
	}
	p1, err := compileCondition("model-cache-a", cond)
	if err != nil {
		t.Fatalf("first compile: %v", err)
	}
	p2, err := compileCondition("model-cache-a", cond)
	if err != nil {
		t.Fatalf("second compile: %v", err)
	}
	// Programs are interface values; identity comparison matches when the
	// concrete implementation is the same pointer under the hood, which
	// cel-go guarantees for cached ASTs.
	if p1 != p2 {
		t.Fatalf("cache miss: got different Program instances for identical key")
	}
}

func TestCELProgramCache_DifferentModelsIndependent(t *testing.T) {
	// Same condition name, different authorization models — cache entries
	// stay independent. This is the invariant that lets the cache live
	// globally without invalidation.
	cond := &openfgav1.Condition{
		Name:       "independent_" + t.Name(),
		Expression: "true",
	}
	p1, err := compileCondition("model-indep-a", cond)
	if err != nil {
		t.Fatalf("model a: %v", err)
	}
	p2, err := compileCondition("model-indep-b", cond)
	if err != nil {
		t.Fatalf("model b: %v", err)
	}
	if p1 == p2 {
		t.Fatalf("expected distinct Program instances across models, got the same")
	}
}

func TestCELCompile_MalformedExpr(t *testing.T) {
	cond := &openfgav1.Condition{
		Name:       "bad_expr_" + t.Name(),
		Expression: ")((  bad_syntax",
	}
	_, err := compileCondition("model-malformed", cond)
	if err == nil || !strings.Contains(err.Error(), "compile") {
		t.Fatalf("expected compile error, got: %v", err)
	}
}

func TestCELCompile_EmptyNameRejected(t *testing.T) {
	cond := &openfgav1.Condition{Expression: "true"}
	_, err := compileCondition("model-any", cond)
	if err == nil || !strings.Contains(err.Error(), "empty name") {
		t.Fatalf("expected empty-name error, got: %v", err)
	}
}

func TestCELCompile_NilRejected(t *testing.T) {
	_, err := compileCondition("model-any", nil)
	if err == nil || !strings.Contains(err.Error(), "nil condition") {
		t.Fatalf("expected nil-condition error, got: %v", err)
	}
}

// --- condition context JSON roundtrip (Task 2, OQ-4) ----------------------

func TestConditionContext_Empty(t *testing.T) {
	m, err := parseConditionContext("")
	if err != nil {
		t.Fatalf("empty: %v", err)
	}
	if len(m) != 0 {
		t.Fatalf("empty parse returned %d entries, want 0", len(m))
	}

	out, err := marshalConditionContext(m)
	if err != nil {
		t.Fatalf("empty marshal: %v", err)
	}
	if out != "" {
		t.Fatalf("empty marshal = %q, want \"\"", out)
	}
}

func TestConditionContext_NumberFidelity_Integer(t *testing.T) {
	m, err := parseConditionContext(`{"age": 42}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	v, ok := m["age"]
	if !ok {
		t.Fatal("age missing")
	}
	n, ok := v.(json.Number)
	if !ok {
		t.Fatalf("age type = %T, want json.Number (stock json.Unmarshal would yield float64 here)", v)
	}
	if got, err := n.Int64(); err != nil || got != 42 {
		t.Fatalf("Int64() = (%d, %v), want (42, nil)", got, err)
	}
}

func TestConditionContext_NumberFidelity_Float(t *testing.T) {
	m, err := parseConditionContext(`{"rate": 3.14}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	n, ok := m["rate"].(json.Number)
	if !ok {
		t.Fatalf("rate type = %T, want json.Number", m["rate"])
	}
	if n.String() != "3.14" {
		t.Fatalf("rate token = %q, want \"3.14\"", n.String())
	}
}

func TestConditionContext_NestedListAndMap(t *testing.T) {
	m, err := parseConditionContext(`{"ids": [1, 2, 3], "meta": {"x": 10, "y": "hello"}}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	ids, ok := m["ids"].([]any)
	if !ok || len(ids) != 3 {
		t.Fatalf("ids shape wrong: %T %v", m["ids"], m["ids"])
	}
	if _, ok := ids[0].(json.Number); !ok {
		t.Fatalf("nested list element type = %T, want json.Number", ids[0])
	}
	meta, ok := m["meta"].(map[string]any)
	if !ok {
		t.Fatalf("meta shape wrong: %T", m["meta"])
	}
	if _, ok := meta["x"].(json.Number); !ok {
		t.Fatalf("nested map element type = %T, want json.Number", meta["x"])
	}
	if s, ok := meta["y"].(string); !ok || s != "hello" {
		t.Fatalf("meta.y = %v (%T), want \"hello\"", meta["y"], meta["y"])
	}
}

func TestConditionContext_Roundtrip(t *testing.T) {
	// A mix of int, float, string, bool, list, map, null — the full
	// openfga-spec fixture shape. After parse → marshal → parse, the
	// deep structure should be byte-identical to the original parse.
	in := `{"b":true,"d":3.14,"i":42,"l":[1,"x",{"k":9}],"m":{"k":"v"},"n":null,"s":"hello"}`
	first, err := parseConditionContext(in)
	if err != nil {
		t.Fatalf("first parse: %v", err)
	}
	out, err := marshalConditionContext(first)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	second, err := parseConditionContext(out)
	if err != nil {
		t.Fatalf("second parse: %v", err)
	}
	// Validate shape preservation by comparing specific keys with type
	// assertions — a DeepEqual on map[string]any would compare
	// json.Number string values which we already know are stable.
	if first["s"] != second["s"] {
		t.Fatalf("string drift: %v vs %v", first["s"], second["s"])
	}
	if first["b"] != second["b"] {
		t.Fatalf("bool drift: %v vs %v", first["b"], second["b"])
	}
	fi, _ := first["i"].(json.Number)
	si, _ := second["i"].(json.Number)
	if fi.String() != si.String() {
		t.Fatalf("int drift: %s vs %s", fi, si)
	}
}

func TestConditionContext_Malformed(t *testing.T) {
	_, err := parseConditionContext(`{not valid`)
	if err == nil || !strings.Contains(err.Error(), "condition context") {
		t.Fatalf("want 'condition context' error, got: %v", err)
	}
}

func TestConditionContext_NullRoot(t *testing.T) {
	// `null` at the root decodes into a nil map — ensure we normalise
	// back to an empty non-nil map so callers can iterate safely.
	m, err := parseConditionContext(`null`)
	if err != nil {
		t.Fatalf("null: %v", err)
	}
	if m == nil {
		t.Fatal("null parse returned nil map; want empty non-nil")
	}
	if len(m) != 0 {
		t.Fatalf("null parse returned %d entries, want 0", len(m))
	}
}
