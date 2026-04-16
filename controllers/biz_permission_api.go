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

	"github.com/deluxebear/casdoor/object"
	"github.com/deluxebear/casdoor/util"
)

// ── BizAppConfig ──

func (c *ApiController) GetBizAppConfigs() {
	owner := c.Ctx.Input.Query("owner")

	configs, err := object.GetBizAppConfigs(owner)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(configs)
}

func (c *ApiController) GetBizAppConfig() {
	id := c.Ctx.Input.Query("id")

	config, err := object.GetBizAppConfig(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(config)
}

func (c *ApiController) AddBizAppConfig() {
	var config object.BizAppConfig
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &config)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddBizAppConfig(&config))
	c.ServeJSON()
}

func (c *ApiController) UpdateBizAppConfig() {
	id := c.Ctx.Input.Query("id")

	var config object.BizAppConfig
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &config)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.UpdateBizAppConfig(id, &config))
	c.ServeJSON()
}

func (c *ApiController) DeleteBizAppConfig() {
	var config object.BizAppConfig
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &config)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteBizAppConfig(&config))
	c.ServeJSON()
}

// ── BizRole ──

func (c *ApiController) GetBizRoles() {
	owner := c.Ctx.Input.Query("owner")
	appName := c.Ctx.Input.Query("app")

	roles, err := object.GetBizRoles(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(roles)
}

func (c *ApiController) GetBizRole() {
	owner := c.Ctx.Input.Query("owner")
	appName := c.Ctx.Input.Query("app")
	name := c.Ctx.Input.Query("name")

	role, err := object.GetBizRole(owner, appName, name)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(role)
}

func (c *ApiController) AddBizRole() {
	var role object.BizRole
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddBizRole(&role))
	c.ServeJSON()
}

func (c *ApiController) UpdateBizRole() {
	owner := c.Ctx.Input.Query("owner")
	appName := c.Ctx.Input.Query("app")
	name := c.Ctx.Input.Query("name")

	var role object.BizRole
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.UpdateBizRole(owner, appName, name, &role))
	c.ServeJSON()
}

func (c *ApiController) DeleteBizRole() {
	var role object.BizRole
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteBizRole(&role))
	c.ServeJSON()
}

// ── BizPermission ──

func (c *ApiController) GetBizPermissions() {
	owner := c.Ctx.Input.Query("owner")
	appName := c.Ctx.Input.Query("app")

	perms, err := object.GetBizPermissions(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(perms)
}

func (c *ApiController) GetBizPermission() {
	owner := c.Ctx.Input.Query("owner")
	appName := c.Ctx.Input.Query("app")
	name := c.Ctx.Input.Query("name")

	perm, err := object.GetBizPermission(owner, appName, name)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(perm)
}

func (c *ApiController) AddBizPermission() {
	var perm object.BizPermission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &perm)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddBizPermission(&perm))
	c.ServeJSON()
}

func (c *ApiController) UpdateBizPermission() {
	owner := c.Ctx.Input.Query("owner")
	appName := c.Ctx.Input.Query("app")
	name := c.Ctx.Input.Query("name")

	var perm object.BizPermission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &perm)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.UpdateBizPermission(owner, appName, name, &perm))
	c.ServeJSON()
}

func (c *ApiController) DeleteBizPermission() {
	var perm object.BizPermission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &perm)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteBizPermission(&perm))
	c.ServeJSON()
}

// ── Enforce ──

func (c *ApiController) BizEnforce() {
	appId := c.Ctx.Input.Query("appId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	var request []interface{}
	err = json.Unmarshal(c.Ctx.Input.RequestBody, &request)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	result, err := object.BizEnforce(owner, appName, request)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(result)
}

func (c *ApiController) BizBatchEnforce() {
	appId := c.Ctx.Input.Query("appId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	var requests [][]interface{}
	err = json.Unmarshal(c.Ctx.Input.RequestBody, &requests)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	results, err := object.BizBatchEnforce(owner, appName, requests)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(results)
}

// ── Policies Export (for SDK) ──

func (c *ApiController) BizGetPolicies() {
	appId := c.Ctx.Input.Query("appId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	data, err := object.BizGetPoliciesForExport(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(data)
}

// ── User Permission Summary ──

func (c *ApiController) BizGetUserPermissions() {
	appId := c.Ctx.Input.Query("appId")
	userId := c.Ctx.Input.Query("userId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	data, err := object.BizGetUserPermissionSummary(owner, appName, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(data)
}

// ── Sync Policies ──

func (c *ApiController) BizSyncPolicies() {
	appId := c.Ctx.Input.Query("appId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	err = object.SyncAppPolicies(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk("ok")
}
