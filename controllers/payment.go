// Copyright 2022 The Casdoor Authors. All Rights Reserved.
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

// PaymentListResponse represents the response for payment list APIs
type PaymentListResponse struct {
	Status string        `json:"status" example:"ok"`
	Msg    string        `json:"msg" example:""`
	Data   []object.Payment `json:"data"`
	Data2  int           `json:"data2" example:"10"`
}

// PaymentResponse represents the response for single payment APIs
type PaymentResponse struct {
	Status string       `json:"status" example:"ok"`
	Msg    string       `json:"msg" example:""`
	Data   object.Payment  `json:"data"`
}


// GetPayments
// @Summary GetPayments
// @Tags Payment API
// @Description get payments
// @Param   owner     query    string  true        "The owner of payments"
// @Success 200 {array} object.Payment "The Response object"
// @Router /get-payments [get]
func (c *ApiController) GetPayments() {
	owner := c.Ctx.Input.Query("owner")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	if limit == "" || page == "" {
		var payments []*object.Payment
		var err error

		if c.IsAdmin() {
			// If field is "user", filter by that user even for admins
			if field == "user" && value != "" {
				payments, err = object.GetUserPayments(owner, value)
			} else {
				payments, err = object.GetPayments(owner)
			}
		} else {
			user := c.GetSessionUsername()
			_, userName, userErr := util.GetOwnerAndNameFromIdWithError(user)
			if userErr != nil {
				c.ResponseError(userErr.Error())
				return
			}
			payments, err = object.GetUserPayments(owner, userName)
		}

		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(payments)
	} else {
		limit := util.ParseInt(limit)
		if !c.IsAdmin() {
			user := c.GetSessionUsername()
			_, userName, userErr := util.GetOwnerAndNameFromIdWithError(user)
			if userErr != nil {
				c.ResponseError(userErr.Error())
				return
			}
			field = "user"
			value = userName
		}
		count, err := object.GetPaymentCount(owner, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		payments, err := object.GetPaginationPayments(owner, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(payments, paginator.Nums())
	}
}

// GetUserPayments
// @Summary GetUserPayments
// @Tags Payment API
// @Description get payments for a user
// @Param   owner     query    string  true        "The owner of payments"
// @Param   organization    query   string  true   "The organization of the user"
// @Param   user    query   string  true           "The username of the user"
// @Success 200 {array} object.Payment "The Response object"
// @Router /get-user-payments [get]
func (c *ApiController) GetUserPayments() {
	owner := c.Ctx.Input.Query("owner")
	user := c.Ctx.Input.Query("user")

	payments, err := object.GetUserPayments(owner, user)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(payments)
}

// GetPayment
// @Summary GetPayment
// @Tags Payment API
// @Description get payment
// @Param   id     query    string  true        "The id ( owner/name ) of the payment"
// @Success 200 {object} object.Payment "The Response object"
// @Router /get-payment [get]
func (c *ApiController) GetPayment() {
	id := c.Ctx.Input.Query("id")

	payment, err := object.GetPayment(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(payment)
}

// UpdatePayment
// @Summary UpdatePayment
// @Tags Payment API
// @Description update payment
// @Param   id     query    string  true        "The id ( owner/name ) of the payment"
// @Param   body    body   object.Payment  true        "The details of the payment"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-payment [post]
func (c *ApiController) UpdatePayment() {
	id := c.Ctx.Input.Query("id")

	var payment object.Payment
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &payment)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { payment.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdatePayment(id, &payment))
	c.ServeJSON()
}

// AddPayment
// @Summary AddPayment
// @Tags Payment API
// @Description add payment
// @Param   body    body   object.Payment  true        "The details of the payment"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-payment [post]
func (c *ApiController) AddPayment() {
	var payment object.Payment
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &payment)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.AddPayment(&payment))
	c.ServeJSON()
}

// DeletePayment
// @Summary DeletePayment
// @Tags Payment API
// @Description delete payment
// @Param   body    body   object.Payment  true        "The details of the payment"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-payment [post]
func (c *ApiController) DeletePayment() {
	var payment object.Payment
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &payment)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeletePayment(&payment))
	c.ServeJSON()
}

// NotifyPayment
// @Summary NotifyPayment
// @Tags Payment API
// @Description notify payment
// @Param   body    body   object.Payment  true        "The details of the payment"
// @Success 200 {object} ActionResponse "Action result"
// @Router /notify-payment [post]
func (c *ApiController) NotifyPayment() {
	owner := c.Ctx.Input.Param(":owner")
	paymentName := c.Ctx.Input.Param(":payment")

	body := c.Ctx.Input.RequestBody

	payment, err := object.NotifyPayment(body, owner, paymentName, c.GetAcceptLanguage())
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(payment)
}

// InvoicePayment
// @Summary InvoicePayment
// @Tags Payment API
// @Description invoice payment
// @Param   id     query    string  true        "The id ( owner/name ) of the payment"
// @Success 200 {object} ActionResponse "Action result"
// @Router /invoice-payment [post]
func (c *ApiController) InvoicePayment() {
	id := c.Ctx.Input.Query("id")

	payment, err := object.GetPayment(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	invoiceUrl, err := object.InvoicePayment(payment)
	if err != nil {
		c.ResponseError(err.Error())
	}
	c.ResponseOk(invoiceUrl)
}
