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
	"strconv"

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// translateBizError returns a user-facing string for any error, applying
// i18n template translation when the error is a *object.BizError. Callers
// pass a nil-safe error and get back "" for no error.
func (c *ApiController) translateBizError(err error) string {
	if err == nil {
		return ""
	}
	if bizErr, ok := err.(*object.BizError); ok {
		translated := c.T(bizErr.Namespace + ":" + bizErr.Template)
		return fmt.Sprintf(translated, bizErr.Args...)
	}
	return err.Error()
}

// wrapBizActionResponse wraps a CRUD action result, translating BizError
// templates via c.T() so the response language matches the user's locale.
func (c *ApiController) wrapBizActionResponse(affected bool, e ...error) *Response {
	if len(e) != 0 && e[0] != nil {
		return &Response{Status: "error", Msg: c.translateBizError(e[0])}
	} else if affected {
		return &Response{Status: "ok", Msg: "", Data: "Affected"}
	} else {
		return &Response{Status: "ok", Msg: "", Data: "Unaffected"}
	}
}

// parseIdQuery decodes a required int64 "id" query param, responding with a
// 400 and returning ok=false if the value is missing or malformed. Callers
// should `return` immediately on ok=false — the response is already written.
func (c *ApiController) parseIdQuery(name string) (int64, bool) {
	raw := c.Ctx.Input.Query(name)
	if raw == "" {
		c.ResponseError(fmt.Sprintf("missing required query parameter: %s", name))
		return 0, false
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		c.ResponseError(fmt.Sprintf("invalid %s query parameter: %s", name, err.Error()))
		return 0, false
	}
	return id, true
}

// parseBizPageQuery reads the standard p/pageSize/field/value/sortField/sortOrder
// list parameters. paged is false (return everything, legacy behaviour) unless
// both p and pageSize are present and pageSize is positive.
func (c *ApiController) parseBizPageQuery() (limit int, q object.BizListQuery, paged bool) {
	page := c.Ctx.Input.Query("p")
	rawLimit := c.Ctx.Input.Query("pageSize")
	if page == "" || rawLimit == "" {
		return 0, q, false
	}
	limit = util.ParseInt(rawLimit)
	if limit <= 0 {
		return 0, q, false
	}
	q = object.BizListQuery{
		Field:     c.Ctx.Input.Query("field"),
		Value:     c.Ctx.Input.Query("value"),
		SortField: c.Ctx.Input.Query("sortField"),
		SortOrder: c.Ctx.Input.Query("sortOrder"),
		ScopeKind: c.Ctx.Input.Query("scopeKind"),
		Effect:    c.Ctx.Input.Query("effect"),
		State:     c.Ctx.Input.Query("state"),
		IsEnabled: c.Ctx.Input.Query("isEnabled"),
	}
	return limit, q, true
}

// ── Response types (kept for OpenAPI annotations) ──

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

// BizRoleStatsResponse represents the response for biz role stats APIs
type BizRoleStatsResponse struct {
	Status string              `json:"status" example:"ok"`
	Msg    string              `json:"msg" example:""`
	Data   object.BizRoleStats `json:"data"`
}

// BizPermissionStatsResponse represents the response for biz permission stats APIs
type BizPermissionStatsResponse struct {
	Status string                    `json:"status" example:"ok"`
	Msg    string                    `json:"msg" example:""`
	Data   object.BizPermissionStats `json:"data"`
}

// BizAppResourceListResponse represents the response for biz app resource list APIs
type BizAppResourceListResponse struct {
	Status string                  `json:"status" example:"ok"`
	Msg    string                  `json:"msg" example:""`
	Data   []object.BizAppResource `json:"data"`
}

// BizAppResourceResponse represents the response for a single biz app resource APIs
type BizAppResourceResponse struct {
	Status string                `json:"status" example:"ok"`
	Msg    string                `json:"msg" example:""`
	Data   object.BizAppResource `json:"data"`
}

// BizResourceImportPreviewResponse wraps the preview payload from
// biz-parse-resource-import so OpenAPI spec has a concrete data type.
type BizResourceImportPreviewResponse struct {
	Status string                          `json:"status" example:"ok"`
	Msg    string                          `json:"msg" example:""`
	Data   object.BizResourceImportPreview `json:"data"`
}

// BizResourceImportApplyResponse wraps the per-row outcome aggregate
// returned by biz-import-app-resources.
type BizResourceImportApplyResponse struct {
	Status string                              `json:"status" example:"ok"`
	Msg    string                              `json:"msg" example:""`
	Data   object.BizResourceImportApplyResult `json:"data"`
}

// BizPermissionMatchResponse wraps the test-match result.
type BizPermissionMatchResponse struct {
	Status string                          `json:"status" example:"ok"`
	Msg    string                          `json:"msg" example:""`
	Data   object.BizPermissionMatchResult `json:"data"`
}

// BizRoleMemberListResponse represents the response for paginated role member lists
type BizRoleMemberListResponse struct {
	Status string `json:"status" example:"ok"`
	Msg    string `json:"msg" example:""`
	Data   struct {
		Members []object.BizRoleMember `json:"members"`
		Total   int64                  `json:"total" example:"0"`
	} `json:"data"`
}

// BizRoleBulkDeleteRequest is the request body for POST /biz-bulk-delete-role.
type BizRoleBulkDeleteRequest struct {
	Ids []int64 `json:"ids"`
}

