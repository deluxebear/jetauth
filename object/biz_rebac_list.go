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
	"runtime"
	"sort"
	"time"

	"golang.org/x/sync/errgroup"
)

// listTimeout is the internal hard timeout for a single ListObjects or
// ListUsers call (spec §6.3 item 3). Past the deadline, we return the
// objects/users collected so far plus a continuation token so the caller
// can resume — avoids cancelling the whole request and losing work.
const listTimeout = 10 * time.Second

// listBatchSizeMultiplier controls how many candidates we Check in
// parallel per batch relative to the caller's pageSize. 2× gives the
// worker pool enough runway to overlap I/O across candidates without
// wasting work on candidates past the page boundary when the page
// fills fast (common case: most candidates deny, a handful allow).
const listBatchSizeMultiplier = 2

// listCandidateWorkers sets the per-batch parallelism cap. Picks half
// the CPU count (bounded to [2, 8]) to leave room for other traffic on
// the API worker and avoid over-parallelising on laptop-sized hosts.
// The list pipeline is not the only consumer of the tupleset cache —
// saturating all cores here would starve Check on adjacent requests.
func listCandidateWorkers() int {
	n := runtime.NumCPU() / 2
	if n < 2 {
		return 2
	}
	if n > 8 {
		return 8
	}
	return n
}

// candidateCheckResult is the per-candidate outcome inside a batch.
// Kept as a struct (rather than parallel []bool + []error slices) so
// additions like "resolution string" or "cycle" flag don't require
// touching the fan-in loop.
type candidateCheckResult struct {
	allowed bool
	err     error
}

