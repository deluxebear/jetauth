// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_condition.go owns CEL (Common Expression Language) evaluation
// for OpenFGA-compatible conditional tuples (spec §6.1 item 5). Compiled
// programs are cached globally by (authorizationModelId, conditionName);
// authorization models are append-only (spec §4.2), so cache entries never
// need invalidation during the process's lifetime.
//
// This file sits behind the anchor previously carried by
// biz_rebac_anchor.go for cel-go — the anchor can be removed once this
// package compiles (tracked in TODO.md).

package object

import (
	"fmt"
	"sync"

	"github.com/google/cel-go/cel"
	openfgav1 "github.com/openfga/api/proto/openfga/v1"
)

// celProgramCache holds compiled CEL programs keyed by
// "{authorizationModelId}|{conditionName}". Immutable models mean entries
// never need invalidation. Concurrent writers may race on the initial
// compile; both finish harmlessly, the second Store wins the cache slot,
// and all callers still receive a working Program.
var celProgramCache sync.Map // string -> cel.Program

// celTypeFor maps OpenFGA's ConditionParamTypeRef_TypeName to a CEL *Type.
// ANY / MAP / LIST degrade to DynType — CEL evaluates the concrete shape
// at call time, which matches the OpenFGA reference implementation's
// approach for heterogeneous parameters. IPADDRESS degrades to StringType
// since CEL has no native IP type.
func celTypeFor(tn openfgav1.ConditionParamTypeRef_TypeName) (*cel.Type, error) {
	switch tn {
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_BOOL:
		return cel.BoolType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_STRING:
		return cel.StringType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_INT:
		return cel.IntType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_UINT:
		return cel.UintType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_DOUBLE:
		return cel.DoubleType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_DURATION:
		return cel.DurationType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_TIMESTAMP:
		return cel.TimestampType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_ANY,
		openfgav1.ConditionParamTypeRef_TYPE_NAME_MAP,
		openfgav1.ConditionParamTypeRef_TYPE_NAME_LIST:
		return cel.DynType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_IPADDRESS:
		return cel.StringType, nil
	case openfgav1.ConditionParamTypeRef_TYPE_NAME_UNSPECIFIED:
		return nil, fmt.Errorf("param type is UNSPECIFIED")
	default:
		return nil, fmt.Errorf("unknown param type %v", tn)
	}
}

// buildCELEnvForCondition builds a CEL environment declaring every
// parameter of the condition as a typed variable. Used once per condition
// at program-compile time; callers should not invoke this on every Check.
func buildCELEnvForCondition(cond *openfgav1.Condition) (*cel.Env, error) {
	if cond == nil {
		return nil, fmt.Errorf("rebac cel: nil condition")
	}
	opts := make([]cel.EnvOption, 0, len(cond.GetParameters()))
	for name, ref := range cond.GetParameters() {
		t, err := celTypeFor(ref.GetTypeName())
		if err != nil {
			return nil, fmt.Errorf("rebac cel: condition %q param %q: %w",
				cond.GetName(), name, err)
		}
		opts = append(opts, cel.Variable(name, t))
	}
	env, err := cel.NewEnv(opts...)
	if err != nil {
		return nil, fmt.Errorf("rebac cel: build env for %q: %w", cond.GetName(), err)
	}
	return env, nil
}

// compileCondition returns a cached cel.Program for the given
// (authorizationModelId, cond.Name). Compiles on first use. Malformed
// expressions or unsupported parameter types bubble up as errors — not
// cached — so a fixed schema recompiles correctly on next call.
func compileCondition(authorizationModelId string, cond *openfgav1.Condition) (cel.Program, error) {
	if cond == nil {
		return nil, fmt.Errorf("rebac cel: nil condition")
	}
	if cond.GetName() == "" {
		return nil, fmt.Errorf("rebac cel: condition has empty name")
	}

	cacheKey := authorizationModelId + "|" + cond.GetName()
	if v, ok := celProgramCache.Load(cacheKey); ok {
		return v.(cel.Program), nil
	}

	env, err := buildCELEnvForCondition(cond)
	if err != nil {
		return nil, err
	}
	ast, issues := env.Compile(cond.GetExpression())
	if issues != nil && issues.Err() != nil {
		return nil, fmt.Errorf("rebac cel: compile %q: %w", cond.GetName(), issues.Err())
	}
	program, err := env.Program(ast)
	if err != nil {
		return nil, fmt.Errorf("rebac cel: program %q: %w", cond.GetName(), err)
	}
	celProgramCache.Store(cacheKey, program)
	return program, nil
}