// BizRoleBulkDeleteResultItem is one row of the bulk-delete response. Per-id
// outcomes let the UI mark which roles failed (e.g. a child reference outside
// the selection kept them alive) vs which succeeded.
type BizRoleBulkDeleteResultItem struct {
	Id    int64  `json:"id" example:"1"`
	Ok    bool   `json:"ok" example:"true"`
	Error string `json:"error,omitempty" example:""`
}

// BizRoleBulkDeleteResponseData aggregates the per-id results plus a summary.
type BizRoleBulkDeleteResponseData struct {
	Results   []BizRoleBulkDeleteResultItem `json:"results"`
	Succeeded int                           `json:"succeeded" example:"2"`
	Failed    int                           `json:"failed" example:"1"`
	Total     int                           `json:"total" example:"3"`
}

// BizRoleBulkDeleteResponse is the envelope returned by /biz-bulk-delete-role.
type BizRoleBulkDeleteResponse struct {
	Status string                        `json:"status" example:"ok"`
	Msg    string                        `json:"msg" example:""`
	Data   BizRoleBulkDeleteResponseData `json:"data"`
}

// BizPermissionBulkDeleteRequest is the request body for POST /biz-bulk-delete-permission.
type BizPermissionBulkDeleteRequest struct {
	Ids []int64 `json:"ids"`
}

// BizPermissionBulkDeleteResultItem is one row of the permission bulk-delete
// response. Mirrors the role variant so the admin UI can share handling code.
type BizPermissionBulkDeleteResultItem struct {
	Id    int64  `json:"id" example:"1"`
	Ok    bool   `json:"ok" example:"true"`
	Error string `json:"error,omitempty" example:""`
}

// BizPermissionBulkDeleteResponseData aggregates per-id results plus summary counts.
type BizPermissionBulkDeleteResponseData struct {
	Results   []BizPermissionBulkDeleteResultItem `json:"results"`
	Succeeded int                                 `json:"succeeded" example:"2"`
	Failed    int                                 `json:"failed" example:"1"`
	Total     int                                 `json:"total" example:"3"`
}

// BizPermissionBulkDeleteResponse is the envelope returned by /biz-bulk-delete-permission.
type BizPermissionBulkDeleteResponse struct {
	Status string                              `json:"status" example:"ok"`
	Msg    string                              `json:"msg" example:""`
	Data   BizPermissionBulkDeleteResponseData `json:"data"`
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

// BizPermissionGranteeListResponse represents the response for paginated grantee lists
type BizPermissionGranteeListResponse struct {
	Status string `json:"status" example:"ok"`
	Msg    string `json:"msg" example:""`
	Data   struct {
		Grantees []object.BizPermissionGrantee `json:"grantees"`
		Total    int64                         `json:"total" example:"0"`
	} `json:"data"`
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
	// Data2 maps role name to its custom properties and typed dataScope (additive).
	Data2 map[string]object.BizRolePropertiesView `json:"data2"`
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
		// DataScope is the merged (most-permissive-wins) data scope of the user.
		DataScope object.BizEffectiveDataScope `json:"dataScope"`
	} `json:"data"`
}

// BizUserDataScopeResponse represents the response for the biz user data scope API
type BizUserDataScopeResponse struct {
	Status string                       `json:"status" example:"ok"`
	Msg    string                       `json:"msg" example:""`
	Data   object.BizEffectiveDataScope `json:"data"`
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
// @Param   initDefaults query bool false "Casbin mode only: also create a default admin role and full-access permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-app-config [post]
func (c *ApiController) AddBizAppConfig() {
	var config object.BizAppConfig
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &config)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	affected, err := object.AddBizAppConfig(&config)
	if err == nil && affected && c.Ctx.Input.Query("initDefaults") == "true" {
		// Config row exists at this point; a seeding failure is reported but
		// does not roll the config back (admin can add role/permission by hand).
		if initErr := object.InitBizAppDefaults(&config); initErr != nil {
			c.ResponseError(fmt.Sprintf("app config created, but default role/permission failed: %s", initErr.Error()))
			return
		}
	}
	c.Data["json"] = c.wrapBizActionResponse(affected, err)
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

// ── BizRole CRUD (id-based) ──

// GetBizRoles
// @Summary Get business roles
// @Tags Business Permission API
// @Description Get all business roles visible in (organization, appName). If
//
//	appName is empty, returns org-scope roles only; otherwise returns the union
//	of app-scope and org-scope roles for the app.
//
// @Param   organization  query    string  true   "The organization"
// @Param   appName       query    string  false  "The app name (” for org-scope only)"
// @Param   p             query    string  false  "Page number (1-based); with pageSize enables server pagination, total is returned in data2"
// @Param   pageSize      query    string  false  "Page size; omit to return all roles"
// @Param   field         query    string  false  "Search field (name, displayName, description, scopeKind, appName)"
// @Param   value         query    string  false  "Search value (substring match)"
// @Param   sortField     query    string  false  "Sort field"
// @Param   sortOrder     query    string  false  "ascend or descend"
// @Param   scopeKind     query    string  false  "Filter: app or org"
// @Param   isEnabled     query    string  false  "Filter: true or false"
// @Success 200 {object} BizRoleListResponse "The Response object"
// @Router /biz-get-roles [get]
func (c *ApiController) GetBizRoles() {
	org := c.Ctx.Input.Query("organization")
	appName := c.Ctx.Input.Query("appName")

	if limit, q, paged := c.parseBizPageQuery(); paged {
		count, err := object.GetBizRoleCount(org, appName, q)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		roles, err := object.GetPaginationBizRoles(org, appName, paginator.Offset(), limit, q)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		c.ResponseOk(roles, paginator.Nums())
		return
	}

	roles, err := object.GetBizRoles(org, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(roles)
}

// GetBizRole
// @Summary Get a business role by id
// @Tags Business Permission API
// @Param   id     query    int64   true  "The numeric role id"
// @Success 200 {object} BizRoleResponse "The Response object"
// @Router /biz-get-role [get]
func (c *ApiController) GetBizRole() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}
	role, err := object.GetBizRoleById(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if role == nil {
		c.ResponseError(fmt.Sprintf("role not found: id=%d", id))
		return
	}
	c.ResponseOk(role)
}

// AddBizRole
// @Summary Add a business role
// @Tags Business Permission API
// @Param   body    body   object.BizRole  true  "The role (must include organization, scopeKind, name)"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-role [post]
func (c *ApiController) AddBizRole() {
	var role object.BizRole
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &role); err != nil {
		c.ResponseError(err.Error())
		return
	}

	// The authz_filter already gates access based on the subject's admin scope
	// over body.organization; the object-layer enforces scope/shape. No extra
	// controller-level authz logic is introduced here (see commit 49a6ee82 for
	// the cross-tenant-write pattern we mirror on update/delete).

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizRole(&role))
	c.ServeJSON()
}

