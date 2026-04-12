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

// CertListResponse represents the response for cert list APIs
type CertListResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   []object.Cert `json:"data"`
	Data2  int           `json:"data2" example:"10"`
}

// CertResponse represents the response for single cert APIs
type CertResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   object.Cert  `json:"data"`
}


// GetCerts
// @Summary GetCerts
// @Tags Cert API
// @Description get certs
// @Param   owner     query    string  true        "The owner of certs"
// @Success 200 {array} object.Cert "The Response object"
// @Router /get-certs [get]
func (c *ApiController) GetCerts() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		certs, err := object.GetMaskedCerts(object.GetCerts(owner))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(certs)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetCertCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		certs, err := object.GetMaskedCerts(object.GetPaginationCerts(owner, paginator.Offset(), limit, field, value, sortField, sortOrder))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(certs, paginator.Nums())
	}
}

// GetGlobalCerts
// @Summary GetGlobalCerts
// @Tags Cert API
// @Description get global certs
// @Success 200 {array} object.Cert "The Response object"
// @Router /get-global-certs [get]
func (c *ApiController) GetGlobalCerts() {
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		certs, err := object.GetMaskedCerts(object.GetGlobalCerts())
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(certs)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetGlobalCertsCount(field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		certs, err := object.GetMaskedCerts(object.GetPaginationGlobalCerts(paginator.Offset(), limit, field, value, sortField, sortOrder))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(certs, paginator.Nums())
	}
}

// GetCert
// @Summary GetCert
// @Tags Cert API
// @Description get cert
// @Param   id     query    string  true        "The id ( owner/name ) of the cert"
// @Success 200 {object} object.Cert "The Response object"
// @Router /get-cert [get]
func (c *ApiController) GetCert() {
	id := c.Ctx.Input.Query("id")
	cert, err := object.GetCert(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(object.GetMaskedCert(cert))
}

// UpdateCert
// @Summary UpdateCert
// @Tags Cert API
// @Description update cert
// @Param   id     query    string  true        "The id ( owner/name ) of the cert"
// @Param   body    body   object.Cert  true        "The details of the cert"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-cert [post]
func (c *ApiController) UpdateCert() {
	id := c.Ctx.Input.Query("id")

	var cert object.Cert
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &cert)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { cert.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdateCert(id, &cert))
	c.ServeJSON()
}

// AddCert
// @Summary AddCert
// @Tags Cert API
// @Description add cert
// @Param   body    body   object.Cert  true        "The details of the cert"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-cert [post]
func (c *ApiController) AddCert() {
	var cert object.Cert
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &cert)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddCert(&cert))
	c.ServeJSON()
}

// DeleteCert
// @Summary DeleteCert
// @Tags Cert API
// @Description delete cert
// @Param   body    body   object.Cert  true        "The details of the cert"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-cert [post]
func (c *ApiController) DeleteCert() {
	var cert object.Cert
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &cert)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteCert(&cert))
	c.ServeJSON()
}

// UpdateCertDomainExpire
// @Summary UpdateCertDomainExpire
// @Tags Cert API
// @Description update cert domain expire time
// @Param   id     query   string  true        "The ID of the cert"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-cert-domain-expire [post]
func (c *ApiController) UpdateCertDomainExpire() {
	if _, ok := c.RequireSignedIn(); !ok {
		return
	}

	id := c.Ctx.Input.Query("id")
	cert, err := object.GetCert(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	domainExpireTime, err := object.GetDomainExpireTime(cert.Name)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if domainExpireTime == "" {
		c.ResponseError("Failed to determine domain expiration time for domain " + cert.Name +
			". Please verify that the domain is valid, publicly resolvable, and has a retrievable expiration date, " +
			"or update the domain expiration time manually.")
		return
	}
	cert.DomainExpireTime = domainExpireTime

	c.Data["json"] = wrapActionResponse(object.UpdateCert(id, cert))
	c.ServeJSON()
}
