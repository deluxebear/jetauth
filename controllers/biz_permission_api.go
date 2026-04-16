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

	"github.com/deluxebear/casdoor/object"
	"github.com/deluxebear/casdoor/util"
)

// wrapBizActionResponse wraps a CRUD action result, translating BizError
// templates via c.T() so the response language matches the user's locale.
func (c *ApiController) wrapBizActionResponse(affected bool, e ...error) *Response {
	if len(e) != 0 && e[0] != nil {
		if bizErr, ok := e[0].(*object.BizError); ok {
			// Translate the template, then format with args
			translated := c.T(bizErr.Namespace + ":" + bizErr.Template)
			msg := fmt.Sprintf(translated, bizErr.Args...)
			return &Response{Status: "error", Msg: msg}
		}
		return &Response{Status: "error", Msg: e[0].Error()}
	} else if affected {
		return &Response{Status: "ok", Msg: "", Data: "Affected"}
	} else {
		return &Response{Status: "ok", Msg: "", Data: "Unaffected"}
	}
}

// BizAppConfigListResponse represents the response for biz app config list APIs
type BizAppConfigListResponse struct {
	Status string                `json:"status" example:"ok"`
	Msg    string                `json:"msg" example:""`
	Data   []object.BizAppConfig `json:"data"`
}

// BizAppConfigResponse represents the response for single biz app config APIs
type BizAppConfigResponse struct {
	Status string              `json:"status" example:"ok"`
	Msg    string              `json:"msg" example:""`
	Data   object.BizAppConfig `json:"data"`
}

// BizRoleListResponse represents the response for biz role list APIs
type BizRoleListResponse struct {
	Status string           `json:"status" example:"ok"`
	Msg    string           `json:"msg" example:""`
	Data   []object.BizRole `json:"data"`
}

// BizRoleResponse represents the response for single biz role APIs
type BizRoleResponse struct {
	Status string         `json:"status" example:"ok"`
	Msg    string         `json:"msg" example:""`
	Data   object.BizRole `json:"data"`
}

// BizPermissionListResponse represents the response for biz permission list APIs
type BizPermissionListResponse struct {
	Status string                 `json:"status" example:"ok"`
	Msg    string                 `json:"msg" example:""`
	Data   []object.BizPermission `json:"data"`
}

// BizPermissionResponse represents the response for single biz permission APIs
type BizPermissionResponse struct {
	Status string               `json:"status" example:"ok"`
	Msg    string               `json:"msg" example:""`
	Data   object.BizPermission `json:"data"`
}

// BizEnforceResponse represents the response for biz enforce APIs
type BizEnforceResponse struct {
	Status string `json:"status" example:"ok"`
	Msg    string `json:"msg" example:""`
	Data   bool   `json:"data" example:"true"`
}

// BizBatchEnforceResponse represents the response for biz batch enforce APIs
type BizBatchEnforceResponse struct {
	Status string `json:"status" example:"ok"`
	Msg    string `json:"msg" example:""`
	Data   []bool `json:"data"`
}

// BizPoliciesResponse represents the response for biz policies export APIs
type BizPoliciesResponse struct {
	Status string `json:"status" example:"ok"`
	Msg    string `json:"msg" example:""`
	Data   struct {
		ModelText        string     `json:"modelText"`
		Policies         [][]string `json:"policies"`
		GroupingPolicies [][]string `json:"groupingPolicies"`
		Version          string     `json:"version"`
	} `json:"data"`
}

// BizUserRolesResponse represents the response for biz user roles APIs
type BizUserRolesResponse struct {
	Status string   `json:"status" example:"ok"`
	Msg    string   `json:"msg" example:""`
	Data   []string `json:"data"`
}

// BizUserPermissionsResponse represents the response for biz user permissions APIs
type BizUserPermissionsResponse struct {
	Status string `json:"status" example:"ok"`
	Msg    string `json:"msg" example:""`
	Data   struct {
		Roles            []string               `json:"roles"`
		AllowedResources []string               `json:"allowedResources"`
		AllowedActions   []string               `json:"allowedActions"`
		Properties       map[string]interface{} `json:"properties"`
	} `json:"data"`
}

// BizSyncStatsResponse represents the response for biz sync policies APIs
type BizSyncStatsResponse struct {
	Status string           `json:"status" example:"ok"`
	Msg    string           `json:"msg" example:""`
	Data   object.SyncStats `json:"data"`
}

// ── BizAppConfig ──

