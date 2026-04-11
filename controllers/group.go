// Copyright 2023 The Casdoor Authors. All Rights Reserved.
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

package controllers

import (
	"encoding/json"
	"fmt"

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/casdoor/object"
	"github.com/deluxebear/casdoor/util"
)

// GroupListResponse represents the response for group list APIs
type GroupListResponse struct {
	Status string         `json:"status" example:"ok"`
	Msg    string         `json:"msg" example:""`
	Data   []object.Group `json:"data"`
	Data2  int            `json:"data2" example:"10"`
}

// GroupResponse represents the response for single group APIs
type GroupResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   object.Group `json:"data"`
}

// GetGroups
// @Summary List all groups
// @Description Get groups for the specified owner. Supports pagination, sorting, filtering, and tree view.
// @Tags Group API
// @Produce json
// @Param   owner      query    string  true   "Organization name that owns the groups"
// @Param   pageSize   query    int     false  "Number of results per page"
// @Param   p          query    int     false  "Page number (1-based)"
// @Param   field      query    string  false  "Field name to filter by"
// @Param   value      query    string  false  "Value to filter by"
// @Param   sortField  query    string  false  "Field name to sort by"
// @Param   sortOrder  query    string  false  "Sort order: ascend or descend"
// @Param   withTree   query    string  false  "Set to 'true' to return tree structure"
// @Success 200 {object} GroupListResponse "Groups list with optional pagination count in data2"
// @Failure 500 {object} Response "Error message"
// @Router /get-groups [get]
func (c *ApiController) GetGroups() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")
	withTree := c.Ctx.Input.Query("withTree")

	if limit == "" || page == "" {
		groups, err := object.GetGroups(owner)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		err = object.ExtendGroupsWithUsers(groups)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		if withTree == "true" {
			c.ResponseOk(object.ConvertToTreeData(groups, owner))
			return
		}

		c.ResponseOk(groups)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetGroupCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		groups, err := object.GetPaginationGroups(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		groupsHaveChildrenMap, err := object.GetGroupsHaveChildrenMap(groups)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		for _, group := range groups {
			_, ok := groupsHaveChildrenMap[group.GetId()]
			if ok {
				group.HaveChildren = true
			}

			parent, ok := groupsHaveChildrenMap[fmt.Sprintf("%s/%s", group.Owner, group.ParentId)]
			if ok {
				group.ParentName = parent.DisplayName
			}
		}

		err = object.ExtendGroupsWithUsers(groups)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(groups, paginator.Nums())

	}
}

// GetGroup
// @Summary Get a group
// @Description Get the detail of a group by its id (owner/name)
// @Tags Group API
// @Produce json
// @Param   id   query   string  true  "The id of the group, format: owner/name"
// @Success 200 {object} GroupResponse "Group detail with user list"
// @Failure 500 {object} Response "Error message"
// @Router /get-group [get]
func (c *ApiController) GetGroup() {
	id := c.Ctx.Input.Query("id")

	group, err := object.GetGroup(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	err = object.ExtendGroupWithUsers(group)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(group)
}

// UpdateGroup
// @Summary Update a group
// @Description Update the group specified by id with the provided group object
// @Tags Group API
// @Accept json
// @Produce json
// @Param   id     query    string        true  "The id of the group, format: owner/name"
// @Param   body   body     object.Group  true  "The group object with updated fields"
// @Success 200 {object} ActionResponse "Action result"
// @Failure 500 {object} Response "Error message"
// @Router /update-group [post]
func (c *ApiController) UpdateGroup() {
	id := c.Ctx.Input.Query("id")

	var group object.Group
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &group)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { group.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdateGroup(id, &group))
	c.ServeJSON()
}

// AddGroup
// @Summary Add a group
// @Description Create a new group
// @Tags Group API
// @Accept json
// @Produce json
// @Param   body   body   object.Group  true  "The group object to create"
// @Success 200 {object} ActionResponse "Action result"
// @Failure 500 {object} Response "Error message"
// @Router /add-group [post]
func (c *ApiController) AddGroup() {
	var group object.Group
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &group)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddGroup(&group))
	c.ServeJSON()
}

// DeleteGroup
// @Summary Delete a group
// @Description Delete the specified group
// @Tags Group API
// @Accept json
// @Produce json
// @Param   body   body   object.Group  true  "The group object to delete (owner and name required)"
// @Success 200 {object} ActionResponse "Action result"
// @Failure 500 {object} Response "Error message"
// @Router /delete-group [post]
func (c *ApiController) DeleteGroup() {
	var group object.Group
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &group)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteGroup(&group))
	c.ServeJSON()
}
