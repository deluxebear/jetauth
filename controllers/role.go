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

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// RoleListResponse represents the response for role list APIs
type RoleListResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   []object.Role `json:"data"`
	Data2  int           `json:"data2" example:"10"`
}

// RoleResponse represents the response for single role APIs
type RoleResponse struct {
	Status string      `json:"status" example:"ok"`
	Msg    string      `json:"msg" example:""`
	Data   object.Role `json:"data"`
}

// GetRoles
// @Summary GetRoles
// @Tags Role API
// @Description get roles
// @Param   owner     query    string  true        "The owner of roles"
// @Success 200 {array} object.Role "The Response object"
// @Router /get-roles [get]
func (c *ApiController) GetRoles() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		roles, err := object.GetRoles(owner)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(roles)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetRoleCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		roles, err := object.GetPaginationRoles(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(roles, paginator.Nums())
	}
}

// GetRole
// @Summary GetRole
// @Tags Role API
// @Description get role
// @Param   id     query    string  true        "The id ( owner/name ) of the role"
// @Success 200 {object} object.Role "The Response object"
// @Router /get-role [get]
func (c *ApiController) GetRole() {
	id := c.Ctx.Input.Query("id")

	role, err := object.GetRole(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(role)
}

// UpdateRole
// @Summary UpdateRole
// @Tags Role API
// @Description update role
// @Param   id     query    string  true        "The id ( owner/name ) of the role"
// @Param   body    body   object.Role  true        "The details of the role"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-role [post]
func (c *ApiController) UpdateRole() {
	id := c.Ctx.Input.Query("id")

	var role object.Role
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { role.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdateRole(id, &role))
	c.ServeJSON()
}

// AddRole
// @Summary AddRole
// @Tags Role API
// @Description add role
// @Param   body    body   object.Role  true        "The details of the role"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-role [post]
func (c *ApiController) AddRole() {
	var role object.Role
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddRole(&role))
	c.ServeJSON()
}

// DeleteRole
// @Summary DeleteRole
// @Tags Role API
// @Description delete role
// @Param   body    body   object.Role  true        "The details of the role"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-role [post]
func (c *ApiController) DeleteRole() {
	var role object.Role
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &role)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteRole(&role))
	c.ServeJSON()
}
