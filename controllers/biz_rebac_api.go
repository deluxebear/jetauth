// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package controllers

import (
	"encoding/json"
	"fmt"

	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// writeAuthorizationModelRequest is the JSON body accepted by
// BizWriteAuthorizationModel. Keeping it close to the handler keeps the
// Swagger annotations self-contained.
type writeAuthorizationModelRequest struct {
	SchemaDSL string `json:"schemaDsl"`
}

// BizWriteAuthorizationModel
// @Summary BizWriteAuthorizationModel
// @Tags Business Permission API
// @Description Save a ReBAC authorization model from DSL. If the DSL is
// identical to the current model, returns outcome=unchanged. If the new
// schema drops types or relations still referenced by existing tuples,
// returns outcome=conflict with the list of offending tuples; no new row
// is inserted. Otherwise inserts a new append-only row and advances the
// app's CurrentAuthorizationModelId.
// @Param   appId   query    string  true  "The app id (owner/appName)"
// @Param   body    body     controllers.writeAuthorizationModelRequest  true  "Schema DSL payload"
// @Success 200 {object} object.SaveAuthorizationModelResult "outcome + model id or conflict list"
// @Router /biz-write-authorization-model [post]
func (c *ApiController) BizWriteAuthorizationModel() {
	appId := c.Ctx.Input.Query("appId")
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	var body writeAuthorizationModelRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &body); err != nil {
		c.ResponseError("invalid JSON body: " + err.Error())
		return
	}
	if body.SchemaDSL == "" {
		c.ResponseError("schemaDsl is required")
		return
	}

	createdBy := c.GetSessionUsername()
	if createdBy == "" {
		// Schema changes are low-frequency but audit-critical; an empty
		// CreatedBy breaks the history trail, so refuse early rather than
		// silently persist a row nobody can attribute. The authz filter
		// should already have gated this request; this is a defence in depth.
		c.ResponseError("unauthenticated: session has no username")
		return
	}
	result, err := object.SaveAuthorizationModel(owner, appName, body.SchemaDSL, createdBy)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	// Conflict is not a transport-level error — clients branch on
	// result.Outcome. This keeps the response envelope consistent across
	// all three outcomes (unchanged / advanced / conflict).
	c.ResponseOk(result)
}