// UpdateBizRole
// @Summary Update an existing business role
// @Tags Business Permission API
// @Param   id      query    int64           true  "The numeric role id"
// @Param   body    body     object.BizRole  true  "The role (organization and scopeKind must match the existing row)"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-update-role [post]
func (c *ApiController) UpdateBizRole() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}

	var role object.BizRole
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &role); err != nil {
		c.ResponseError(err.Error())
		return
	}

	existing, err := object.GetBizRoleById(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if existing == nil {
		c.ResponseError(fmt.Sprintf("role not found: id=%d", id))
		return
	}

	// Security: the authz_filter decided based on body.organization; if the
	// body disagrees with the existing row's organization, that decision does
	// not cover this update. Same pattern as the cross-tenant-write fix in
	// commit 49a6ee82. ScopeKind, AppName, and Name are also locked — they
	// form the role's stable identity; any rename must go through a new row.
	// AppName lock also prevents an app→org escape (via ScopeKind='app',
	// AppName='' mismatch).
	if role.Organization != existing.Organization ||
		role.ScopeKind != existing.ScopeKind ||
		role.AppName != existing.AppName ||
		role.Name != existing.Name {
		c.ResponseError("cannot change organization, scope, appName, or name via update")
		return
	}
	// CreatedTime is also immutable — preserve regardless of what the body
	// sends. Without this, AllCols().Update would overwrite the stored
	// timestamp with whatever the client posted (often empty).
	role.CreatedTime = existing.CreatedTime

	c.Data["json"] = c.wrapBizActionResponse(object.UpdateBizRole(id, &role))
	c.ServeJSON()
}

// GetBizRoleStats
// @Summary Get aggregated counters for a role (members / inheritance / permissions)
// @Tags Business Permission API
// @Description Returns derived counts used by the role detail page overview:
//
//	members (broken down by subject type), parent/child role counts, and the
//	number of permissions that reference this role. Each counter is a COUNT
//	query on an indexed column; the endpoint replaces what would otherwise be
//	four separate list calls just to read their lengths.
//
// @Param   id     query    int64   true  "The numeric role id"
// @Success 200 {object} BizRoleStatsResponse "Per-role aggregate counters"
// @Router /biz-get-role-stats [get]
func (c *ApiController) GetBizRoleStats() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}
	stats, err := object.GetBizRoleStats(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if stats == nil {
		c.ResponseError(fmt.Sprintf("role not found: id=%d", id))
		return
	}
	c.ResponseOk(stats)
}

// DeleteBizRole
// @Summary Delete a business role by id
// @Tags Business Permission API
// @Param   id     query    int64   true  "The numeric role id"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-delete-role [post]
func (c *ApiController) DeleteBizRole() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}

	existing, err := object.GetBizRoleById(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if existing == nil {
		c.ResponseError(fmt.Sprintf("role not found: id=%d", id))
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.DeleteBizRole(id))
	c.ServeJSON()
}

// BulkDeleteBizRoles
// @Summary Delete multiple business roles in one call
// @Tags Business Permission API
// @Description Deletes roles by id with topological retry — a role blocked by a child inheritance edge is retried once the child (if in the selection) is deleted. Response is per-id so the admin UI can show which rows survived and why.
// @Param   body    body     BizRoleBulkDeleteRequest  true  "{ids: [int64, ...]}"
// @Success 200 {object} BizRoleBulkDeleteResponse "Per-id outcomes + aggregate counts"
// @Router /biz-bulk-delete-role [post]
func (c *ApiController) BulkDeleteBizRoles() {
	var req BizRoleBulkDeleteRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if len(req.Ids) == 0 {
		c.ResponseError("ids must not be empty")
		return
	}

	raw, err := object.BulkDeleteBizRoles(req.Ids)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	items := make([]BizRoleBulkDeleteResultItem, 0, len(raw))
	succeeded, failed := 0, 0
	for _, r := range raw {
		item := BizRoleBulkDeleteResultItem{Id: r.Id, Ok: r.Ok}
		if r.Ok {
			succeeded++
		} else {
			failed++
			item.Error = c.translateBizError(r.Err)
		}
		items = append(items, item)
	}

	c.Data["json"] = &Response{
		Status: "ok",
		Data: BizRoleBulkDeleteResponseData{
			Results:   items,
			Succeeded: succeeded,
			Failed:    failed,
			Total:     len(items),
		},
	}
	c.ServeJSON()
}