// GetBizAppConfigs
// @Summary Get business app configs
// @Tags Business Permission API
// @Description Get all business permission app configs for an organization
// @Param   owner     query    string  true  "The owner (organization) of the configs"
// @Success 200 {object} BizAppConfigListResponse "The Response object"
// @Router /biz-get-app-configs [get]
func (c *ApiController) GetBizAppConfigs() {
	owner := c.Ctx.Input.Query("owner")

	configs, err := object.GetBizAppConfigs(owner)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(configs)
}

// GetBizAppConfig
// @Summary Get business app config
// @Tags Business Permission API
// @Description Get a single business permission app config
// @Param   id     query    string  true  "The id (owner/appName) of the config"
// @Success 200 {object} BizAppConfigResponse "The Response object"
// @Router /biz-get-app-config [get]
func (c *ApiController) GetBizAppConfig() {
	id := c.Ctx.Input.Query("id")

	config, err := object.GetBizAppConfig(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(config)
}

// AddBizAppConfig
// @Summary Add business app config
// @Tags Business Permission API
// @Description Create a new business permission app config
// @Param   body    body   object.BizAppConfig  true  "The details of the config"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-app-config [post]
func (c *ApiController) AddBizAppConfig() {
	var config object.BizAppConfig
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &config)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizAppConfig(&config))
	c.ServeJSON()
}

// UpdateBizAppConfig
// @Summary Update business app config
// @Tags Business Permission API
// @Description Update an existing business permission app config
// @Param   id     query    string  true  "The id (owner/appName) of the config"
// @Param   body    body   object.BizAppConfig  true  "The details of the config"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-update-app-config [post]
func (c *ApiController) UpdateBizAppConfig() {
	id := c.Ctx.Input.Query("id")

	var config object.BizAppConfig
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &config)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.UpdateBizAppConfig(id, &config))
	c.ServeJSON()
}

// DeleteBizAppConfig
// @Summary Delete business app config
// @Tags Business Permission API
// @Description Delete a business permission app config
// @Param   body    body   object.BizAppConfig  true  "The details of the config"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-delete-app-config [post]
func (c *ApiController) DeleteBizAppConfig() {
	var config object.BizAppConfig
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &config)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.DeleteBizAppConfig(&config))
	c.ServeJSON()
}

// ── BizRole ──

// GetBizRoles
// @Summary Get business roles
// @Tags Business Permission API
// @Description Get all business roles for an app
// @Param   owner     query    string  true  "The owner (organization)"
// @Param   app       query    string  true  "The app name"
// @Success 200 {object} BizRoleListResponse "The Response object"
// @Router /biz-get-roles [get]
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

// GetBizRole
// @Summary Get business role
// @Tags Business Permission API
// @Description Get a single business role
// @Param   owner     query    string  true  "The owner (organization)"
// @Param   app       query    string  true  "The app name"
// @Param   name      query    string  true  "The role name"
// @Success 200 {object} BizRoleResponse "The Response object"
// @Router /biz-get-role [get]
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

// AddBizRole
// @Summary Add business role
// @Tags Business Permission API
// @Description Create a new business role
// @Param   body    body   object.BizRole  true  "The details of the role"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-role [post]
func (c *ApiController) AddBizRole() {
	var role object.BizRole
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizRole(&role))
	c.ServeJSON()
}

// UpdateBizRole
// @Summary Update business role
// @Tags Business Permission API
// @Description Update an existing business role
// @Param   owner     query    string  true  "The owner (organization)"
// @Param   app       query    string  true  "The app name"
// @Param   name      query    string  true  "The role name"
// @Param   body    body   object.BizRole  true  "The details of the role"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-update-role [post]
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

	// Authz is granted against body owner/appName; query params drive the DB
	// WHERE clause. Without this match, an attacker in tenant A can pass authz
	// with body.owner=A while query.owner points at tenant B's row.
	if role.Owner != owner || role.AppName != appName {
		c.ResponseError("body owner/appName must match query parameters")
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.UpdateBizRole(owner, appName, name, &role))
	c.ServeJSON()
}

// DeleteBizRole
// @Summary Delete business role
// @Tags Business Permission API
// @Description Delete a business role
// @Param   body    body   object.BizRole  true  "The details of the role"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-delete-role [post]
func (c *ApiController) DeleteBizRole() {
	var role object.BizRole
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.DeleteBizRole(&role))
	c.ServeJSON()
}

// ── BizPermission ──

// GetBizPermissions
// @Summary Get business permissions
// @Tags Business Permission API
// @Description Get all business permissions for an app
// @Param   owner     query    string  true  "The owner (organization)"
// @Param   app       query    string  true  "The app name"
// @Success 200 {object} BizPermissionListResponse "The Response object"
// @Router /biz-get-permissions [get]
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

