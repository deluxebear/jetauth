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