// ── BizRole membership ──

// ListBizRoleMembers
// @Summary List direct members of a role (paginated)
// @Tags Business Permission API
// @Param   roleId    query   int64  true   "The role id"
// @Param   offset    query   int    false  "Pagination offset (default 0)"
// @Param   limit     query   int    false  "Pagination page size (default 50)"
// @Success 200 {object} BizRoleMemberListResponse "The Response object"
// @Router /biz-list-role-members [get]
func (c *ApiController) ListBizRoleMembers() {
	roleId, ok := c.parseIdQuery("roleId")
	if !ok {
		return
	}
	offset, _ := strconv.Atoi(c.Ctx.Input.Query("offset"))
	limit, _ := strconv.Atoi(c.Ctx.Input.Query("limit"))
	if limit <= 0 {
		limit = 50
	}

	members, total, err := object.ListBizRoleMembersPaged(roleId, offset, limit)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(map[string]interface{}{
		"members": members,
		"total":   total,
	})
}

// AddBizRoleMember
// @Summary Add a member (user/group) to a role
// @Tags Business Permission API
// @Param   body    body   object.BizRoleMember  true  "{roleId, subjectType, subjectId}"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-role-member [post]
func (c *ApiController) AddBizRoleMember() {
	var m object.BizRoleMember
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &m); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if m.RoleId == 0 {
		c.ResponseError("roleId is required")
		return
	}

	// Load the role so we surface "role not found" early (more helpful than
	// an FK error). Same pattern as the id-based update/delete guards above.
	role, err := object.GetBizRoleById(m.RoleId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if role == nil {
		c.ResponseError(fmt.Sprintf("role not found: id=%d", m.RoleId))
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizRoleMember(&m, c.GetSessionUsername()))
	c.ServeJSON()
}

// RemoveBizRoleMember
// @Summary Remove a member from a role
// @Tags Business Permission API
// @Param   body    body   object.BizRoleMember  true  "{roleId, subjectType, subjectId}"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-remove-role-member [post]
func (c *ApiController) RemoveBizRoleMember() {
	var m object.BizRoleMember
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &m); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if m.RoleId == 0 {
		c.ResponseError("roleId is required")
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.RemoveBizRoleMember(m.RoleId, m.SubjectType, m.SubjectId))
	c.ServeJSON()
}

