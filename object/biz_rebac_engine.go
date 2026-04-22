// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_engine.go is the entry point for OpenFGA-compatible Check
// evaluation against ReBAC tuples. The five rewrites (this, computed_userset,
// tuple_to_userset, union, intersection, difference) land in follow-up
// commits; this file defines the shared request/response shapes, the
// per-request context that carries memoisation across recursive branches,
// and the depth cap that keeps a pathological schema from exhausting the
// stack. Conditions / CEL evaluation belong to CP-4 (spec §6.5).

package object

import (
	"fmt"
	"sync"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
)

// maxResolutionDepth caps recursive evaluation at the OpenFGA reference
// default (spec §6.1). Hitting the cap returns an error rather than false so
// a miswritten schema with a real cycle can't masquerade as "no permission".
const maxResolutionDepth = 25

// TupleKey is the object-relation-user triple the engine reasons about.
// It intentionally does NOT embed openfgav1.TupleKey — exposing the proto
// struct leaks protobuf-message internals (MessageState, sizeCache, …) and
// would force protobuf JSON shape on HTTP responses. Conversion helpers live
// at the API edge when/if we need to speak the upstream wire form.
type TupleKey struct {
	Object   string `json:"object"`
	Relation string `json:"relation"`
	User     string `json:"user"`
}

// CheckRequest is the external input to ReBACCheck (spec §6.1).
type CheckRequest struct {
	StoreId              string
	AuthorizationModelId string
	TupleKey             TupleKey
	ContextualTuples     []TupleKey
	Context              map[string]any
}

// CheckResult is the external output of ReBACCheck (spec §6.1).
type CheckResult struct {
	Allowed    bool   `json:"allowed"`
	Resolution string `json:"resolution,omitempty"`
}

// checkContext carries everything recursive rewrite helpers need to share
// inside a single ReBACCheck call: the loaded store/model, the caller's
// contextual tuples, and a memo that collapses repeat sub-queries across
// sibling branches.
type checkContext struct {
	storeId        string
	model          *openfgav1.AuthorizationModel
	contextual     []TupleKey
	requestContext map[string]any
	memo           sync.Map // key: "object#relation@user" → bool
}

// ReBACCheck evaluates whether req.TupleKey.User has req.TupleKey.Relation
// on req.TupleKey.Object within the given store. Full OpenFGA v1.1 Check
// semantics (five rewrites) land in follow-up commits; this CP-3 skeleton
// owns input validation and the error envelope so callers can wire against
// a stable signature while the engine body fills in.
func ReBACCheck(req *CheckRequest) (*CheckResult, error) {
	if req == nil {
		return nil, fmt.Errorf("rebac check: nil request")
	}
	if req.StoreId == "" {
		return nil, fmt.Errorf("rebac check: empty storeId")
	}
	if req.TupleKey.Object == "" || req.TupleKey.Relation == "" || req.TupleKey.User == "" {
		return nil, fmt.Errorf("rebac check: incomplete tuple key %+v", req.TupleKey)
	}
	return nil, fmt.Errorf("rebac check: not implemented (CP-3 in progress)")
}
