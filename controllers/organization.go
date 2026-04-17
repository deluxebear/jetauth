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

// OrganizationListResponse represents the response for organization list APIs
type OrganizationListResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   []object.Organization `json:"data"`
	Data2  int           `json:"data2" example:"10"`
}

// OrganizationResponse represents the response for single organization APIs
type OrganizationResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   object.Organization  `json:"data"`
}


// GetOrganizations ...
// @Summary GetOrganizations
// @Tags Organization API
// @Description get organizations
// @Param   owner     query    string  true       "   0"
// @Success 200 {array} object.Organization "The Response object"
// @Router /get-organizations [get]
func (c *ApiController) GetOrganizations() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")
	organizationName := c.Ctx.Input.Query("organizationName")

	isGlobalAdmin := c.IsGlobalAdmin()
	if limit == "" || page == "" {
		var organizations []*object.Organization
		var err error
		if isGlobalAdmin {
			organizations, err = object.GetMaskedOrganizations(object.GetOrganizations(owner))
		} else {
			organizations, err = object.GetMaskedOrganizations(object.GetOrganizations(owner, c.getCurrentUser().Owner))
		}

		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(organizations)
	} else {
		if !isGlobalAdmin {
			organizations, err := object.GetMaskedOrganizations(object.GetOrganizations(owner, c.getCurrentUser().Owner))
			if err != nil {
				c.ResponseError(err.Error())
				return
			}
			c.ResponseOk(organizations)
		} else {
			limit := util.ParseInt(limit)
			count, err := object.GetOrganizationCount(owner, organizationName, field, value)
			if err != nil {
				c.ResponseError(err.Error())
				return
			}

			paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
			organizations, err := object.GetMaskedOrganizations(object.GetPaginationOrganizations(owner, organizationName, paginator.Offset(), limit, field, value, sortField, sortOrder))
			if err != nil {
				c.ResponseError(err.Error())
				return
			}

			c.ResponseOk(organizations, paginator.Nums())
		}
	}
}

// GetOrganization ...
// @Summary GetOrganization
// @Tags Organization API
// @Description get organization
// @Param   id     query    string  true        "organization id"
// @Success 200 {object} object.Organization "The Response object"
// @Router /get-organization [get]
func (c *ApiController) GetOrganization() {
	id := c.Ctx.Input.Query("id")
	organization, err := object.GetMaskedOrganization(object.GetOrganization(id))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if organization != nil && organization.MfaRememberInHours == 0 {
		organization.MfaRememberInHours = 12
	}

	c.ResponseOk(organization)
}

// UpdateOrganization ...
// @Summary UpdateOrganization
// @Tags Organization API
// @Description update organization
// @Param   id     query    string  true        "The id ( owner/name ) of the organization"
// @Param   body    body   object.Organization  true        "The details of the organization"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-organization [post]
func (c *ApiController) UpdateOrganization() {
	id := c.Ctx.Input.Query("id")

	var organization object.Organization
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &organization)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { organization.Owner = owner })

	if err = object.CheckIpWhitelist(organization.IpWhitelist, c.GetAcceptLanguage()); err != nil {
		c.ResponseError(err.Error())
		return
	}

	isGlobalAdmin, _ := c.isGlobalAdmin()

	if organization.BalanceCurrency == "" {
		organization.BalanceCurrency = "USD"
	}

	c.Data["json"] = wrapActionResponse(object.UpdateOrganization(id, &organization, isGlobalAdmin))
	c.ServeJSON()
}

// AddOrganization ...
// @Summary AddOrganization
// @Tags Organization API
// @Description add organization
// @Param   body    body   object.Organization  true        "The details of the organization"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-organization [post]
func (c *ApiController) AddOrganization() {
	var organization object.Organization
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &organization)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	count, err := object.GetOrganizationCount("", "", "", "")
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if err = checkQuotaForOrganization(int(count)); err != nil {
		c.ResponseError(err.Error())
		return
	}

	if err = object.CheckIpWhitelist(organization.IpWhitelist, c.GetAcceptLanguage()); err != nil {
		c.ResponseError(err.Error())
		return
	}

	if organization.BalanceCurrency == "" {
		organization.BalanceCurrency = "USD"
	}

	c.Data["json"] = wrapActionResponse(object.AddOrganization(&organization))
	c.ServeJSON()
}

// DeleteOrganization ...
// @Summary DeleteOrganization
// @Tags Organization API
// @Description delete organization
// @Param   body    body   object.Organization  true        "The details of the organization"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-organization [post]
func (c *ApiController) DeleteOrganization() {
	var organization object.Organization
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &organization)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteOrganization(&organization))
	c.ServeJSON()
}

// GetDefaultApplication ...
// @Summary GetDefaultApplication
// @Tags Organization API
// @Description get default application
// @Param   id     query    string  true        "organization id"
// @Success 200 {object} OrganizationResponse "Organization detail"
// @Router /get-default-application [get]
func (c *ApiController) GetDefaultApplication() {
	userId := c.GetSessionUsername()
	id := c.Ctx.Input.Query("id")

	application, err := object.GetDefaultApplication(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	application = object.GetMaskedApplication(application, userId)
	c.ResponseOk(application)
}

// GetOrganizationNames ...
// @Summary GetOrganizationNames
// @Tags Organization API
// @Param   owner     query    string    true  "   0"
// @Description get all organization name and displayName
// @Success 200 {array} object.Organization "The Response object"
// @Router /get-organization-names [get]
func (c *ApiController) GetOrganizationNames() {
	owner := c.Ctx.Input.Query("owner")
	organizationNames, err := object.GetOrganizationsByFields(owner, []string{"name", "display_name"}...)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(organizationNames)
}