// ListUserRoles
// @Summary List all roles a user belongs to within an organization
// @Tags Business Permission API
// @Param   organization  query  string  true  "The organization"
// @Param   userId        query  string  true  "The user id (typically org/username)"
// @Success 200 {object} BizRoleListResponse "The Response object"
// @Router /biz-list-user-roles [get]
func (c *ApiController) ListUserRoles() {
	org := c.Ctx.Input.Query("organization")
	userId := c.Ctx.Input.Query("userId")
	if org == "" || userId == "" {
		c.ResponseError("organization and userId are required")
		return
	}

	roles, err := object.ListUserRoles(org, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(roles)
}

// ── BizRole inheritance ──

// ListRoleParents
// @Summary List direct parent roles (one level up) of a role
// @Tags Business Permission API
// @Param   roleId  query  int64  true  "The child role id"
// @Success 200 {object} BizRoleListResponse "The Response object"
// @Router /biz-list-role-parents [get]
func (c *ApiController) ListRoleParents() {
	roleId, ok := c.parseIdQuery("roleId")
	if !ok {
		return
	}
	parents, err := object.ListParentRoles(roleId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(parents)
}

// ListRoleChildren
// @Summary List direct child roles (one level down) of a role
// @Tags Business Permission API
// @Param   roleId  query  int64  true  "The parent role id"
// @Success 200 {object} BizRoleListResponse "The Response object"
// @Router /biz-list-role-children [get]
func (c *ApiController) ListRoleChildren() {
	roleId, ok := c.parseIdQuery("roleId")
	if !ok {
		return
	}
	children, err := object.ListChildRoles(roleId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(children)
}

// roleInheritanceEdge is the body shape for add/remove-role-inheritance.
// Kept as a local type so swag can document the field names.
type roleInheritanceEdge struct {
	ParentRoleId int64 `json:"parentRoleId"`
	ChildRoleId  int64 `json:"childRoleId"`
}

// AddRoleInheritance
// @Summary Add a role inheritance edge (child inherits from parent)
// @Tags Business Permission API
// @Description Cycle, depth, and cross-scope rules are enforced at the object-layer.
// @Param   body    body   roleInheritanceEdge  true  "{parentRoleId, childRoleId}"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-role-inheritance [post]
func (c *ApiController) AddRoleInheritance() {
	var edge roleInheritanceEdge
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &edge); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if edge.ParentRoleId == 0 || edge.ChildRoleId == 0 {
		c.ResponseError("parentRoleId and childRoleId are required")
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizRoleInheritance(edge.ParentRoleId, edge.ChildRoleId))
	c.ServeJSON()
}

// RemoveRoleInheritance
// @Summary Remove a role inheritance edge
// @Tags Business Permission API
// @Param   body    body   roleInheritanceEdge  true  "{parentRoleId, childRoleId}"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-remove-role-inheritance [post]
func (c *ApiController) RemoveRoleInheritance() {
	var edge roleInheritanceEdge
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &edge); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if edge.ParentRoleId == 0 || edge.ChildRoleId == 0 {
		c.ResponseError("parentRoleId and childRoleId are required")
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.RemoveBizRoleInheritance(edge.ParentRoleId, edge.ChildRoleId))
	c.ServeJSON()
}

// ── BizPermission CRUD (id-based) ──

// GetBizPermissions
// @Summary Get business permissions in an app
// @Tags Business Permission API
// @Param   organization  query  string  true  "The organization (permission owner)"
// @Param   appName       query  string  true  "The app name"
// @Param   p             query  string  false  "Page number (1-based); with pageSize enables server pagination, total is returned in data2"
// @Param   pageSize      query  string  false  "Page size; omit to return all permissions"
// @Param   field         query  string  false  "Search field (name, displayName, description, effect, state)"
// @Param   value         query  string  false  "Search value (substring match)"
// @Param   sortField     query  string  false  "Sort field"
// @Param   sortOrder     query  string  false  "ascend or descend"
// @Param   effect        query  string  false  "Filter: Allow or Deny"
// @Param   state         query  string  false  "Filter: Approved, Pending or Rejected"
// @Param   isEnabled     query  string  false  "Filter: true or false"
// @Success 200 {object} BizPermissionListResponse "The Response object"
// @Router /biz-get-permissions [get]
func (c *ApiController) GetBizPermissions() {
	org := c.Ctx.Input.Query("organization")
	appName := c.Ctx.Input.Query("appName")

	if limit, q, paged := c.parseBizPageQuery(); paged {
		count, err := object.GetBizPermissionCount(org, appName, q)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		perms, err := object.GetPaginationBizPermissions(org, appName, paginator.Offset(), limit, q)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		c.ResponseOk(perms, paginator.Nums())
		return
	}

	perms, err := object.GetBizPermissions(org, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(perms)
}

// GetBizPermission
// @Summary Get a business permission by id
// @Tags Business Permission API
// @Param   id     query    int64   true  "The numeric permission id"
// @Success 200 {object} BizPermissionResponse "The Response object"
// @Router /biz-get-permission [get]
func (c *ApiController) GetBizPermission() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}
	perm, err := object.GetBizPermissionById(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if perm == nil {
		c.ResponseError(fmt.Sprintf("permission not found: id=%d", id))
		return
	}
	c.ResponseOk(perm)
}

// AddBizPermission
// @Summary Add a business permission
// @Tags Business Permission API
// @Param   body    body   object.BizPermission  true  "The permission (must include owner, appName, name)"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-permission [post]
func (c *ApiController) AddBizPermission() {
	var perm object.BizPermission
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &perm); err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizPermission(&perm))
	c.ServeJSON()
}

// UpdateBizPermission
// @Summary Update an existing business permission
// @Tags Business Permission API
// @Param   id      query   int64                 true  "The numeric permission id"
// @Param   body    body    object.BizPermission  true  "The permission (owner and appName must match the existing row)"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-update-permission [post]
func (c *ApiController) UpdateBizPermission() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}

	var perm object.BizPermission
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &perm); err != nil {
		c.ResponseError(err.Error())
		return
	}

	existing, err := object.GetBizPermissionById(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if existing == nil {
		c.ResponseError(fmt.Sprintf("permission not found: id=%d", id))
		return
	}

	// Identity fields (owner, appName, name) are the stable policy key used by
	// Casbin — renaming via PUT silently breaks historical grants. Reject the
	// update if any drifts from the stored row. CreatedTime is also preserved
	// so an empty body value cannot clobber the stored timestamp.
	if perm.Owner != existing.Owner ||
		perm.AppName != existing.AppName ||
		perm.Name != existing.Name {
		c.ResponseError("cannot change owner, appName, or name via update")
		return
	}
	perm.CreatedTime = existing.CreatedTime

	c.Data["json"] = c.wrapBizActionResponse(object.UpdateBizPermission(id, &perm))
	c.ServeJSON()
}

// GetBizPermissionStats
// @Summary Get aggregated counters for a permission (grantees / resources / actions)
// @Tags Business Permission API
// @Description Returns derived counts used by the permission detail page overview:
//
//	grantees broken down by subject type (user/group/role), plus the size of
//	the permission's resources and actions arrays.
//
// @Param   id     query    int64   true  "The numeric permission id"
// @Success 200 {object} BizPermissionStatsResponse "Per-permission aggregate counters"
// @Router /biz-get-permission-stats [get]
func (c *ApiController) GetBizPermissionStats() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}
	stats, err := object.GetBizPermissionStats(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if stats == nil {
		c.ResponseError(fmt.Sprintf("permission not found: id=%d", id))
		return
	}
	c.ResponseOk(stats)
}

