// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package controllers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// resolveCasbinBizApp parses ?appId=owner/appName, verifies the app exists and
// is a Casbin app. On failure it writes the response itself and returns ok=false.
// Cross-tenant access is enforced earlier by the authz filter, which maps
// ?appId= to the (owner, appName) target (routers/authz_filter.go).
func (c *ApiController) resolveCasbinBizApp() (owner, appName string, ok bool) {
	appId := c.Ctx.Input.Query("appId")
	owner, appName, err := util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return "", "", false
	}

	config, err := object.GetBizAppConfig(appId)
	if err != nil {
		c.ResponseError(err.Error())
		return "", "", false
	}
	if config == nil {
		c.ResponseError("biz app config not found: " + appId)
		return "", "", false
	}
	if config.ModelType == object.ModelTypeReBAC {
		writeNotSupportedInReBAC(c.Ctx.ResponseWriter, "/api/biz-check")
		return "", "", false
	}
	return owner, appName, true
}

// BizWatchPolicies
// @Summary Watch business policy changes (long poll)
// @Tags Business Permission API
// @Description Long-polls for policy changes of a Casbin business app. Without `version` (first connect) a full snapshot is returned immediately. With `version` equal to the current policy version the request blocks up to `timeout` seconds (max 60) and answers HTTP 304 if nothing changed. When the version moved, an incremental change list is returned, or a full snapshot if the history was purged, a manual full sync happened, or the client version is ahead of the server. The body is the raw object below (not wrapped in status/data).
// @Param   appId     query    string  true   "The app id (owner/appName)"
// @Param   version   query    int     false  "The policy version the client currently holds"
// @Param   timeout   query    int     false  "Max seconds to block (1-60, default 60)"
// @Success 200 {object} object.BizWatchFullResponse "type=full: complete snapshot (type=incremental returns object.BizWatchIncrementalResponse)"
// @Success 304 {string} string "No change within the timeout"
// @Router /biz-watch-policies [get]
func (c *ApiController) BizWatchPolicies() {
	owner, appName, ok := c.resolveCasbinBizApp()
	if !ok {
		return
	}

	var since int64
	versionStr := c.Ctx.Input.Query("version")
	hasSince := versionStr != ""
	if hasSince {
		v, err := strconv.ParseInt(versionStr, 10, 64)
		if err != nil || v < 0 {
			c.ResponseError("invalid version")
			return
		}
		since = v
	}

	timeout := object.BizWatchMaxTimeout
	if tStr := c.Ctx.Input.Query("timeout"); tStr != "" {
		secs, err := strconv.Atoi(tStr)
		if err != nil || secs < 1 {
			c.ResponseError("invalid timeout")
			return
		}
		if d := time.Duration(secs) * time.Second; d < timeout {
			timeout = d
		}
	}

	result, err := object.WatchBizPolicies(c.Ctx.Request.Context(), owner, appName, since, hasSince, timeout)
	if err != nil {
		if errors.Is(err, c.Ctx.Request.Context().Err()) {
			return // client went away
		}
		c.ResponseError(err.Error())
		return
	}

	switch {
	case result.Incremental != nil:
		c.Data["json"] = result.Incremental
		c.ServeJSON()
	case result.Full != nil:
		c.Data["json"] = result.Full
		c.ServeJSON()
	default:
		c.Ctx.ResponseWriter.WriteHeader(http.StatusNotModified)
	}
}

// BizGetPolicyVersion
// @Summary Get the current policy version of a business app
// @Tags Business Permission API
// @Description Lightweight version query; SDKs can compare it with their local version before deciding to pull.
// @Param   appId     query    string  true  "The app id (owner/appName)"
// @Success 200 {object} object.BizPolicyVersionResponse "The current policy version"
// @Router /biz-get-policy-version [get]
func (c *ApiController) BizGetPolicyVersion() {
	owner, appName, ok := c.resolveCasbinBizApp()
	if !ok {
		return
	}

	data, err := object.GetBizPolicyVersionForApp(owner, appName)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(data)
}