// runCandidateChecksInParallel runs `check` on each candidate in
// `batch` concurrently, bounded by listCandidateWorkers workers.
// Results are returned in input order so the caller can walk them
// sequentially to preserve cursor-stable ordering. Per-candidate
// errors are captured into result[i].err and do NOT abort the batch —
// the caller decides whether to fail the whole list or skip the
// candidate (ListObjects fails, ListUsers skips on errSchemaMissing).
// Honours ctx cancellation: once ctx expires, in-flight workers drain
// without starting new ones, which is what the per-call listTimeout
// needs to bound wall-clock under pathological candidate lists.
func runCandidateChecksInParallel(
	ctx context.Context,
	batch []string,
	check func(candidate string) (bool, error),
) []candidateCheckResult {
	results := make([]candidateCheckResult, len(batch))
	if len(batch) == 0 {
		return results
	}
	g, gCtx := errgroup.WithContext(ctx)
	g.SetLimit(listCandidateWorkers())
	for i, candidate := range batch {
		if gCtx.Err() != nil {
			// Deadline already fired — stop enqueueing, let in-flight drain.
			break
		}
		g.Go(func() error {
			if gCtx.Err() != nil {
				results[i].err = gCtx.Err()
				return nil
			}
			allowed, err := check(candidate)
			results[i] = candidateCheckResult{allowed: allowed, err: err}
			// Never propagate the per-candidate error to errgroup — a
			// single bad candidate must not cancel siblings, and the
			// error is already captured per-slot for the caller to
			// inspect in order.
			return nil
		})
	}
	_ = g.Wait()
	return results
}

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
func ReBACListObjects(req *ListObjectsRequest) (res *ListObjectsResult, err error) {
	start := time.Now()
	defer func() {
		outcome := "allowed"
		switch {
		case err != nil:
			outcome = "error"
			recordReBACEngineError(err)
		case res == nil || len(res.Objects) == 0:
			// Empty result on a successful enumeration: record as "denied"
			// so dashboards can distinguish "no object is reachable for
			// this user" from a happy-path hit.
			outcome = "denied"
		}
		observeReBACListObjects("objects", outcome, time.Since(start))
	}()

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
	batchSize := pageSize * listBatchSizeMultiplier

pageLoop:
	for start := 0; start < len(candidates); start += batchSize {
		if err := timeoutCtx.Err(); err != nil {
			break
		}
		end := start + batchSize
		if end > len(candidates) {
			end = len(candidates)
		}
		batch := candidates[start:end]

		results := runCandidateChecksInParallel(timeoutCtx, batch, func(obj string) (bool, error) {
			res, err := ReBACCheck(&CheckRequest{
				StoreId:              req.StoreId,
				AuthorizationModelId: req.AuthorizationModelId,
				TupleKey:             TupleKey{Object: obj, Relation: req.Relation, User: req.User},
				ContextualTuples:     req.ContextualTuples,
				Context:              req.Context,
			})
			if err != nil {
				return false, err
			}
			return res.Allowed, nil
		})

		// Walk results in candidate-list order to preserve cursor-stable
		// emission. A per-candidate error aborts the whole call (matches
		// the pre-parallel serial semantics).
		for i, obj := range batch {
			r := results[i]
			// Deadline-cancelled slots report ctx.Err via r.err; those
			// aren't "check failures", they're budget exhaustion. Stop
			// the walk so the cursor lands on the last successfully-
			// processed candidate, not on a half-run one.
			if errors.Is(r.err, context.DeadlineExceeded) || errors.Is(r.err, context.Canceled) {
				break pageLoop
			}
			if r.err != nil {
				return nil, fmt.Errorf("rebac list_objects: check %s: %w", obj, r.err)
			}
			lastProcessed = obj
			if r.allowed {
				allowed = append(allowed, obj)
				if len(allowed) >= pageSize {
					break pageLoop
				}
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

// ListUsersRequest / ListUsersResult: see spec §6.4. Inverse of
// ListObjects — given an (object, relation), enumerate the users who
// hold the relation.
type ListUsersRequest struct {
	StoreId              string
	AuthorizationModelId string
	Object               string
	Relation             string
	// UserFilter restricts the returned users to this type (or
	// "type#relation" form). Matches OpenFGA's ListUsers filter: pass
	// "user" to get only plain users; pass "team#member" to get team
	// usersets; empty means "all types".
	UserFilter        string
	ContextualTuples  []TupleKey
	Context           map[string]any
	PageSize          int
	ContinuationToken string
}

type ListUsersResult struct {
	Users             []string `json:"users"`
	ContinuationToken string   `json:"continuationToken,omitempty"`
}

// ReBACListUsers is the inverse of ReBACListObjects: given an (object,
// relation), enumerate users who hold the relation. Candidate generation
// pulls every distinct User string appearing in tuples for (store, object,
// relation) — plus contextual contributions — and dispatches each through
// ReBACCheck to filter via the full rewrite rules (so a userset like
// `team:eng#member` correctly surfaces individual user_ids when asked for
// plain `user` filter).
//
// Userset-granted users are NOT flattened in this MVP — spec §6.4 leaves
// the flattening strategy open, and a follow-up CP can add it. For now we
// return the raw user strings that appear in tuples (or contextual), as
// filtered by the requested type.
func ReBACListUsers(req *ListUsersRequest) (res *ListUsersResult, err error) {
	start := time.Now()
	defer func() {
		outcome := "allowed"
		switch {
		case err != nil:
			outcome = "error"
			recordReBACEngineError(err)
		case res == nil || len(res.Users) == 0:
			outcome = "denied"
		}
		observeReBACListObjects("users", outcome, time.Since(start))
	}()

	if req == nil {
		return nil, fmt.Errorf("rebac list_users: nil request")
	}
	if req.StoreId == "" || req.Object == "" || req.Relation == "" {
		return nil, fmt.Errorf("rebac list_users: storeId, object, relation are all required")
	}

	owner, appName, err := parseStoreId(req.StoreId)
	if err != nil {
		return nil, err
	}

	model, err := resolveAuthorizationModel(req.StoreId, req.AuthorizationModelId)
	if err != nil {
		return nil, err
	}

	objType, _, err := parseObjectString(req.Object)
	if err != nil {
		return nil, fmt.Errorf("rebac list_users: object: %w", err)
	}
	if !schemaHasType(model, objType) {
		return nil, fmt.Errorf("rebac list_users: object type %q not in schema", objType)
	}
	if !schemaHasRelation(model, objType, req.Relation) {
		return nil, fmt.Errorf("rebac list_users: relation %q not defined on type %q", req.Relation, objType)
	}
	for i, ct := range req.ContextualTuples {
		if err := validateCheckRequestTuple(model, ct, fmt.Sprintf("contextual tuple #%d", i), true); err != nil {
			return nil, err
		}
	}

	// Parse UserFilter: "type" or "type#relation".
	var filterType, filterRelation string
	if req.UserFilter != "" {
		if idx := splitHash(req.UserFilter); idx >= 0 {
			filterType = req.UserFilter[:idx]
			filterRelation = req.UserFilter[idx+1:]
		} else {
			filterType = req.UserFilter
		}
		if !schemaHasType(model, filterType) {
			return nil, fmt.Errorf("rebac list_users: filter type %q not in schema", filterType)
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

	candidates, err := gatherCandidateUsers(owner, appName, req.Object, req.Relation, req.ContextualTuples, cursor.LastUser, filterType, filterRelation)
	if err != nil {
		return nil, err
	}

	timeoutCtx, cancel := context.WithTimeout(context.Background(), listTimeout)
	defer cancel()

	var allowed []string
	var lastProcessed string
	batchSize := pageSize * listBatchSizeMultiplier

pageLoop:
	for start := 0; start < len(candidates); start += batchSize {
		if err := timeoutCtx.Err(); err != nil {
			break
		}
		end := start + batchSize
		if end > len(candidates) {
			end = len(candidates)
		}
		batch := candidates[start:end]

		results := runCandidateChecksInParallel(timeoutCtx, batch, func(user string) (bool, error) {
			res, err := ReBACCheck(&CheckRequest{
				StoreId:              req.StoreId,
				AuthorizationModelId: req.AuthorizationModelId,
				TupleKey:             TupleKey{Object: req.Object, Relation: req.Relation, User: user},
				ContextualTuples:     req.ContextualTuples,
				Context:              req.Context,
			})
			if err != nil {
				return false, err
			}
			return res.Allowed, nil
		})

		for i, user := range batch {
			r := results[i]
			if errors.Is(r.err, context.DeadlineExceeded) || errors.Is(r.err, context.Canceled) {
				break pageLoop
			}
			if r.err != nil {
				// Schema-missing for a candidate user shape (e.g. an
				// unknown userset relation) is not poison — skip the
				// candidate and advance the cursor past it.
				if errors.Is(r.err, errSchemaMissing) {
					lastProcessed = user
					continue
				}
				return nil, fmt.Errorf("rebac list_users: check %s: %w", user, r.err)
			}
			lastProcessed = user
			if r.allowed {
				allowed = append(allowed, user)
				if len(allowed) >= pageSize {
					break pageLoop
				}
			}
		}
	}

	next := ""
	if lastProcessed != "" && lastProcessed != candidates[len(candidates)-1] {
		next = encodeListCursor(listCursor{LastUser: lastProcessed})
	} else if errors.Is(timeoutCtx.Err(), context.DeadlineExceeded) && lastProcessed != "" {
		next = encodeListCursor(listCursor{LastUser: lastProcessed})
	}

	return &ListUsersResult{Users: allowed, ContinuationToken: next}, nil
}

// splitHash returns the index of the last `#` in s, or -1 if absent.
// Used by the UserFilter parser; a tiny helper to keep the dispatch
// readable.
func splitHash(s string) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == '#' {
			return i
		}
	}
	return -1
}

// gatherCandidateUsers returns the sorted union of distinct user strings
// that appear in any tuple for (storeId, object, relation) — plus
// contextual contributions — filtered by the optional UserFilter type
// (and optional #relation) and cursor. Caller then Check-filters each.
func gatherCandidateUsers(owner, appName, object, relation string, contextual []TupleKey, lastUser, filterType, filterRelation string) ([]string, error) {
	seen := map[string]bool{}

	matches := func(userStr string) bool {
		if filterType == "" {
			return true
		}
		userType, _, userRel, err := parseUserString(userStr)
		if err != nil {
			return false
		}
		if userType != filterType {
			return false
		}
		// Filter "user" accepts plain users AND wildcards (user:*),
		// rejects usersets (user:id#rel). Filter "team#member" only
		// accepts matching usersets.
		if filterRelation == "" {
			return userRel == ""
		}
		return userRel == filterRelation
	}

	for _, t := range contextual {
		if t.Object != object || t.Relation != relation {
			continue
		}
		if !matches(t.User) {
			continue
		}
		if lastUser != "" && t.User <= lastUser {
			continue
		}
		seen[t.User] = true
	}

	if ormer != nil {
		storeId := BuildStoreId(owner, appName)
		session := ormer.Engine.
			Table(&BizTuple{}).
			Where("store_id = ? AND object = ? AND relation = ?", storeId, object, relation)
		if lastUser != "" {
			session = session.And("user > ?", lastUser)
		}
		rows := []*BizTuple{}
		if err := session.Cols("user").Find(&rows); err != nil {
			return nil, fmt.Errorf("rebac list_users: scan: %w", err)
		}
		for _, r := range rows {
			if matches(r.User) {
				seen[r.User] = true
			}
		}
	}

	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out, nil
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