// DeleteBizPermission
// @Summary Delete a business permission by id
// @Tags Business Permission API
// @Param   id     query    int64   true  "The numeric permission id"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-delete-permission [post]
func (c *ApiController) DeleteBizPermission() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}

	existing, err := object.GetBizPermissionById(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if existing == nil {
		c.ResponseError(fmt.Sprintf("permission not found: id=%d", id))
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.DeleteBizPermission(id))
	c.ServeJSON()
}

// BulkDeleteBizPermissions
// @Summary Delete multiple business permissions in one call
// @Tags Business Permission API
// @Description Deletes permissions by id. Validates all ids share the same (Owner, AppName) scope before deleting so an org admin cannot inject cross-scope ids. Per-id outcomes let the UI highlight partial failures.
// @Param   body    body     BizPermissionBulkDeleteRequest  true  "{ids: [int64, ...]}"
// @Success 200 {object} BizPermissionBulkDeleteResponse "Per-id outcomes + aggregate counts"
// @Router /biz-bulk-delete-permission [post]
func (c *ApiController) BulkDeleteBizPermissions() {
	var req BizPermissionBulkDeleteRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if len(req.Ids) == 0 {
		c.ResponseError("ids must not be empty")
		return
	}

	raw, err := object.BulkDeleteBizPermissions(req.Ids)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	items := make([]BizPermissionBulkDeleteResultItem, 0, len(raw))
	succeeded, failed := 0, 0
	for _, r := range raw {
		item := BizPermissionBulkDeleteResultItem{Id: r.Id, Ok: r.Ok}
		if r.Ok {
			succeeded++
		} else {
			failed++
			item.Error = c.translateBizError(r.Err)
		}
		items = append(items, item)
	}

	c.Data["json"] = &Response{
		Status: "ok",
		Data: BizPermissionBulkDeleteResponseData{
			Results:   items,
			Succeeded: succeeded,
			Failed:    failed,
			Total:     len(items),
		},
	}
	c.ServeJSON()
}

// ── BizAppResource catalog (permission resource directory) ──

// ListBizAppResources
// @Summary List resource catalog entries for a business app
// @Tags Business Permission API
// @Param   owner    query   string   true  "The organization owning the app"
// @Param   appName  query   string   true  "The app name"
// @Success 200 {object} BizAppResourceListResponse "The Response object"
// @Router /biz-list-app-resources [get]
func (c *ApiController) ListBizAppResources() {
	owner := c.Ctx.Input.Query("owner")
	appName := c.Ctx.Input.Query("appName")
	if owner == "" || appName == "" {
		c.ResponseError("owner and appName are required")
		return
	}
	resources, err := object.ListBizAppResources(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(resources)
}

// AddBizAppResource
// @Summary Add a resource catalog entry
// @Tags Business Permission API
// @Param   body    body   object.BizAppResource  true  "The resource (must include owner, appName, name, pattern)"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-app-resource [post]
func (c *ApiController) AddBizAppResource() {
	var r object.BizAppResource
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &r); err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.Data["json"] = c.wrapBizActionResponse(object.AddBizAppResource(&r))
	c.ServeJSON()
}

// UpdateBizAppResource
// @Summary Update a resource catalog entry
// @Tags Business Permission API
// @Param   id      query    int64                  true  "The numeric resource id"
// @Param   body    body     object.BizAppResource  true  "The updated resource (owner/appName/name must match)"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-update-app-resource [post]
func (c *ApiController) UpdateBizAppResource() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}
	var r object.BizAppResource
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &r); err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.Data["json"] = c.wrapBizActionResponse(object.UpdateBizAppResource(id, &r))
	c.ServeJSON()
}

// TestBizPermissionMatch
// @Summary Dry-run a permission against a concrete request tuple
// @Tags Business Permission API
// @Description Given a permission id and (method, url), returns whether the
//
//	permission would apply, with a row-by-row breakdown of which resource
//	patterns and actions matched. Mirrors Casbin's keyMatch / keyMatch2
//	semantics so the answer tracks enforce-time behavior.
//
// @Param   body    body   object.BizPermissionMatchRequest  true  "Test input"
// @Success 200 {object} BizPermissionMatchResponse "Match result + explanation"
// @Router /biz-test-permission-match [post]
func (c *ApiController) TestBizPermissionMatch() {
	var req object.BizPermissionMatchRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
		c.ResponseError(err.Error())
		return
	}
	res, err := object.TestBizPermissionMatch(&req)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(res)
}

// ParseBizResourceImport
// @Summary Parse an OpenAPI / template / paste into a resource import preview
// @Tags Business Permission API
// @Description Parse content without persisting. Returns per-row classification
//
//	(new / update / deprecated / error). Use the preview as the request body of
//	/biz-import-app-resources after the admin reviews and selects rows.
//
// @Param   body    body   object.BizResourceImportRequest  true  "Import source + content + options"
// @Success 200 {object} BizResourceImportPreviewResponse "Parsed preview"
// @Router /biz-parse-resource-import [post]
func (c *ApiController) ParseBizResourceImport() {
	var req object.BizResourceImportRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
		c.ResponseError(err.Error())
		return
	}
	preview, err := object.ParseBizResourceImport(&req)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(preview)
}