// GetBizPermission
// @Summary Get business permission
// @Tags Business Permission API
// @Description Get a single business permission
// @Param   owner     query    string  true  "The owner (organization)"
// @Param   app       query    string  true  "The app name"
// @Param   name      query    string  true  "The permission name"
// @Success 200 {object} BizPermissionResponse "The Response object"
// @Router /biz-get-permission [get]
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

// AddBizPermission
// @Summary Add business permission
// @Tags Business Permission API
// @Description Create a new business permission rule
// @Param   body    body   object.BizPermission  true  "The details of the permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-permission [post]
func (c *ApiController) AddBizPermission() {
	var perm object.BizPermission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &perm)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizPermission(&perm))
	c.ServeJSON()
}

// UpdateBizPermission
// @Summary Update business permission
// @Tags Business Permission API
// @Description Update an existing business permission rule
// @Param   owner     query    string  true  "The owner (organization)"
// @Param   app       query    string  true  "The app name"
// @Param   name      query    string  true  "The permission name"
// @Param   body    body   object.BizPermission  true  "The details of the permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-update-permission [post]
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

	// Authz is granted against body owner/appName; query params drive the DB
	// WHERE clause. Without this match, an attacker in tenant A can pass authz
	// with body.owner=A while query.owner points at tenant B's row.
	if perm.Owner != owner || perm.AppName != appName {
		c.ResponseError("body owner/appName must match query parameters")
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.UpdateBizPermission(owner, appName, name, &perm))
	c.ServeJSON()
}

// DeleteBizPermission
// @Summary Delete business permission
// @Tags Business Permission API
// @Description Delete a business permission rule
// @Param   body    body   object.BizPermission  true  "The details of the permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-delete-permission [post]
func (c *ApiController) DeleteBizPermission() {
	var perm object.BizPermission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &perm)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.DeleteBizPermission(&perm))
	c.ServeJSON()
}

// ── Enforce ──

// BizEnforce
// @Summary Enforce business permission
// @Tags Business Permission API
// @Description Check if a request is allowed for the given business app
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Param   body    body   []interface{}  true  "The Casbin request array, e.g. [\"user\", \"/resource\", \"action\"]"
// @Success 200 {object} BizEnforceResponse "The enforce result"
// @Router /biz-enforce [post]
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

// BizBatchEnforce
// @Summary Batch enforce business permissions
// @Tags Business Permission API
// @Description Check multiple requests at once for the given business app
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Param   body    body   [][]interface{}  true  "The array of Casbin request arrays"
// @Success 200 {object} BizBatchEnforceResponse "The batch enforce results"
// @Router /biz-batch-enforce [post]
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

// BizGetPolicies
// @Summary Get business policies for SDK
// @Tags Business Permission API
// @Description Get model text, policies, and grouping policies for SDK local caching
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Success 200 {object} BizPoliciesResponse "The policies data with modelText, policies, groupingPolicies, version"
// @Router /biz-get-policies [get]
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

// ── User Roles ──

// BizGetUserRoles
// @Summary Get user roles in business app
// @Tags Business Permission API
// @Description Get all roles a user has in the given business app
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Param   userId    query    string  true  "The user id (org/username)"
// @Success 200 {object} BizUserRolesResponse "The list of role names"
// @Router /biz-get-user-roles [get]
func (c *ApiController) BizGetUserRoles() {
	appId := c.Ctx.Input.Query("appId")
	userId := c.Ctx.Input.Query("userId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	roles, err := object.BizGetUserRoles(owner, appName, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(roles)
}

// ── User Permission Summary ──

// BizGetUserPermissions
// @Summary Get user permission summary
// @Tags Business Permission API
// @Description Get a summary of user's roles, allowed resources, actions, and role properties
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Param   userId    query    string  true  "The user id (org/username)"
// @Success 200 {object} BizUserPermissionsResponse "The permission summary with roles, allowedResources, allowedActions, properties"
// @Router /biz-get-user-permissions [get]
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

// BizSyncPolicies
// @Summary Sync business policies
// @Tags Business Permission API
// @Description Manually trigger a full policy rebuild for the given business app
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Success 200 {object} BizSyncStatsResponse "The sync result with policyCount and roleCount"
// @Router /biz-sync-policies [post]
func (c *ApiController) BizSyncPolicies() {
	appId := c.Ctx.Input.Query("appId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	stats, err := object.SyncAppPolicies(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(stats)
}
