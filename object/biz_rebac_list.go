// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_list.go owns the "inverse" engine commands — ListObjects
// and ListUsers — per spec §6.3 / §6.4. Correctness-first: each
// candidate flows through the existing ReBACCheck pipeline (cycle
// detection, memo, depth cap all carry over). SLA + rate limit + L2
// cache + Prometheus metrics land in CP-6 / CP-8 (spec §6.3.1).

package object

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
)

// listTimeout is the internal hard timeout for a single ListObjects or
// ListUsers call (spec §6.3 item 3). Past the deadline, we return the
// objects/users collected so far plus a continuation token so the caller
// can resume — avoids cancelling the whole request and losing work.
const listTimeout = 10 * time.Second

// defaultListPageSize / maxListPageSize mirror spec §6.3 ListObjects
// parameter bounds. The upper limit protects against hostile clients
// asking the server to Check unbounded candidates in one shot.
const (
	defaultListPageSize = 100
	maxListPageSize     = 1000
)

// ListObjectsRequest / ListObjectsResult: see spec §6.3.
type ListObjectsRequest struct {
	StoreId              string
	AuthorizationModelId string
	ObjectType           string
	Relation             string
	User                 string
	ContextualTuples     []TupleKey
	Context              map[string]any
	PageSize             int
	ContinuationToken    string
}

type ListObjectsResult struct {
	Objects           []string `json:"objects"`
	ContinuationToken string   `json:"continuationToken,omitempty"`
}

// listCursor is the structure encoded inside the opaque ContinuationToken.
// Kept minimal so we can grow it (e.g. intersection-branch exhaustion
// flags) without breaking existing tokens; callers must treat the token
// as opaque base64 anyway.
type listCursor struct {
	LastObjectId string `json:"o,omitempty"`
	LastUser     string `json:"u,omitempty"`
}

func encodeListCursor(c listCursor) string {
	if c.LastObjectId == "" && c.LastUser == "" {
		return ""
	}
	b, err := json.Marshal(c)
	if err != nil {
		// Unreachable for the struct shape above, but don't silently
		// drop a cursor — surface as error at the call site via empty
		// return + the caller can detect pagination mismatch.
		return ""
	}
	return base64.StdEncoding.EncodeToString(b)
}

func parseListCursor(token string) (listCursor, error) {
	if token == "" {
		return listCursor{}, nil
	}
	b, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return listCursor{}, fmt.Errorf("rebac list: invalid cursor encoding")
	}
	var c listCursor
	if err := json.Unmarshal(b, &c); err != nil {
		return listCursor{}, fmt.Errorf("rebac list: invalid cursor payload")
	}
	return c, nil
}

