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
// limitations under the License.

package controllers

import (
	"encoding/json"
	"fmt"

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/casdoor/object"
	"github.com/deluxebear/casdoor/util"
	xormadapter "github.com/deluxebear/casdoor/adapters/xormadapter"
)

// EnforcerListResponse represents the response for enforcer list APIs
type EnforcerListResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   []object.Enforcer `json:"data"`
	Data2  int           `json:"data2" example:"10"`
}

// EnforcerResponse represents the response for single enforcer APIs
type EnforcerResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   object.Enforcer  `json:"data"`
}


// GetEnforcers
// @Summary GetEnforcers
// @Tags Enforcer API
// @Description get enforcers
// @Param   owner     query    string  true        "The owner of enforcers"
// @Success 200 {array} object.Enforcer
// @Router /get-enforcers [get]
func (c *ApiController) GetEnforcers() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		enforcers, err := object.GetEnforcers(owner)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(enforcers)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetEnforcerCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		enforcers, err := object.GetPaginationEnforcers(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(enforcers, paginator.Nums())
	}
}

// GetEnforcer
// @Summary GetEnforcer
// @Tags Enforcer API
// @Description get enforcer
// @Param   id     query    string  true        "The id ( owner/name )  of enforcer"
// @Success 200 {object} object.Enforcer
// @Router /get-enforcer [get]
func (c *ApiController) GetEnforcer() {
	id := c.Ctx.Input.Query("id")
	loadModelCfg := c.Ctx.Input.Query("loadModelCfg")

	enforcer, err := object.GetEnforcer(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if enforcer != nil {
		if loadModelCfg == "true" && enforcer.Model != "" {
			err = enforcer.LoadModelCfg()
			if err != nil {
				return
			}
		}
	}

	c.ResponseOk(enforcer)
}

// UpdateEnforcer
// @Summary UpdateEnforcer
// @Tags Enforcer API
// @Description update enforcer
// @Param   id     query    string  true        "The id ( owner/name )  of enforcer"
// @Param   enforcer     body    object  true        "The enforcer object"
// @Success 200 {object} object.Enforcer
// @Router /update-enforcer [post]
func (c *ApiController) UpdateEnforcer() {
	id := c.Ctx.Input.Query("id")

	enforcer := object.Enforcer{}
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &enforcer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { enforcer.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdateEnforcer(id, &enforcer))
	c.ServeJSON()
}

// AddEnforcer
// @Summary AddEnforcer
// @Tags Enforcer API
// @Description add enforcer
// @Param   enforcer     body    object  true        "The enforcer object"
// @Success 200 {object} object.Enforcer
// @Router /add-enforcer [post]
func (c *ApiController) AddEnforcer() {
	enforcer := object.Enforcer{}
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &enforcer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddEnforcer(&enforcer))
	c.ServeJSON()
}

// DeleteEnforcer
// @Summary DeleteEnforcer
// @Tags Enforcer API
// @Description delete enforcer
// @Param   body    body    object.Enforcer  true      "The enforcer object"
// @Success 200 {object} object.Enforcer
// @Router /delete-enforcer [post]
func (c *ApiController) DeleteEnforcer() {
	var enforcer object.Enforcer
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &enforcer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteEnforcer(&enforcer))
	c.ServeJSON()
}

// GetPolicies
// @Summary GetPolicies
// @Tags Enforcer API
// @Description get policies
// @Param   id     query    string  true        "The id ( owner/name )  of enforcer"
// @Param   adapterId     query    string  false        "The adapter id"
// @Success 200 {array} xormadapter.CasbinRule
// @Router /get-policies [get]
func (c *ApiController) GetPolicies() {
	id := c.Ctx.Input.Query("id")
	adapterId := c.Ctx.Input.Query("adapterId")

	if adapterId != "" {
		adapter, err := object.GetAdapter(adapterId)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		if adapter == nil {
			c.ResponseError(fmt.Sprintf(c.T("enforcer:the adapter: %s is not found"), adapterId))
			return
		}

		err = adapter.InitAdapter()
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk()
		return
	}

	policies, err := object.GetPolicies(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(policies)
}

// GetFilteredPolicies
// @Summary GetFilteredPolicies
// @Tags Enforcer API
// @Description get filtered policies with support for multiple filters via POST body
// @Param   id     query    string  true        "The id ( owner/name )  of enforcer"
// @Param   body   body    []object.Filter  true        "Array of filter objects for multiple filters"
// @Success 200 {array} xormadapter.CasbinRule
// @Router /get-filtered-policies [post]
func (c *ApiController) GetFilteredPolicies() {
	id := c.Ctx.Input.Query("id")

	var filters []object.Filter
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &filters)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	filteredPolicies, err := object.GetFilteredPoliciesMulti(id, filters)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(filteredPolicies)
}

// UpdatePolicy
// @Summary UpdatePolicy
// @Tags Enforcer API
// @Description update policy
// @Param   id     query    string  true        "The id ( owner/name )  of enforcer"
// @Param   body     body    []xormadapter.CasbinRule  true        "Array containing old and new policy"
// @Success 200 {object} Response
// @Router /update-policy [post]
func (c *ApiController) UpdatePolicy() {
	id := c.Ctx.Input.Query("id")

	var policies []xormadapter.CasbinRule
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &policies)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	affected, err := object.UpdatePolicy(id, policies[0].Ptype, util.CasbinToSlice(policies[0]), util.CasbinToSlice(policies[1]))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.Data["json"] = wrapActionResponse(affected)
	c.ServeJSON()
}

// AddPolicy
// @Summary AddPolicy
// @Tags Enforcer API
// @Description add policy
// @Param   id     query    string  true        "The id ( owner/name )  of enforcer"
// @Param   body     body    xormadapter.CasbinRule  true        "The policy to add"
// @Success 200 {object} Response
// @Router /add-policy [post]
func (c *ApiController) AddPolicy() {
	id := c.Ctx.Input.Query("id")

	var policy xormadapter.CasbinRule
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &policy)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	affected, err := object.AddPolicy(id, policy.Ptype, util.CasbinToSlice(policy))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.Data["json"] = wrapActionResponse(affected)
	c.ServeJSON()
}

// RemovePolicy
// @Summary RemovePolicy
// @Tags Enforcer API
// @Description remove policy
// @Param   id     query    string  true        "The id ( owner/name )  of enforcer"
// @Param   body     body    xormadapter.CasbinRule  true        "The policy to remove"
// @Success 200 {object} Response
// @Router /remove-policy [post]
func (c *ApiController) RemovePolicy() {
	id := c.Ctx.Input.Query("id")

	var policy xormadapter.CasbinRule
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &policy)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	affected, err := object.RemovePolicy(id, policy.Ptype, util.CasbinToSlice(policy))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.Data["json"] = wrapActionResponse(affected)
	c.ServeJSON()
}
