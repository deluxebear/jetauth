// Copyright 2021 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package controllers

import (
	"encoding/json"
	"errors"

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// PermissionListResponse represents the response for permission list APIs
type PermissionListResponse struct {
	Status string              `json:"status" example:"ok"`
	Msg    string              `json:"msg" example:""`
	Data   []object.Permission `json:"data"`
	Data2  int                 `json:"data2" example:"10"`
}

// PermissionResponse represents the response for single permission APIs
type PermissionResponse struct {
	Status string            `json:"status" example:"ok"`
	Msg    string            `json:"msg" example:""`
	Data   object.Permission `json:"data"`
}

// GetPermissions
// @Summary GetPermissions
// @Tags Permission API
// @Description get permissions; use field=state&value=Pending to list the approval queue
// @Param   owner     query    string  true        "The owner of permissions"
// @Success 200 {array} object.Permission "The Response object"
// @Router /get-permissions [get]
func (c *ApiController) GetPermissions() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		permissions, err := object.GetPermissions(owner)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(permissions)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetPermissionCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		permissions, err := object.GetPaginationPermissions(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(permissions, paginator.Nums())
	}
}

// GetPermissionsBySubmitter
// @Summary GetPermissionsBySubmitter
// @Tags Permission API
// @Description get permissions by submitter
// @Success 200 {array} object.Permission "The Response object"
// @Router /get-permissions-by-submitter [get]
func (c *ApiController) GetPermissionsBySubmitter() {
	user, ok := c.RequireSignedInUser()
	if !ok {
		return
	}

	permissions, err := object.GetPermissionsBySubmitter(user.Owner, user.Name)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(permissions, len(permissions))
}

// GetPermissionsByRole
// @Summary GetPermissionsByRole
// @Tags Permission API
// @Description get permissions by role
// @Param   id     query    string  true        "The id ( owner/name ) of the role"
// @Success 200 {array} object.Permission "The Response object"
// @Router /get-permissions-by-role [get]
func (c *ApiController) GetPermissionsByRole() {
	id := c.Ctx.Input.Query("id")
	permissions, err := object.GetPermissionsByRole(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(permissions, len(permissions))
}

// GetPermission
// @Summary GetPermission
// @Tags Permission API
// @Description get permission
// @Param   id     query    string  true        "The id ( owner/name ) of the permission"
// @Success 200 {object} object.Permission "The Response object"
// @Router /get-permission [get]
func (c *ApiController) GetPermission() {
	id := c.Ctx.Input.Query("id")

	permission, err := object.GetPermission(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(permission)
}

// UpdatePermission
// @Summary UpdatePermission
// @Tags Permission API
// @Description update permission
// @Param   id     query    string  true        "The id ( owner/name ) of the permission"
// @Param   body    body   object.Permission  true        "The details of the permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-permission [post]
func (c *ApiController) UpdatePermission() {
	id := c.Ctx.Input.Query("id")

	var permission object.Permission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &permission)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	user, ok := c.RequireSignedInUser()
	if !ok {
		return
	}

	owner, _ := c.enforceOwnerFromId(id, func(owner string) { permission.Owner = owner })

	affected, err := object.UpdatePermissionWithApproval(id, &permission, user.GetId(), c.isPermissionApprover(owner))
	if err != nil {
		var validationErr *object.PermissionValidationError
		if errors.As(err, &validationErr) {
			c.ResponseError(c.T("permission:" + validationErr.Msg))
			return
		}
	}

	c.Data["json"] = wrapActionResponse(affected, err)
	c.ServeJSON()
}

// AddPermission
// @Summary AddPermission
// @Tags Permission API
// @Description add permission
// @Param   body    body   object.Permission  true        "The details of the permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-permission [post]
func (c *ApiController) AddPermission() {
	var permission object.Permission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &permission)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	user, ok := c.RequireSignedInUser()
	if !ok {
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddPermissionWithApproval(&permission, user.GetId(), c.isPermissionApprover(permission.Owner)))
	c.ServeJSON()
}

// DeletePermission
// @Summary DeletePermission
// @Tags Permission API
// @Description delete permission
// @Param   body    body   object.Permission  true        "The details of the permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-permission [post]
func (c *ApiController) DeletePermission() {
	var permission object.Permission
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &permission)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeletePermission(&permission))
	c.ServeJSON()
}

// RejectPermissionRequest is the body of /reject-permission.
type RejectPermissionRequest struct {
	Reason string `json:"reason"`
}

// isPermissionApprover reports whether the current user may approve/reject permissions owned by
// the given organization: a global admin, or an admin of that organization.
func (c *ApiController) isPermissionApprover(owner string) bool {
	isGlobalAdmin, user := c.isGlobalAdmin()
	if isGlobalAdmin {
		return true
	}
	return user != nil && user.IsAdmin && user.Owner == owner
}

func (c *ApiController) changePermissionState(to, reason string) {
	id := c.Ctx.Input.Query("id")
	user, ok := c.RequireSignedInUser()
	if !ok {
		return
	}

	owner, _ := util.GetOwnerAndNameFromIdNoCheck(id)
	if !c.isPermissionApprover(owner) {
		c.ResponseError(c.T("general:this operation requires administrator to perform"))
		return
	}

	c.Data["json"] = wrapActionResponse(object.SetPermissionState(id, to, reason, user.GetId(), true))
	c.ServeJSON()
}

// ApprovePermission
// @Summary ApprovePermission
// @Tags Permission API
// @Description approve a pending permission (global admin or admin of the permission's organization only)
// @Param   id     query    string  true        "The id ( owner/name ) of the permission"
// @Success 200 {object} ActionResponse "Action result"
// @Router /approve-permission [post]
func (c *ApiController) ApprovePermission() {
	c.changePermissionState(object.PermissionStateApproved, "")
}

// RejectPermission
// @Summary RejectPermission
// @Tags Permission API
// @Description reject a pending permission with a reason (global admin or admin of the permission's organization only)
// @Param   id     query    string  true        "The id ( owner/name ) of the permission"
// @Param   body   body     RejectPermissionRequest  true  "The reject reason"
// @Success 200 {object} ActionResponse "Action result"
// @Router /reject-permission [post]
func (c *ApiController) RejectPermission() {
	var req RejectPermissionRequest
	if len(c.Ctx.Input.RequestBody) > 0 {
		if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
			c.ResponseError(err.Error())
			return
		}
	}

	c.changePermissionState(object.PermissionStateRejected, req.Reason)
}

// PermissionApprovalLogListResponse represents the response for the approval log API
type PermissionApprovalLogListResponse struct {
	Status string                          `json:"status" example:"ok"`
	Msg    string                          `json:"msg" example:""`
	Data   []*object.PermissionApprovalLog `json:"data"`
}

// GetPermissionApprovalLogs
// @Summary GetPermissionApprovalLogs
// @Tags Permission API
// @Description get the approval state-change history of a permission
// @Param   id     query    string  true        "The id ( owner/name ) of the permission"
// @Success 200 {object} PermissionApprovalLogListResponse "The Response object"
// @Router /get-permission-approval-logs [get]
func (c *ApiController) GetPermissionApprovalLogs() {
	id := c.Ctx.Input.Query("id")
	owner, name := util.GetOwnerAndNameFromIdNoCheck(id)

	logs, err := object.GetPermissionApprovalLogs(owner, name)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(logs)
}
