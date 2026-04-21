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
// @Title BizWriteAuthorizationModel
// @Tag Business Permission API (ReBAC)
// @Description Save a ReBAC authorization model from DSL. If the DSL is
// identical to the current model, returns outcome=unchanged. If the new
// schema drops types or relations still referenced by existing tuples,
// returns outcome=conflict with the list of offending tuples; no new row
// is inserted. Otherwise inserts a new append-only row and advances the
// app's CurrentAuthorizationModelId.
// @Param   appId   query    string  true  "The app id (owner/appName)"
// @Param   body    body     controllers.writeAuthorizationModelRequest  true  "Schema DSL payload"
// @Success 200 {object} object.SaveAuthorizationModelResult "outcome + model id or conflict list"
// @router /biz-write-authorization-model [post]
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
// @Title BizReadAuthorizationModel
// @Tag Business Permission API (ReBAC)
// @Description Read an authorization model by id, or the current model if id
// is omitted. Cross-tenant lookups (id belongs to a different app) return
// "not found" rather than 403 so the API doesn't leak model existence
// across stores.
// @Param   appId   query    string  true   "The app id (owner/appName)"
// @Param   id      query    string  false  "Authorization model id; if empty, uses the app's current model"
// @Success 200 {object} object.BizAuthorizationModel "The authorization model"
// @router /biz-read-authorization-model [get]
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
// @Title BizListAuthorizationModels
// @Tag Business Permission API (ReBAC)
// @Description List all authorization models for an app, newest first.
// @Param   appId   query    string  true  "The app id (owner/appName)"
// @Success 200 {array} object.BizAuthorizationModel "Array of authorization models, newest first"
// @router /biz-list-authorization-models [get]
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
