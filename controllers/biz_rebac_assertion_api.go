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
	"errors"

	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// BizListAssertions
// @Summary BizListAssertions
// @Tags Business Permission API
// @Description List all assertions for a ReBAC app, ordered by created_time asc.
// @Param appId query string true "owner/appName"
// @Success 200 {array} object.BizReBACAssertion
// @Router /biz-list-assertions [get]
func (c *ApiController) BizListAssertions() {
	appId := c.Ctx.Input.Query("appId")
	if appId == "" {
		c.ResponseError("appId is required")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	list, err := object.ListBizReBACAssertions(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(list)
}

type addAssertionRequest struct {
	Object      string `json:"object"`
	Relation    string `json:"relation"`
	User        string `json:"user"`
	Expected    bool   `json:"expected"`
	Description string `json:"description,omitempty"`
}

// BizAddAssertion
// @Summary BizAddAssertion
// @Tags Business Permission API
// @Description Add a frozen assertion test case for a ReBAC app.
// @Param appId query string true "owner/appName"
// @Param body body addAssertionRequest true "assertion fields"
// @Success 200 {object} object.BizReBACAssertion
// @Router /biz-add-assertion [post]
func (c *ApiController) BizAddAssertion() {
	appId := c.Ctx.Input.Query("appId")
	if appId == "" {
		c.ResponseError("appId is required")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	var body addAssertionRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &body); err != nil {
		c.ResponseError("invalid JSON body: " + err.Error())
		return
	}
	if body.Object == "" || body.Relation == "" || body.User == "" {
		c.ResponseError("object, relation, user are all required")
		return
	}
	a := &object.BizReBACAssertion{
		Owner: owner, AppName: appName,
		Object: body.Object, Relation: body.Relation, User: body.User,
		Expected: body.Expected, Description: body.Description,
		CreatedBy: c.GetSessionUsername(),
	}
	if _, err := object.AddBizReBACAssertion(a); err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(a)
}

// BizDeleteAssertion
// @Summary BizDeleteAssertion
// @Tags Business Permission API
// @Description Delete an assertion. Cross-tenant ids return "assertion not found".
// @Param appId query string true "owner/appName"
// @Param id query string true "assertion id"
// @Success 200 {object} object.Response
// @Router /biz-delete-assertion [post]
func (c *ApiController) BizDeleteAssertion() {
	appId := c.Ctx.Input.Query("appId")
	id := c.Ctx.Input.Query("id")
	if appId == "" || id == "" {
		c.ResponseError("appId and id are required")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if err := object.DeleteBizReBACAssertion(owner, appName, id); err != nil {
		if errors.Is(err, object.ErrAssertionNotFound) {
			c.ResponseError("assertion not found: " + id)
			return
		}
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(map[string]string{"id": id})
}

// BizRunAssertions
// @Summary BizRunAssertions
// @Tags Business Permission API
// @Description Run all assertions for a ReBAC app and return per-assertion results.
// @Param appId query string true "owner/appName"
// @Success 200 {array} object.AssertionRunResult
// @Router /biz-run-assertions [post]
func (c *ApiController) BizRunAssertions() {
	appId := c.Ctx.Input.Query("appId")
	if appId == "" {
		c.ResponseError("appId is required")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	results, err := object.RunAssertionsForApp(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(results)
}
