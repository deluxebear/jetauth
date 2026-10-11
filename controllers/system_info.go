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
	"errors"

	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/util"
	"github.com/go-git/go-git/v5"
)

// GetSystemInfo
// @Summary GetSystemInfo
// @Tags System API
// @Description get system info like CPU and memory usage
// @Success 200 {object} util.SystemInfo "The Response object"
// @Router /get-system-info [get]
func (c *ApiController) GetSystemInfo() {
	_, ok := c.RequireAdmin()
	if !ok {
		return
	}

	systemInfo, err := util.GetSystemInfo()
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(systemInfo)
}

// VersionInfoResponse is the version info plus the configured database
// driver. DatabaseType is only filled for admins so the backing store is not
// disclosed to ordinary users.
type VersionInfoResponse struct {
	util.VersionInfo
	DatabaseType string `json:"databaseType,omitempty"`
}

// GetVersionInfo
// @Summary GetVersionInfo
// @Tags System API
// @Description get version info like JetAuth release version, commit ID and (for admins) the database driver
// @Success 200 {object} controllers.VersionInfoResponse "The Response object"
// @Router /get-version-info [get]
func (c *ApiController) GetVersionInfo() {
	versionInfo, err := util.GetVersionInfo()
	if err != nil && !errors.Is(err, git.ErrRepositoryNotExists) {
		c.ResponseError(err.Error())
		return
	}

	if versionInfo.Version == "" {
		versionInfo = util.GetBuiltInVersionInfo()
	}

	resp := VersionInfoResponse{VersionInfo: *versionInfo}
	if c.IsAdmin() {
		resp.DatabaseType = conf.GetConfigString("driverName")
	}
	c.ResponseOk(resp)
}

// Health
// @Summary Health
// @Tags System API
// @Description check if the system is live
// @Success 200 {object} controllers.ActionResponse "The Response object"
// @Router /health [get]
func (c *ApiController) Health() {
	c.ResponseOk()
}