// ImportBizAppResources
// @Summary Apply a previewed resource import (selected rows)
// @Tags Business Permission API
// @Description Upsert the selected rows by natural key (owner, appName, name).
//
//	The server re-validates each row; errors are reported per-row so partial
//	success is the normal outcome.
//
// @Param   body    body   object.BizResourceImportApplyRequest  true  "Selected rows"
// @Success 200 {object} BizResourceImportApplyResponse "Per-row outcomes + aggregate counts"
// @Router /biz-import-app-resources [post]
func (c *ApiController) ImportBizAppResources() {
	var req object.BizResourceImportApplyRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
		c.ResponseError(err.Error())
		return
	}
	result, err := object.ImportBizAppResources(&req)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(result)
}

// DeleteBizAppResource
// @Summary Delete a resource catalog entry
// @Tags Business Permission API
// @Param   id     query    int64   true  "The numeric resource id"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-delete-app-resource [post]
func (c *ApiController) DeleteBizAppResource() {
	id, ok := c.parseIdQuery("id")
	if !ok {
		return
	}
	c.Data["json"] = c.wrapBizActionResponse(object.DeleteBizAppResource(id))
	c.ServeJSON()
}

// ── BizPermission grantees ──

// ListBizPermissionGrantees
// @Summary List grantees of a permission (paginated)
// @Tags Business Permission API
// @Param   permissionId   query  int64  true   "The permission id"
// @Param   offset         query  int    false  "Pagination offset (default 0)"
// @Param   limit          query  int    false  "Pagination page size (default 50)"
// @Success 200 {object} BizPermissionGranteeListResponse "The Response object"
// @Router /biz-list-permission-grantees [get]
func (c *ApiController) ListBizPermissionGrantees() {
	permId, ok := c.parseIdQuery("permissionId")
	if !ok {
		return
	}
	offset, _ := strconv.Atoi(c.Ctx.Input.Query("offset"))
	limit, _ := strconv.Atoi(c.Ctx.Input.Query("limit"))
	if limit <= 0 {
		limit = 50
	}

	grantees, total, err := object.ListBizPermissionGranteesPaged(permId, offset, limit)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(map[string]interface{}{
		"grantees": grantees,
		"total":    total,
	})
}

// AddBizPermissionGrantee
// @Summary Grant a permission to a subject (user/group/role)
// @Tags Business Permission API
// @Param   body    body   object.BizPermissionGrantee  true  "{permissionId, subjectType, subjectId}"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-add-permission-grantee [post]
func (c *ApiController) AddBizPermissionGrantee() {
	var g object.BizPermissionGrantee
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &g); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if g.PermissionId == 0 {
		c.ResponseError("permissionId is required")
		return
	}

	perm, err := object.GetBizPermissionById(g.PermissionId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if perm == nil {
		c.ResponseError(fmt.Sprintf("permission not found: id=%d", g.PermissionId))
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.AddBizPermissionGrantee(&g, c.GetSessionUsername()))
	c.ServeJSON()
}

// RemoveBizPermissionGrantee
// @Summary Revoke a permission grant from a subject
// @Tags Business Permission API
// @Param   body    body   object.BizPermissionGrantee  true  "{permissionId, subjectType, subjectId}"
// @Success 200 {object} ActionResponse "Action result"
// @Router /biz-remove-permission-grantee [post]
func (c *ApiController) RemoveBizPermissionGrantee() {
	var g object.BizPermissionGrantee
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &g); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if g.PermissionId == 0 {
		c.ResponseError("permissionId is required")
		return
	}

	c.Data["json"] = c.wrapBizActionResponse(object.RemoveBizPermissionGrantee(g.PermissionId, g.SubjectType, g.SubjectId))
	c.ServeJSON()
}

