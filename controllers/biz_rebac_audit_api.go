// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package controllers

import (
	"strconv"

	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

type bizListTupleAuditResponse struct {
	Events []*object.BizReBACTupleAudit `json:"events"`
	Offset int                          `json:"offset"`
	Limit  int                          `json:"limit"`
}

// BizListTupleAudit
// @Summary BizListTupleAudit
// @Tags Business Permission API
// @Description List tuple write/delete audit events for a ReBAC app, most-recent-first.
// @Param appId query string true "owner/appName"
// @Param op query string false "filter: write | delete (omit for all)"
// @Param offset query integer false "pagination offset (default 0)"
// @Param limit query integer false "page size (default 100, max 1000)"
// @Success 200 {object} controllers.bizListTupleAuditResponse "Audit events with pagination cursors"
// @Router /biz-list-tuple-audit [get]
func (c *ApiController) BizListTupleAudit() {
	appId := c.Ctx.Input.Query("appId")
	if appId == "" {
		c.ResponseError("appId is required")
		return
	}
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	op := object.AuditFilter(c.Ctx.Input.Query("op"))
	// Reject unknown filter values explicitly so a typo doesn't silently
	// pass through as AuditFilterAll. The store layer already validates
	// but the failure mode there (return all rows) hides admin mistakes.
	if op != object.AuditFilterAll && op != object.AuditFilterWrite && op != object.AuditFilterDelete {
		c.ResponseError("op must be 'write', 'delete', or empty")
		return
	}
	offset, _ := strconv.Atoi(c.Ctx.Input.Query("offset"))
	limit, _ := strconv.Atoi(c.Ctx.Input.Query("limit"))
	events, err := object.ListTupleAuditForApp(owner, appName, op, offset, limit)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(bizListTupleAuditResponse{Events: events, Offset: offset, Limit: limit})
}