// ReBACListObjects enumerates the objects of ObjectType for which
// req.User holds req.Relation. Reverse-index candidate generation: we
// union (a) object_ids that appear as the object of any tuple in the
// given type, and (b) object_ids surfaced by contextual tuples. Each
// candidate is then fed to ReBACCheck; allowed candidates go into the
// result set until PageSize is reached or the 10s timeout fires.
//
// Correctness note: this over-fetches candidates (an object with no
// directly-related tuple for the requested relation may still grant
// via TTU / computed_userset), so we rely on ReBACCheck to be the
// authoritative filter. Optimisations land in CP-6.
func ReBACListObjects(req *ListObjectsRequest) (*ListObjectsResult, error) {
	if req == nil {
		return nil, fmt.Errorf("rebac list_objects: nil request")
	}
	if req.StoreId == "" || req.ObjectType == "" || req.Relation == "" || req.User == "" {
		return nil, fmt.Errorf("rebac list_objects: storeId, objectType, relation, user are all required")
	}

	owner, appName, err := parseStoreId(req.StoreId)
	if err != nil {
		return nil, err
	}

	model, err := resolveAuthorizationModel(req.StoreId, req.AuthorizationModelId)
	if err != nil {
		return nil, err
	}

	// Request-boundary schema validation: unknown object_type / relation
	// or user type surfaces as an error, not an empty list — matches the
	// Check-path validation (spec §7).
	if !schemaHasType(model, req.ObjectType) {
		return nil, fmt.Errorf("rebac list_objects: object type %q not in schema", req.ObjectType)
	}
	if !schemaHasRelation(model, req.ObjectType, req.Relation) {
		return nil, fmt.Errorf("rebac list_objects: relation %q not defined on type %q",
			req.Relation, req.ObjectType)
	}
	userType, _, userRel, err := parseUserString(req.User)
	if err != nil {
		return nil, fmt.Errorf("rebac list_objects: user: %w", err)
	}
	if !schemaHasType(model, userType) {
		return nil, fmt.Errorf("rebac list_objects: user type %q not in schema", userType)
	}
	if userRel != "" && !schemaHasRelation(model, userType, userRel) {
		return nil, fmt.Errorf("rebac list_objects: userset relation %q not defined on type %q",
			userRel, userType)
	}
	for i, ct := range req.ContextualTuples {
		if err := validateCheckRequestTuple(model, ct, fmt.Sprintf("contextual tuple #%d", i), true); err != nil {
			return nil, err
		}
	}

	cursor, err := parseListCursor(req.ContinuationToken)
	if err != nil {
		return nil, err
	}

	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = defaultListPageSize
	}
	if pageSize > maxListPageSize {
		pageSize = maxListPageSize
	}

	candidates, err := gatherCandidateObjects(owner, appName, req.ObjectType, req.ContextualTuples, cursor.LastObjectId)
	if err != nil {
		return nil, err
	}

	timeoutCtx, cancel := context.WithTimeout(context.Background(), listTimeout)
	defer cancel()

	var allowed []string
	var lastProcessed string
	for _, obj := range candidates {
		if err := timeoutCtx.Err(); err != nil {
			break
		}
		res, err := ReBACCheck(&CheckRequest{
			StoreId:              req.StoreId,
			AuthorizationModelId: req.AuthorizationModelId,
			TupleKey:             TupleKey{Object: obj, Relation: req.Relation, User: req.User},
			ContextualTuples:     req.ContextualTuples,
			Context:              req.Context,
		})
		if err != nil {
			return nil, fmt.Errorf("rebac list_objects: check %s: %w", obj, err)
		}
		lastProcessed = obj
		if res.Allowed {
			allowed = append(allowed, obj)
			if len(allowed) >= pageSize {
				break
			}
		}
	}

	next := ""
	// Emit a continuation token when we didn't exhaust the candidate list
	// — either pageSize filled up, or the timeout kicked in mid-scan.
	if lastProcessed != "" && lastProcessed != candidates[len(candidates)-1] {
		next = encodeListCursor(listCursor{LastObjectId: lastProcessed})
	} else if errors.Is(timeoutCtx.Err(), context.DeadlineExceeded) && lastProcessed != "" {
		next = encodeListCursor(listCursor{LastObjectId: lastProcessed})
	}

	return &ListObjectsResult{Objects: allowed, ContinuationToken: next}, nil
}

// gatherCandidateObjects returns the sorted union of object ids (of
// objectType) appearing anywhere in the store plus any contextual tuples
// — the full candidate set for a single ListObjects page. Objects ≤
// lastObjectId are skipped so cursor-based pagination walks forward
// deterministically. DB scan uses idx_reverse (store_id + object_type
// columns) for an index seek.
func gatherCandidateObjects(owner, appName, objectType string, contextual []TupleKey, lastObjectId string) ([]string, error) {
	seen := map[string]bool{}
	for _, t := range contextual {
		objType, _, perr := parseObjectString(t.Object)
		if perr != nil || objType != objectType {
			continue
		}
		if lastObjectId != "" && t.Object <= lastObjectId {
			continue
		}
		seen[t.Object] = true
	}

	if ormer != nil {
		storeId := BuildStoreId(owner, appName)
		session := ormer.Engine.
			Table(&BizTuple{}).
			Where("store_id = ? AND object_type = ?", storeId, objectType)
		if lastObjectId != "" {
			session = session.And("object > ?", lastObjectId)
		}
		rows := []*BizTuple{}
		if err := session.Cols("object").Find(&rows); err != nil {
			return nil, fmt.Errorf("rebac list_objects: reverse scan: %w", err)
		}
		for _, r := range rows {
			seen[r.Object] = true
		}
	}

	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out, nil
}
