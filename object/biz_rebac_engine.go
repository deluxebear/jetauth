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
	"strings"
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

// parseStoreId splits "{owner}/{appName}" back into its two parts, the
// inverse of BuildStoreId (spec §4.3). Empty owner or appName is rejected
// so callers can't sneak a half-formed store id past the DB filter.
func parseStoreId(storeId string) (owner, appName string, err error) {
	parts := strings.SplitN(storeId, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("rebac: invalid storeId %q, expected \"owner/appName\"", storeId)
	}
	return parts[0], parts[1], nil
}

// resolveAuthorizationModel loads the authorization model proto for a Check
// request. When modelId is empty, it falls back to the app's
// CurrentAuthorizationModelId. Cross-store lookups (a modelId belonging to
// a different owner/appName) return "not found" rather than 403 so the API
// doesn't leak model existence across tenants (spec §7.2).
func resolveAuthorizationModel(storeId, modelId string) (*openfgav1.AuthorizationModel, error) {
	owner, appName, err := parseStoreId(storeId)
	if err != nil {
		return nil, err
	}

	if modelId == "" {
		config, err := getBizAppConfig(owner, appName)
		if err != nil {
			return nil, fmt.Errorf("rebac: lookup app config: %w", err)
		}
		if config == nil || config.CurrentAuthorizationModelId == "" {
			return nil, fmt.Errorf("rebac: app %s/%s has no authorization model", owner, appName)
		}
		modelId = config.CurrentAuthorizationModelId
	}

	m, err := GetBizAuthorizationModel(modelId)
	if err != nil {
		return nil, fmt.Errorf("rebac: load authorization model: %w", err)
	}
	// Both "row missing" and "row belongs to a different store" collapse to
	// the same "not found" error — preventing a caller from confirming that
	// some other tenant's model id exists.
	if m == nil || m.Owner != owner || m.AppName != appName {
		return nil, fmt.Errorf("rebac: authorization model %s not found", modelId)
	}

	proto, err := ParseSchemaJSON(m.SchemaJSON)
	if err != nil {
		return nil, fmt.Errorf("rebac: parse authorization model %s: %w", modelId, err)
	}
	return proto, nil
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
