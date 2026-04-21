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

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// PricingListResponse represents the response for pricing list APIs
type PricingListResponse struct {
	Status string           `json:"status" example:"ok"`
	Msg    string           `json:"msg" example:""`
	Data   []object.Pricing `json:"data"`
	Data2  int              `json:"data2" example:"10"`
}

// PricingResponse represents the response for single pricing APIs
type PricingResponse struct {
	Status string         `json:"status" example:"ok"`
	Msg    string         `json:"msg" example:""`
	Data   object.Pricing `json:"data"`
}

// GetPricings
// @Summary GetPricings
// @Tags Pricing API
// @Description get pricings
// @Param   owner     query    string  true        "The owner of pricings"
// @Success 200 {array} object.Pricing "The Response object"
// @Router /get-pricings [get]
func (c *ApiController) GetPricings() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		pricings, err := object.GetPricings(owner)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(pricings)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetPricingCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		pricing, err := object.GetPaginatedPricings(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(pricing, paginator.Nums())
	}
}

// GetPricing
// @Summary GetPricing
// @Tags Pricing API
// @Description get pricing
// @Param   id     query    string  true        "The id ( owner/name ) of the pricing"
// @Success 200 {object} object.Pricing "The Response object"
// @Router /get-pricing [get]
func (c *ApiController) GetPricing() {
	id := c.Ctx.Input.Query("id")

	pricing, err := object.GetPricing(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(pricing)
}

// UpdatePricing
// @Summary UpdatePricing
// @Tags Pricing API
// @Description update pricing
// @Param   id     query    string  true        "The id ( owner/name ) of the pricing"
// @Param   body    body   object.Pricing  true        "The details of the pricing"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-pricing [post]
func (c *ApiController) UpdatePricing() {
	id := c.Ctx.Input.Query("id")

	var pricing object.Pricing
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &pricing)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { pricing.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdatePricing(id, &pricing))
	c.ServeJSON()
}

// AddPricing
// @Summary AddPricing
// @Tags Pricing API
// @Description add pricing
// @Param   body    body   object.Pricing  true        "The details of the pricing"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-pricing [post]
func (c *ApiController) AddPricing() {
	var pricing object.Pricing
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &pricing)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddPricing(&pricing))
	c.ServeJSON()
}

// DeletePricing
// @Summary DeletePricing
// @Tags Pricing API
// @Description delete pricing
// @Param   body    body   object.Pricing  true        "The details of the pricing"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-pricing [post]
func (c *ApiController) DeletePricing() {
	var pricing object.Pricing
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &pricing)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeletePricing(&pricing))
	c.ServeJSON()
}
