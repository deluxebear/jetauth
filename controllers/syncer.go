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
	"fmt"

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// SyncerListResponse represents the response for syncer list APIs
type SyncerListResponse struct {
	Status string          `json:"status" example:"ok"`
	Msg    string          `json:"msg" example:""`
	Data   []object.Syncer `json:"data"`
	Data2  int             `json:"data2" example:"10"`
}

// SyncerResponse represents the response for single syncer APIs
type SyncerResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   object.Syncer `json:"data"`
}

// GetSyncers
// @Summary GetSyncers
// @Tags Syncer API
// @Description get syncers
// @Param   owner     query    string  true        "The owner of syncers"
// @Success 200 {array} object.Syncer "The Response object"
// @Router /get-syncers [get]
func (c *ApiController) GetSyncers() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")
	organization := c.Ctx.Input.Query("organization")

	if limit == "" || page == "" {
		syncers, err := object.GetMaskedSyncers(object.GetOrganizationSyncers(owner, organization))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(syncers)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetSyncerCount(owner, organization, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		syncers, err := object.GetMaskedSyncers(object.GetPaginationSyncers(owner, organization, paginator.Offset(), limit, field, value, sortField, sortOrder))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(syncers, paginator.Nums())
	}
}

// GetSyncer
// @Summary GetSyncer
// @Tags Syncer API
// @Description get syncer
// @Param   id     query    string  true        "The id ( owner/name ) of the syncer"
// @Success 200 {object} object.Syncer "The Response object"
// @Router /get-syncer [get]
func (c *ApiController) GetSyncer() {
	id := c.Ctx.Input.Query("id")

	syncer, err := object.GetMaskedSyncer(object.GetSyncer(id))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(syncer)
}

// UpdateSyncer
// @Summary UpdateSyncer
// @Tags Syncer API
// @Description update syncer
// @Param   id     query    string  true        "The id ( owner/name ) of the syncer"
// @Param   body    body   object.Syncer  true        "The details of the syncer"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-syncer [post]
func (c *ApiController) UpdateSyncer() {
	id := c.Ctx.Input.Query("id")

	var syncer object.Syncer
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &syncer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { syncer.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdateSyncer(id, &syncer, c.IsGlobalAdmin(), c.GetAcceptLanguage()))
	c.ServeJSON()
}

// AddSyncer
// @Summary AddSyncer
// @Tags Syncer API
// @Description add syncer
// @Param   body    body   object.Syncer  true        "The details of the syncer"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-syncer [post]
func (c *ApiController) AddSyncer() {
	var syncer object.Syncer
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &syncer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddSyncer(&syncer))
	c.ServeJSON()
}

// DeleteSyncer
// @Summary DeleteSyncer
// @Tags Syncer API
// @Description delete syncer
// @Param   body    body   object.Syncer  true        "The details of the syncer"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-syncer [post]
func (c *ApiController) DeleteSyncer() {
	var syncer object.Syncer
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &syncer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteSyncer(&syncer))
	c.ServeJSON()
}

// RunSyncer
// @Summary RunSyncer
// @Tags Syncer API
// @Description run syncer
// @Param   body    body   object.Syncer  true        "The details of the syncer"
// @Success 200 {object} ActionResponse "Action result"
// @Router /run-syncer [get]
func (c *ApiController) RunSyncer() {
	id := c.Ctx.Input.Query("id")
	syncer, err := object.GetSyncer(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if syncer == nil {
		c.ResponseError(fmt.Sprintf(c.T("general:The syncer: %s does not exist"), id))
		return
	}

	err = object.RunSyncer(syncer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk()
}

func (c *ApiController) TestSyncerDb() {
	var syncer object.Syncer
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &syncer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	err = object.TestSyncer(syncer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk()
}
