// Copyright 2026 The Casdoor Authors. All Rights Reserved.
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

// KeyListResponse represents the response for key list APIs
type KeyListResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   []object.Key `json:"data"`
	Data2  int          `json:"data2" example:"10"`
}

// KeyResponse represents the response for single key APIs
type KeyResponse struct {
	Status string     `json:"status" example:"ok"`
	Msg    string     `json:"msg" example:""`
	Data   object.Key `json:"data"`
}

// GetKeys
// @Summary GetKeys
// @Tags Key API
// @Description get keys
// @Param   owner     query    string  true        "The owner of keys"
// @Success 200 {array} object.Key "The Response object"
// @Router /get-keys [get]
func (c *ApiController) GetKeys() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		keys, err := object.GetKeys(owner)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		maskedKeys, err := object.GetMaskedKeys(keys, true, nil)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(maskedKeys)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetKeyCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		keys, err := object.GetPaginationKeys(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		maskedKeys, err := object.GetMaskedKeys(keys, true, nil)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(maskedKeys, paginator.Nums())
	}
}

// GetGlobalKeys
// @Summary GetGlobalKeys
// @Tags Key API
// @Description get global keys
// @Success 200 {array} object.Key "The Response object"
// @Router /get-global-keys [get]
func (c *ApiController) GetGlobalKeys() {
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		keys, err := object.GetGlobalKeys()
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		maskedKeys, err := object.GetMaskedKeys(keys, true, nil)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(maskedKeys)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetGlobalKeyCount(field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		keys, err := object.GetPaginationGlobalKeys(paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		maskedKeys, err := object.GetMaskedKeys(keys, true, nil)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(maskedKeys, paginator.Nums())
	}
}

// GetKey
// @Summary GetKey
// @Tags Key API
// @Description get key
// @Param   id     query    string  true        "The id ( owner/name ) of the key"
// @Success 200 {object} object.Key "The Response object"
// @Router /get-key [get]
func (c *ApiController) GetKey() {
	id := c.Ctx.Input.Query("id")

	key, err := object.GetKey(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(key)
}

// UpdateKey
// @Summary UpdateKey
// @Tags Key API
// @Description update key
// @Param   id     query    string  true        "The id ( owner/name ) of the key"
// @Param   body    body   object.Key  true        "The details of the key"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-key [post]
func (c *ApiController) UpdateKey() {
	id := c.Ctx.Input.Query("id")

	oldKey, err := object.GetKey(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if oldKey == nil {
		c.Data["json"] = wrapActionResponse(false)
		c.ServeJSON()
		return
	}

	var key object.Key
	err = json.Unmarshal(c.Ctx.Input.RequestBody, &key)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { key.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdateKey(id, &key))
	c.ServeJSON()
}

// AddKey
// @Summary AddKey
// @Tags Key API
// @Description add key
// @Param   body    body   object.Key  true        "The details of the key"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-key [post]
func (c *ApiController) AddKey() {
	var key object.Key
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &key)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddKey(&key))
	c.ServeJSON()
}

// DeleteKey
// @Summary DeleteKey
// @Tags Key API
// @Description delete key
// @Param   body    body   object.Key  true        "The details of the key"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-key [post]
func (c *ApiController) DeleteKey() {
	var key object.Key
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &key)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteKey(&key))
	c.ServeJSON()
}
