// Copyright 2026 The JetAuth Authors. All Rights Reserved.
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

	"github.com/deluxebear/jetauth/util"
)

// bizAppAccessAllowed is the pure tenant decision behind parseBizAppId: a
// global admin (or app subject) may act on any app; any other caller must
// belong to the app's owning organization. Callers outside the org are
// rejected regardless of what the authorization filter decided, so a filter
// bug can never turn into a cross-tenant read or write.
func bizAppAccessAllowed(isGlobalAdmin bool, userOwner string, hasUser bool, appOwner string) bool {
	if isGlobalAdmin {
		return true
	}
	return hasUser && appOwner != "" && userOwner == appOwner
}

// requireBizAppOwnerAccess reports whether the session user may act on apps
// owned by the given organization (global admin, or a member/admin of it).
func (c *ApiController) requireBizAppOwnerAccess(appOwner string) bool {
	if c.IsGlobalAdmin() {
		return true
	}
	user := c.getCurrentUser()
	if user == nil {
		return false
	}
	return bizAppAccessAllowed(false, user.Owner, true, appOwner)
}

// parseBizAppId parses an "owner/appName" app id and verifies the session
// user may act on the owner organization. It is the single entry point every
// biz-*/ReBAC handler taking an appId must use (defense in depth behind
// routers/authz_filter.go). On a non-nil error the caller responds with
// c.ResponseError(err.Error()) and returns.
func (c *ApiController) parseBizAppId(appId string) (owner, appName string, err error) {
	owner, appName, err = util.GetOwnerAndNameFromIdWithError(appId)
	if err != nil {
		return "", "", err
	}
	if !c.requireBizAppOwnerAccess(owner) {
		return "", "", errors.New(c.T("auth:Unauthorized operation"))
	}
	return owner, appName, nil
}
