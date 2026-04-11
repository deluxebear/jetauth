// Copyright 2025 The Casdoor Authors. All Rights Reserved.
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
	"github.com/deluxebear/casdoor/object"
	"github.com/deluxebear/casdoor/util"
)

// FormListResponse represents the response for form list APIs
type FormListResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   []object.Form `json:"data"`
	Data2  int           `json:"data2" example:"10"`
}

// FormResponse represents the response for single form APIs
type FormResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   object.Form  `json:"data"`
}


// GetGlobalForms
// @Summary GetGlobalForms
// @Tags Form API
// @Description get global forms
// @Success 200 {array} object.Form "The Response object"
// @Router /get-global-forms [get]
func (c *ApiController) GetGlobalForms() {
	forms, err := object.GetGlobalForms()
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(object.GetMaskedForms(forms, true))
}

// GetForms
// @Summary GetForms
// @Tags Form API
// @Description get forms
// @Param owner query string true "The owner of form"
// @Success 200 {array} object.Form "The Response object"
// @Router /get-forms [get]
func (c *ApiController) GetForms() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		forms, err := object.GetForms(owner)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(object.GetMaskedForms(forms, true))
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetFormCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		forms, err := object.GetPaginationForms(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		c.ResponseOk(forms, paginator.Nums())
	}
}

// GetForm
// @Summary GetForm
// @Tags Form API
// @Description get form
// @Param id query string true "The id (owner/name) of form"
// @Success 200 {object} object.Form "The Response object"
// @Router /get-form [get]
func (c *ApiController) GetForm() {
	id := c.Ctx.Input.Query("id")

	form, err := object.GetForm(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(object.GetMaskedForm(form, true))
}

// UpdateForm
// @Summary UpdateForm
// @Tags Form API
// @Description update form
// @Param id query string true "The id (owner/name) of the form"
// @Param body body object.Form true "The details of the form"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-form [post]
func (c *ApiController) UpdateForm() {
	id := c.Ctx.Input.Query("id")

	var form object.Form
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &form)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { form.Owner = owner })

	success, err := object.UpdateForm(id, &form)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(success)
}

// AddForm
// @Summary AddForm
// @Tags Form API
// @Description add form
// @Param body body object.Form true "The details of the form"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-form [post]
func (c *ApiController) AddForm() {
	var form object.Form
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &form)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	success, err := object.AddForm(&form)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(success)
}

// DeleteForm
// @Summary DeleteForm
// @Tags Form API
// @Description delete form
// @Param body body object.Form true "The details of the form"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-form [post]
func (c *ApiController) DeleteForm() {
	var form object.Form
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &form)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	success, err := object.DeleteForm(&form)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(success)
}