// ListPermissionsByRole
// @Summary List permissions granted to a role within an organization
// @Tags Business Permission API
// @Param   organization  query  string  true  "The organization"
// @Param   roleName      query  string  true  "The role name"
// @Success 200 {object} BizPermissionListResponse "The Response object"
// @Router /biz-list-permissions-by-role [get]
func (c *ApiController) ListPermissionsByRole() {
	org := c.Ctx.Input.Query("organization")
	roleName := c.Ctx.Input.Query("roleName")
	if org == "" || roleName == "" {
		c.ResponseError("organization and roleName are required")
		return
	}

	perms, err := object.ListPermissionsGrantedToRole(org, roleName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(perms)
}

// ListPermissionsByUser
// @Summary List permissions directly granted to a user within an organization
// @Tags Business Permission API
// @Description Returns only direct user grants. Effective permissions (via role
//
//	membership) must be composed on the caller side from biz-list-user-roles and
//	biz-list-permissions-by-role.
//
// @Param   organization  query  string  true  "The organization"
// @Param   userId        query  string  true  "The user id (typically org/username)"
// @Success 200 {object} BizPermissionListResponse "The Response object"
// @Router /biz-list-permissions-by-user [get]
func (c *ApiController) ListPermissionsByUser() {
	org := c.Ctx.Input.Query("organization")
	userId := c.Ctx.Input.Query("userId")
	if org == "" || userId == "" {
		c.ResponseError("organization and userId are required")
		return
	}

	perms, err := object.ListPermissionsGrantedToUser(org, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(perms)
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

// BizEnforceEx
// @Summary Enforce with explanation (for admin UI)
// @Tags Business Permission API
// @Description Same as BizEnforce but also returns the matched policy and the
// subject's transitive role chain, so the admin test page can explain the
// decision. Intended for interactive debugging, not SDK hot paths.
// @Param   appId   query    string           true   "The app id (owner/appName)"
// @Param   body    body     []interface{}    true   "The Casbin request array"
// @Success 200 {object} object.EnforceTraceResult "allowed + matched policy + role chain"
// @Router /biz-enforce-ex [post]
func (c *ApiController) BizEnforceEx() {
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

	result, err := object.BizEnforceEx(owner, appName, request, c.GetAcceptLanguage())
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

	config, cfgErr := object.GetBizAppConfig(appId)
	if cfgErr != nil {
		c.ResponseError(cfgErr.Error())
		return
	}
	if config != nil && config.ModelType == object.ModelTypeReBAC {
		// Use HTTP 400 here (not ResponseError's 200) — wrong-engine is a caller
		// programming error, not a runtime/config failure.
		writeNotSupportedInReBAC(c.Ctx.ResponseWriter, "/api/biz-list-objects")
		return
	}

	roles, err := object.BizGetUserRoles(owner, appName, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	roleProps, err := object.BizGetUserRoleProperties(owner, appName, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	// data stays the plain role-name list (backward compatible); data2 is additive.
	c.ResponseOk(roles, roleProps)
}

// BizGetUserDataScope
// @Summary Get the effective data scope of a user in business app
// @Tags Business Permission API
// @Description Merge the dataScope declared on all of the user's enabled roles. Rule: most permissive wins (self < dept < dept_and_children < org < all); custom values are unioned. Type "none" means no role declares a data scope.
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Param   userId    query    string  true  "The user id (org/username)"
// @Success 200 {object} BizUserDataScopeResponse "The effective data scope"
// @Router /biz-get-user-data-scope [get]
func (c *ApiController) BizGetUserDataScope() {
	appId := c.Ctx.Input.Query("appId")
	userId := c.Ctx.Input.Query("userId")

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	config, cfgErr := object.GetBizAppConfig(appId)
	if cfgErr != nil {
		c.ResponseError(cfgErr.Error())
		return
	}
	if config != nil && config.ModelType == object.ModelTypeReBAC {
		writeNotSupportedInReBAC(c.Ctx.ResponseWriter, "/api/biz-list-objects")
		return
	}

	scope, err := object.BizGetUserEffectiveDataScope(owner, appName, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(scope)
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

	config, cfgErr := object.GetBizAppConfig(appId)
	if cfgErr != nil {
		c.ResponseError(cfgErr.Error())
		return
	}
	if config != nil && config.ModelType == object.ModelTypeReBAC {
		// Use HTTP 400 here (not ResponseError's 200) — wrong-engine is a caller
		// programming error, not a runtime/config failure.
		writeNotSupportedInReBAC(c.Ctx.ResponseWriter, "/api/biz-list-objects")
		return
	}

	data, err := object.BizGetUserPermissionSummary(owner, appName, userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(data)
}

// ── Migrate from platform Permission ──

// BizMigrationReportResponse wraps the dry-run plan / migration result.
type BizMigrationReportResponse struct {
	Status string                    `json:"status" example:"ok"`
	Msg    string                    `json:"msg" example:""`
	Data   object.BizMigrationReport `json:"data"`
}

// BizMigrateFromPermission
// @Summary Migrate platform Roles/Permissions into a Casbin-mode biz app
// @Tags Business Permission API
// @Description Copies the platform Roles and Permissions of an organization into the
//
//	biz tables (biz_role, biz_role_member, biz_role_inheritance, biz_permission,
//	biz_permission_grantee) of the target app. dryRun=true only returns the plan
//	(counts, conflicts, unmappable fields). A real run is one DB transaction
//	followed by a single policy sync. Rows are matched by name; onConflict decides
//	whether existing rows are skipped or overwritten. Admin only; the source
//	organization must be the app's own organization unless the caller is a global admin.
//
// @Param   appId               query    string  true   "The target app id (owner/appName)"
// @Param   sourceOrganization  query    string  false  "Platform organization to read (defaults to the app owner)"
// @Param   dryRun              query    bool    false  "Only report what would change (default false)"
// @Param   onConflict          query    string  false  "skip (default) or overwrite"
// @Success 200 {object} BizMigrationReportResponse "The migration report"
// @Router /biz-migrate-from-permission [post]
func (c *ApiController) BizMigrateFromPermission() {
	if !c.IsAdmin() {
		c.ResponseError(c.T("auth:Unauthorized operation"))
		return
	}

	owner, appName, err := util.GetOwnerAndNameFromIdWithError(c.Ctx.Input.Query("appId"))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	sourceOrg := c.Ctx.Input.Query("sourceOrganization")
	if sourceOrg == "" {
		sourceOrg = owner
	}

	// Cross-tenant guard: only a global admin may touch an organization other
	// than their own, and a non-global admin must belong to the app's org.
	if !c.IsGlobalAdmin() {
		user := c.getCurrentUser()
		if user == nil || user.Owner != owner || sourceOrg != owner {
			c.ResponseError(c.T("auth:Unauthorized operation"))
			return
		}
	}

	dryRun := c.Ctx.Input.Query("dryRun") == "true"
	onConflict := c.Ctx.Input.Query("onConflict")

	report, err := object.MigrateFromPlatformPermission(owner, appName, sourceOrg, onConflict, dryRun, c.GetSessionUsername())
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(report)
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
