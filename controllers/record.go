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
	"github.com/deluxebear/casdoor/object"
	"github.com/deluxebear/casdoor/util"
)

// RecordListResponse represents the response for record list APIs
type RecordListResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   []object.Record `json:"data"`
	Data2  int           `json:"data2" example:"10"`
}

// RecordResponse represents the response for single record APIs
type RecordResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   object.Record  `json:"data"`
}


// GetRecords
// @Summary GetRecords
// @Tags Record API
// @Description get all records
// @Param   pageSize     query    string  true        "The size of each page"
// @Param   p     query    string  true        "The number of the page"
// @Success 200 {object} object.Record "The Response object"
// @Router /get-records [get]
func (c *ApiController) GetRecords() {
	organization, ok := c.RequireAdmin()
	if !ok {
		return
	}

	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")
	organizationName := c.Ctx.Input.Query("organizationName")

	if limit == "" || page == "" {
		records, err := object.GetRecords()
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(records)
	} else {
		limit := util.ParseInt(limit)
		if c.IsGlobalAdmin() && organizationName != "" {
			organization = organizationName
		}
		filterRecord := &object.Record{Organization: organization}
		count, err := object.GetRecordCount(field, value, filterRecord)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		records, err := object.GetPaginationRecords(paginator.Offset(), limit, field, value, sortField, sortOrder, filterRecord)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(records, paginator.Nums())
	}
}

// GetRecordsByFilter
// @Tags Record API
// @Summary GetRecordsByFilter
// @Description get records by filter
// @Param   filter  body string     true  "filter Record message"
// @Success 200 {object} object.Record "The Response object"
// @Router /get-records-filter [post]
func (c *ApiController) GetRecordsByFilter() {
	_, ok := c.RequireAdmin()
	if !ok {
		return
	}

	body := string(c.Ctx.Input.RequestBody)

	record := &object.Record{}
	err := util.JsonToStruct(body, record)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	records, err := object.GetRecordsByField(record)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(records)
}

// AddRecord
// @Summary AddRecord
// @Tags Record API
// @Description add a record
// @Param   body    body   object.Record  true        "The details of the record"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-record [post]
func (c *ApiController) AddRecord() {
	var record object.Record
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &record)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddRecord(&record))
	c.ServeJSON()
}