// BizReadAuthorizationModel
// @Summary BizReadAuthorizationModel
// @Tags Business Permission API
// @Description Read an authorization model by id, or the current model if id
// is omitted. Cross-tenant lookups (id belongs to a different app) return
// "not found" rather than 403 so the API doesn't leak model existence
// across stores.
// @Param   appId   query    string  true   "The app id (owner/appName)"
// @Param   id      query    string  false  "Authorization model id; if empty, uses the app's current model"
// @Success 200 {object} object.BizAuthorizationModel "The authorization model"
// @Router /biz-read-authorization-model [get]
func (c *ApiController) BizReadAuthorizationModel() {
	appId := c.Ctx.Input.Query("appId")
	id := c.Ctx.Input.Query("id")
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if id == "" {
		config, err := object.GetBizAppConfig(appId)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		if config == nil {
			c.ResponseError("app config not found: " + appId)
			return
		}
		id = config.CurrentAuthorizationModelId
		if id == "" {
			c.ResponseError("app has no authorization model yet")
			return
		}
	}

	m, err := object.GetBizAuthorizationModel(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if m == nil {
		c.ResponseError("authorization model not found: " + id)
		return
	}
	if m.Owner != owner || m.AppName != appName {
		// Cross-tenant lookup attempt — surface as not-found not 403 so
		// we don't leak existence across stores (spec §7.2).
		c.ResponseError("authorization model not found: " + id)
		return
	}
	c.ResponseOk(m)
}

// BizListAuthorizationModels
// @Summary BizListAuthorizationModels
// @Tags Business Permission API
// @Description List all authorization models for an app, newest first.
// @Param   appId   query    string  true  "The app id (owner/appName)"
// @Success 200 {array} object.BizAuthorizationModel "Array of authorization models, newest first"
// @Router /biz-list-authorization-models [get]
func (c *ApiController) BizListAuthorizationModels() {
	appId := c.Ctx.Input.Query("appId")
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	models, err := object.ListBizAuthorizationModels(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(models)
}

// bizCheckTupleKey mirrors object.TupleKey for API serialisation. Kept
// local to the controller so the engine's internal type stays free of
// HTTP concerns.
type bizCheckTupleKey struct {
	Object   string `json:"object"`
	Relation string `json:"relation"`
	User     string `json:"user"`
}

// bizCheckRequest is the POST body for /api/biz-check.
type bizCheckRequest struct {
	AppId                string             `json:"appId"`
	AuthorizationModelId string             `json:"authorizationModelId,omitempty"`
	TupleKey             bizCheckTupleKey   `json:"tupleKey"`
	ContextualTuples     []bizCheckTupleKey `json:"contextualTuples,omitempty"`
	Context              map[string]any     `json:"context,omitempty"`
}

// bizCheckResponse is the shape wrapped inside ApiController.ResponseOk's
// data field for /api/biz-check.
type bizCheckResponse struct {
	Allowed    bool   `json:"allowed"`
	Resolution string `json:"resolution,omitempty"`
}

func toEngineTupleKeys(src []bizCheckTupleKey) []object.TupleKey {
	if len(src) == 0 {
		return nil
	}
	out := make([]object.TupleKey, len(src))
	for i, t := range src {
		out[i] = object.TupleKey{Object: t.Object, Relation: t.Relation, User: t.User}
	}
	return out
}

// BizCheck
// @Summary BizCheck
// @Tags Business Permission API
// @Description Evaluate whether a user has a relation on an object using
// the ReBAC engine. Honors contextual tuples (request-only grants) and
// conditional tuples (CEL-evaluated under the merged tuple-context +
// request-context). Query param `appId` accepted in addition to the body
// field; body wins if both are set.
// @Param   appId   query    string  false  "The app id (owner/appName); required via body if absent"
// @Param   body    body     controllers.bizCheckRequest  true  "Check request"
// @Success 200 {object} controllers.bizCheckResponse "allowed flag + optional resolution trace"
// @Router /biz-check [post]
func (c *ApiController) BizCheck() {
	var body bizCheckRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &body); err != nil {
		c.ResponseError("invalid JSON body: " + err.Error())
		return
	}
	if body.AppId == "" {
		body.AppId = c.Ctx.Input.Query("appId")
	}
	if body.AppId == "" {
		c.ResponseError("appId is required (body or ?appId= query)")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(body.AppId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	res, err := object.ReBACCheck(&object.CheckRequest{
		StoreId:              object.BuildStoreId(owner, appName),
		AuthorizationModelId: body.AuthorizationModelId,
		TupleKey: object.TupleKey{
			Object:   body.TupleKey.Object,
			Relation: body.TupleKey.Relation,
			User:     body.TupleKey.User,
		},
		ContextualTuples: toEngineTupleKeys(body.ContextualTuples),
		Context:          body.Context,
	})
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(bizCheckResponse{Allowed: res.Allowed, Resolution: res.Resolution})
}

// bizBatchCheckItem is a single entry in a /api/biz-batch-check request.
// No per-item appId — batches are app-scoped by design (spec CP-4 plan
// §Architecture: "never mix stores within one call").
type bizBatchCheckItem struct {
	TupleKey         bizCheckTupleKey   `json:"tupleKey"`
	ContextualTuples []bizCheckTupleKey `json:"contextualTuples,omitempty"`
	Context          map[string]any     `json:"context,omitempty"`
}

type bizBatchCheckRequest struct {
	AppId                string              `json:"appId"`
	AuthorizationModelId string              `json:"authorizationModelId,omitempty"`
	Checks               []bizBatchCheckItem `json:"checks"`
}

type bizBatchCheckResponseItem struct {
	Allowed    bool   `json:"allowed"`
	Resolution string `json:"resolution,omitempty"`
	Error      string `json:"error,omitempty"`
}

type bizBatchCheckResponse struct {
	Results []bizBatchCheckResponseItem `json:"results"`
}

// bizWriteTuplesRequest is the POST body for /api/biz-write-tuples.
// Writes and deletes are applied in a single transaction — a failure in
// any entry rolls the whole batch back.
type bizWriteTuplesRequest struct {
	AppId                string             `json:"appId"`
	AuthorizationModelId string             `json:"authorizationModelId,omitempty"`
	Writes               []bizWriteTupleIn  `json:"writes,omitempty"`
	Deletes              []bizCheckTupleKey `json:"deletes,omitempty"`
}

// bizWriteTupleIn mirrors BizTuple's wire-shape. Condition fields are
// optional; when absent the tuple is unconditional.
type bizWriteTupleIn struct {
	Object           string `json:"object"`
	Relation         string `json:"relation"`
	User             string `json:"user"`
	ConditionName    string `json:"conditionName,omitempty"`
	ConditionContext string `json:"conditionContext,omitempty"`
}

type bizWriteTuplesResponse struct {
	Written int64 `json:"written"`
	Deleted int64 `json:"deleted"`
}

// bizListObjectsRequest is the POST body for /api/biz-list-objects.
type bizListObjectsRequest struct {
	AppId                string             `json:"appId"`
	AuthorizationModelId string             `json:"authorizationModelId,omitempty"`
	ObjectType           string             `json:"objectType"`
	Relation             string             `json:"relation"`
	User                 string             `json:"user"`
	ContextualTuples     []bizCheckTupleKey `json:"contextualTuples,omitempty"`
	Context              map[string]any     `json:"context,omitempty"`
	PageSize             int                `json:"pageSize,omitempty"`
	ContinuationToken    string             `json:"continuationToken,omitempty"`
}

// BizListObjects
// @Summary BizListObjects
// @Tags Business Permission API
// @Description Enumerate the objects of ObjectType for which User holds
// Relation. Cursor-based pagination; each candidate runs through
// ReBACCheck so the full rewrite semantics apply (union / intersection
// / difference / computed_userset / tuple_to_userset / conditional
// tuples). Internal 10s timeout — past the deadline, returns what was
// collected plus a continuation token for the caller to resume.
// @Param   appId   query    string  false  "The app id (owner/appName)"
// @Param   body    body     controllers.bizListObjectsRequest  true  "List-objects request"
// @Success 200 {object} object.ListObjectsResult "Objects the user can reach + continuation token"
// @Router /biz-list-objects [post]
func (c *ApiController) BizListObjects() {
	var body bizListObjectsRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &body); err != nil {
		c.ResponseError("invalid JSON body: " + err.Error())
		return
	}
	if body.AppId == "" {
		body.AppId = c.Ctx.Input.Query("appId")
	}
	if body.AppId == "" {
		c.ResponseError("appId is required (body or ?appId= query)")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(body.AppId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	res, err := object.ReBACListObjects(&object.ListObjectsRequest{
		StoreId:              object.BuildStoreId(owner, appName),
		AuthorizationModelId: body.AuthorizationModelId,
		ObjectType:           body.ObjectType,
		Relation:             body.Relation,
		User:                 body.User,
		ContextualTuples:     toEngineTupleKeys(body.ContextualTuples),
		Context:              body.Context,
		PageSize:             body.PageSize,
		ContinuationToken:    body.ContinuationToken,
	})
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(res)
}

// bizListUsersRequest is the POST body for /api/biz-list-users.
type bizListUsersRequest struct {
	AppId                string             `json:"appId"`
	AuthorizationModelId string             `json:"authorizationModelId,omitempty"`
	Object               string             `json:"object"`
	Relation             string             `json:"relation"`
	UserFilter           string             `json:"userFilter,omitempty"`
	ContextualTuples     []bizCheckTupleKey `json:"contextualTuples,omitempty"`
	Context              map[string]any     `json:"context,omitempty"`
	PageSize             int                `json:"pageSize,omitempty"`
	ContinuationToken    string             `json:"continuationToken,omitempty"`
}

// BizListUsers
// @Summary BizListUsers
// @Tags Business Permission API
// @Description Enumerate the users that hold Relation on Object.
// UserFilter restricts by subject type ("user") or userset
// ("team#member"); empty returns all shapes. Same cursor +
// timeout + Check-per-candidate model as /biz-list-objects.
// @Param   appId   query    string  false  "The app id (owner/appName)"
// @Param   body    body     controllers.bizListUsersRequest  true  "List-users request"
// @Success 200 {object} object.ListUsersResult "Users + continuation token"
// @Router /biz-list-users [post]
func (c *ApiController) BizListUsers() {
	var body bizListUsersRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &body); err != nil {
		c.ResponseError("invalid JSON body: " + err.Error())
		return
	}
	if body.AppId == "" {
		body.AppId = c.Ctx.Input.Query("appId")
	}
	if body.AppId == "" {
		c.ResponseError("appId is required (body or ?appId= query)")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(body.AppId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	res, err := object.ReBACListUsers(&object.ListUsersRequest{
		StoreId:              object.BuildStoreId(owner, appName),
		AuthorizationModelId: body.AuthorizationModelId,
		Object:               body.Object,
		Relation:             body.Relation,
		UserFilter:           body.UserFilter,
		ContextualTuples:     toEngineTupleKeys(body.ContextualTuples),
		Context:              body.Context,
		PageSize:             body.PageSize,
		ContinuationToken:    body.ContinuationToken,
	})
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(res)
}

// BizExpand
// @Summary BizExpand
// @Tags Business Permission API
// @Description Return the rewrite tree for (object, relation) — a
// debugging / audit view of how grants compose. See spec §6.2 and
// the ExpandNode struct for the node shape.
// @Param   appId      query    string  true   "The app id (owner/appName)"
// @Param   object     query    string  true   "Object (e.g. document:d1)"
// @Param   relation   query    string  true   "Relation"
// @Param   id         query    string  false  "Authorization model id (default: app's current)"
// @Success 200 {object} object.ExpandResult "Rewrite tree with nested rewrite nodes"
// @Router /biz-expand [get]
func (c *ApiController) BizExpand() {
	appId := c.Ctx.Input.Query("appId")
	objectQ := c.Ctx.Input.Query("object")
	relationQ := c.Ctx.Input.Query("relation")
	modelId := c.Ctx.Input.Query("id")
	if appId == "" || objectQ == "" || relationQ == "" {
		c.ResponseError("appId, object, and relation are required")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	res, err := object.ReBACExpand(&object.ExpandRequest{
		StoreId:              object.BuildStoreId(owner, appName),
		AuthorizationModelId: modelId,
		Object:               objectQ,
		Relation:             relationQ,
	})
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(res)
}

// BizWriteTuples
// @Summary BizWriteTuples
// @Tags Business Permission API
// @Description Apply a batch of tuple writes and/or deletes atomically.
// Every tuple is validated against the current authorization model's
// type restrictions before any DB write — a rejected tuple aborts the
// whole batch. Empty writes + empty deletes is a no-op.
// @Param   appId   query    string  false  "The app id (owner/appName)"
// @Param   body    body     controllers.bizWriteTuplesRequest  true  "Batch tuple writes/deletes"
// @Success 200 {object} controllers.bizWriteTuplesResponse "Written + deleted row counts"
// @Router /biz-write-tuples [post]
func (c *ApiController) BizWriteTuples() {
	var body bizWriteTuplesRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &body); err != nil {
		c.ResponseError("invalid JSON body: " + err.Error())
		return
	}
	if body.AppId == "" {
		body.AppId = c.Ctx.Input.Query("appId")
	}
	if body.AppId == "" {
		c.ResponseError("appId is required (body or ?appId= query)")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(body.AppId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	// Build the engine-layer BizTuple slices.
	config, err := object.GetBizAppConfig(body.AppId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if config == nil {
		c.ResponseError("app config not found: " + body.AppId)
		return
	}
	modelId := body.AuthorizationModelId
	if modelId == "" {
		modelId = config.CurrentAuthorizationModelId
	}
	if modelId == "" && len(body.Writes) > 0 {
		c.ResponseError("cannot write tuples: app has no authorization model; write schema first")
		return
	}

	var writes []*object.BizTuple
	for i, w := range body.Writes {
		t := &object.BizTuple{
			Owner:                owner,
			AppName:              appName,
			Object:               w.Object,
			Relation:             w.Relation,
			User:                 w.User,
			ConditionName:        w.ConditionName,
			ConditionContext:     w.ConditionContext,
			AuthorizationModelId: modelId,
		}
		// PopulateDerived runs inside WriteBizTuples; an invalid shape
		// surfaces as a structured error. We also smoke-parse here so
		// we can point at the bad index in the caller's input.
		if derr := t.PopulateDerived(); derr != nil {
			c.ResponseError(fmt.Sprintf("write tuple #%d: %s", i, derr.Error()))
			return
		}
		writes = append(writes, t)
	}
	var deletes []*object.BizTuple
	for _, d := range body.Deletes {
		deletes = append(deletes, &object.BizTuple{
			Owner: owner, AppName: appName,
			Object: d.Object, Relation: d.Relation, User: d.User,
		})
	}

	written, deleted, err := object.WriteBizTuples(writes, deletes)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(bizWriteTuplesResponse{Written: written, Deleted: deleted})
}

// bizReadTuplesRequest is the GET body for /api/biz-read-tuples.
// Empty filter fields match everything. No cursor yet — CP-6 adds
// pagination when production load motivates it.
type bizReadTuplesRequest struct {
	AppId    string `json:"appId"`
	Object   string `json:"object,omitempty"`
	Relation string `json:"relation,omitempty"`
	User     string `json:"user,omitempty"`
}

// BizReadTuples
// @Summary BizReadTuples
// @Tags Business Permission API
// @Description Read tuples filtered by object / relation / user.
// Empty filter fields match everything.
// @Param   appId      query    string  false  "The app id (owner/appName)"
// @Param   object     query    string  false  "Filter: object (e.g. document:d1)"
// @Param   relation   query    string  false  "Filter: relation"
// @Param   user       query    string  false  "Filter: user"
// @Success 200 {array} object.BizTuple "Matching tuples"
// @Router /biz-read-tuples [get]
func (c *ApiController) BizReadTuples() {
	appId := c.Ctx.Input.Query("appId")
	objectFilter := c.Ctx.Input.Query("object")
	relationFilter := c.Ctx.Input.Query("relation")
	userFilter := c.Ctx.Input.Query("user")
	if appId == "" {
		c.ResponseError("appId is required")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	tuples, err := object.ReadBizTuples(owner, appName, objectFilter, relationFilter, userFilter)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(tuples)
}

// BizBatchCheck
// @Summary BizBatchCheck
// @Tags Business Permission API
// @Description Evaluate multiple Check requests against the same app /
// authorization model in one call. Response preserves input order; each
// item carries its own allowed flag and (on failure) an error string.
// Per-item appId is not supported — the batch is app-scoped.
// @Param   appId   query    string  false  "The app id (owner/appName); required via body if absent"
// @Param   body    body     controllers.bizBatchCheckRequest  true  "Batch check request"
// @Success 200 {object} controllers.bizBatchCheckResponse "Ordered results, one per input"
// @Router /biz-batch-check [post]
func (c *ApiController) BizBatchCheck() {
	var body bizBatchCheckRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &body); err != nil {
		c.ResponseError("invalid JSON body: " + err.Error())
		return
	}
	if body.AppId == "" {
		body.AppId = c.Ctx.Input.Query("appId")
	}
	if body.AppId == "" {
		c.ResponseError("appId is required (body or ?appId= query)")
		return
	}
	if len(body.Checks) == 0 {
		c.ResponseError("checks must not be empty")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(body.AppId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	storeId := object.BuildStoreId(owner, appName)

	results := make([]bizBatchCheckResponseItem, len(body.Checks))
	for i, item := range body.Checks {
		res, err := object.ReBACCheck(&object.CheckRequest{
			StoreId:              storeId,
			AuthorizationModelId: body.AuthorizationModelId,
			TupleKey: object.TupleKey{
				Object:   item.TupleKey.Object,
				Relation: item.TupleKey.Relation,
				User:     item.TupleKey.User,
			},
			ContextualTuples: toEngineTupleKeys(item.ContextualTuples),
			Context:          item.Context,
		})
		if err != nil {
			results[i] = bizBatchCheckResponseItem{Error: err.Error()}
			continue
		}
		results[i] = bizBatchCheckResponseItem{Allowed: res.Allowed, Resolution: res.Resolution}
	}
	c.ResponseOk(bizBatchCheckResponse{Results: results})
}
