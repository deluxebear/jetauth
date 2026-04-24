// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"errors"
	"fmt"
	"strings"
)

// ModelTypeReBAC is the exact string BizAppConfig.ModelType must match for
// the ReBAC engine to be routed from BizEnforce. Any other value (including
// "" and "casbin") falls through to the legacy Casbin path.
const ModelTypeReBAC = "rebac"

var (
	errBadReBACArity   = errors.New("rebac: request must be 3 elements [object, relation, user]")
	errBadReBACElement = errors.New("rebac: every element must be a string")
	errBadReBACObject  = errors.New("rebac: object must be in form 'type:id'")
	errNotReBACModel   = errors.New("rebac: not a ReBAC app")
)

// reBACEnforceTuple is the parsed form of a ReBAC-mode BizEnforce request.
// Mirrors OpenFGA TupleKey: Object is 'type:id', Relation is the relation name,
// User is 'type:id' or 'type:id#relation' (userset) or 'type:*' (wildcard).
type reBACEnforceTuple struct {
	Object, Relation, User string
}

// dispatchEnforceIfReBAC routes a BizEnforce call to the ReBAC engine when
// the app's ModelType selects it. Returns handled=false when the app is not
// ReBAC so the caller falls through to the Casbin path.
//
// On ReBAC apps, request must be a 3-element []any: [object, relation, user].
// Malformed input returns handled=true with BizAuthzKindBadRequest so the
// caller stops (do NOT fall back to Casbin — that would silently allow/deny
// on the wrong engine).
func dispatchEnforceIfReBAC(config *BizAppConfig, request []any) (allowed bool, kind BizAuthzKind, handled bool, err error) {
	if config == nil || config.ModelType != ModelTypeReBAC {
		return false, "", false, nil
	}
	tuple, parseErr := parseReBACEnforceRequest(request)
	if parseErr != nil {
		return false, BizAuthzKindBadRequest, true, parseErr
	}
	result, checkErr := ReBACCheck(&CheckRequest{
		StoreId: BuildStoreId(config.Owner, config.AppName),
		TupleKey: TupleKey{
			Object:   tuple.Object,
			Relation: tuple.Relation,
			User:     tuple.User,
		},
	})
	if checkErr != nil {
		return false, BizAuthzKindEngineError, true, checkErr
	}
	if result.Allowed {
		return true, BizAuthzKindAllowed, true, nil
	}
	return false, BizAuthzKindDenied, true, nil
}

func parseReBACEnforceRequest(request []any) (*reBACEnforceTuple, error) {
	if len(request) != 3 {
		return nil, fmt.Errorf("%w: got %d", errBadReBACArity, len(request))
	}
	strs := make([]string, 3)
	for i, v := range request {
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("%w: index %d is %T", errBadReBACElement, i, v)
		}
		strs[i] = s
	}
	if !strings.Contains(strs[0], ":") {
		return nil, fmt.Errorf("%w: got %q", errBadReBACObject, strs[0])
	}
	return &reBACEnforceTuple{Object: strs[0], Relation: strs[1], User: strs[2]}, nil
}
