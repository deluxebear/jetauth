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

package routers

import (
	stdcontext "context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/controllers"
	"github.com/deluxebear/jetauth/object"

	"github.com/beego/beego/v2/server/web/context"
	"github.com/deluxebear/jetauth/authz"
	"github.com/deluxebear/jetauth/util"
)

type Object struct {
	Owner string `json:"owner"`
	Name  string `json:"name"`
}

type ObjectWithOrg struct {
	Object
	Organization string `json:"organization"`
}

func getUsername(ctx *context.Context) (username string) {
	username, ok := ctx.Input.Session("username").(string)
	if !ok || username == "" {
		username, _ = getUsernameByClientIdSecret(ctx)
	}

	session := ctx.Input.Session("SessionData")
	if session == nil {
		return
	}

	sessionData := &controllers.SessionData{}
	err := util.JsonToStruct(session.(string), sessionData)
	if err != nil {
		logs.Error("GetSessionData failed, error: %s", err)
		return ""
	}

	if sessionData.ExpireTime != 0 &&
		sessionData.ExpireTime < time.Now().Unix() {
		err = ctx.Input.CruSession.Set(stdcontext.Background(), "username", "")
		if err != nil {
			logs.Error("Failed to clear expired session, error: %s", err)
			return ""
		}
		err = ctx.Input.CruSession.Delete(stdcontext.Background(), "SessionData")
		if err != nil {
			logs.Error("Failed to clear expired session, error: %s", err)
		}
		return ""
	}

	return
}

func getSubject(ctx *context.Context) (string, string) {
	username := getUsername(ctx)
	if username == "" {
		return "anonymous", "anonymous"
	}

	// username == "built-in/admin"
	owner, name, err := util.GetOwnerAndNameFromIdWithError(username)
	if err != nil {
		panic(err)
	}
	return owner, name
}

func getObject(ctx *context.Context) (string, string, error) {
	method := ctx.Request.Method
	path := ctx.Request.URL.Path

	// Special handling for MCP requests
	if path == "/api/mcp" && method == http.MethodPost {
		return getMcpObject(ctx)
	}

	if strings.HasPrefix(path, "/api/server/") {
		return ctx.Input.Param(":owner"), ctx.Input.Param(":name"), nil
	}

	if method == http.MethodGet {
		// Biz-* GET endpoints use numeric int64 ids and/or custom query
		// params (roleId / permissionId / organization). Route through the
		// shared biz resolver so scoped admins can exercise read endpoints
		// with the same (owner, name) semantics as the write endpoints.
		if strings.HasPrefix(path, "/api/biz-") {
			return getBizAuthzTarget(ctx, path)
		}

		if ctx.Request.URL.Path == "/api/get-policies" {
			if ctx.Input.Query("id") == "/" {
				adapterId := ctx.Input.Query("adapterId")
				if adapterId != "" {
					return util.GetOwnerAndNameFromIdWithError(adapterId)
				}
			} else {
				// query == "?id=built-in/admin"
				id := ctx.Input.Query("id")
				if id != "" {
					return util.GetOwnerAndNameFromIdWithError(id)
				}
			}
		}

		if !(strings.HasPrefix(ctx.Request.URL.Path, "/api/get-") && strings.HasSuffix(ctx.Request.URL.Path, "s")) {
			// query == "?id=built-in/admin"
			id := ctx.Input.Query("id")
			if id != "" {
				owner, name, err := util.GetOwnerAndNameFromIdWithError(id)
				if err == nil {
					// Organization's Owner is "admin" — use org name
					// so org admins can read their own org.
					if ctx.Request.URL.Path == "/api/get-organization" {
						return name, name, nil
					}
					// Application/token/syncer/webhook: use Organization field
					if ctx.Request.URL.Path == "/api/get-application" ||
						ctx.Request.URL.Path == "/api/get-token" ||
						ctx.Request.URL.Path == "/api/get-syncer" ||
						ctx.Request.URL.Path == "/api/get-webhook" {
						if org, err := object.GetOrganizationFieldForAuthz(ctx.Request.URL.Path, owner, name); err == nil && org != "" {
							return org, name, nil
						}
					}
					return owner, name, nil
				}
			}
		}

		owner := ctx.Input.Query("owner")
		if owner != "" {
			return owner, "", nil
		}

		return "", "", nil
	} else {
		if path == "/api/add-policy" || path == "/api/remove-policy" || path == "/api/update-policy" || path == "/api/send-invitation" {
			id := ctx.Input.Query("id")
			if id != "" {
				return util.GetOwnerAndNameFromIdWithError(id)
			}
		}

		// Biz-* endpoints use numeric int64 ids and/or body-level id references
		// (roleId / permissionId / parentRoleId). They also split ownership
		// between BizRole.Organization and BizPermission.Owner. Resolve the
		// authz target explicitly so non-global admins can exercise these
		// endpoints.
		if strings.HasPrefix(path, "/api/biz-") {
			return getBizAuthzTarget(ctx, path)
		}

		// For non-GET requests, if the `id` query param is present it is the
		// authoritative identifier of the object being operated on.  Use it
		// instead of the request body so that an attacker cannot spoof the
		// object owner by injecting "owner":"admin" (or any other value) into
		// the request body while pointing the URL at a different organization's
		// resource.
		if id := ctx.Input.Query("id"); id != "" {
			owner, name, err := util.GetOwnerAndNameFromIdWithError(id)
			if err == nil {
				// Application/token/syncer/webhook have Owner fixed to
				// "admin" while the real org is in the Organization field.
				// Look up the actual Organization from DB so org admins
				// can manage their own resources without trusting the
				// request body.
				if strings.HasSuffix(path, "-application") || strings.HasSuffix(path, "-token") ||
					strings.HasSuffix(path, "-syncer") || strings.HasSuffix(path, "-webhook") {
					if org, err := object.GetOrganizationFieldForAuthz(path, owner, name); err == nil && org != "" {
						return org, name, nil
					}
				}
				// Organization's Owner is "admin" but org admins should be
				// able to manage their own org. Use the org name itself as
				// objOwner so subOwner == objOwner matches.
				if strings.HasSuffix(path, "-organization") {
					return name, name, nil
				}
				return owner, name, nil
			}
		}

		body := ctx.Input.RequestBody
		if len(body) == 0 {
			return ctx.Request.Form.Get("owner"), ctx.Request.Form.Get("name"), nil
		}

		var obj Object

		if strings.HasSuffix(path, "-application") || strings.HasSuffix(path, "-token") ||
			strings.HasSuffix(path, "-syncer") || strings.HasSuffix(path, "-webhook") {
			var objWithOrg ObjectWithOrg
			err := json.Unmarshal(body, &objWithOrg)
			if err != nil {
				return "", "", nil
			}
			return objWithOrg.Organization, objWithOrg.Name, nil
		}

		err := json.Unmarshal(body, &obj)
		if err != nil {
			// this is not error
			return "", "", nil
		}

		if strings.HasSuffix(path, "-organization") {
			return obj.Name, obj.Name, nil
		}

		if path == "/api/delete-resource" {
			tokens := strings.Split(obj.Name, "/")
			if len(tokens) >= 5 {
				obj.Name = tokens[4]
			}
		}

		return obj.Owner, obj.Name, nil
	}
}

// bizAuthzBody captures every body field that biz-* POST endpoints use to
// identify the target object. All fields are optional; unmarshal failures and
// zero values simply fall through to the next resolution strategy.
type bizAuthzBody struct {
	Organization string  `json:"organization"`
	Owner        string  `json:"owner"`
	Name         string  `json:"name"`
	RoleId       int64   `json:"roleId"`
	PermissionId int64   `json:"permissionId"`
	ParentRoleId int64   `json:"parentRoleId"`
	Ids          []int64 `json:"ids"` // bulk endpoints (e.g. biz-bulk-delete-role)
}

// getBizAuthzTarget resolves (objOwner, objName) for biz-* endpoints, both
// GET and POST. Precedence: numeric ?id= → query ?roleId=/?permissionId= →
// query ?organization=/?owner= → body.ids → body.roleId/parentRoleId →
// body.permissionId → body.organization → body.owner. Unrecognized shapes
// return ("", "", nil) so IsAllowed denies non-global admins safely.
func getBizAuthzTarget(ctx *context.Context, path string) (string, string, error) {
	// 1. Numeric ?id= for update/delete of BizRole or BizPermission.
	if idStr := ctx.Input.Query("id"); idStr != "" {
		if id, err := strconv.ParseInt(idStr, 10, 64); err == nil {
			// "-role" matches update/delete of roles but must NOT match
			// "-role-member" or "-role-inheritance" (those use body ids).
			if strings.Contains(path, "-role") &&
				!strings.Contains(path, "-role-member") &&
				!strings.Contains(path, "-role-inheritance") {
				if role, err := object.GetBizRoleById(id); err == nil && role != nil {
					return role.Organization, role.Name, nil
				}
				return "", "", nil
			}
			if strings.Contains(path, "-permission") &&
				!strings.Contains(path, "-permission-grantee") {
				if perm, err := object.GetBizPermissionById(id); err == nil && perm != nil {
					return perm.Owner, perm.Name, nil
				}
				return "", "", nil
			}
			if strings.Contains(path, "-app-resource") {
				if r, err := object.GetBizAppResourceById(id); err == nil && r != nil {
					return r.Owner, r.Name, nil
				}
				return "", "", nil
			}
			// Composite string id (existing biz-update-app-config pattern).
			return util.GetOwnerAndNameFromIdWithError(idStr)
		}
		// Non-numeric id: fall back to composite string lookup.
		if owner, name, err := util.GetOwnerAndNameFromIdWithError(idStr); err == nil {
			return owner, name, nil
		}
	}

	// 1b. Query params for list/get endpoints (GET has no body).
	//     biz-list-role-members / -role-parents / -role-children /
	//     -permissions-by-role → ?roleId=
	//     biz-list-permission-grantees → ?permissionId=
	//     biz-get-roles / -list-user-roles / -get-user-roles /
	//     -get-user-permissions → ?organization=
	//     biz-get-permissions / -get-app-config(s) → ?owner=
	if roleIdStr := ctx.Input.Query("roleId"); roleIdStr != "" {
		if id, err := strconv.ParseInt(roleIdStr, 10, 64); err == nil {
			if role, err := object.GetBizRoleById(id); err == nil && role != nil {
				return role.Organization, role.Name, nil
			}
		}
		return "", "", nil
	}
	if permIdStr := ctx.Input.Query("permissionId"); permIdStr != "" {
		if id, err := strconv.ParseInt(permIdStr, 10, 64); err == nil {
			if perm, err := object.GetBizPermissionById(id); err == nil && perm != nil {
				return perm.Owner, perm.Name, nil
			}
		}
		return "", "", nil
	}
	if org := ctx.Input.Query("organization"); org != "" {
		return org, "", nil
	}
	if owner := ctx.Input.Query("owner"); owner != "" {
		return owner, "", nil
	}
	// biz-{write,read,list}-authorization-model + biz-{check,write-tuples,...}
	// use ?appId=owner/appName (spec §7.1). Map it through the same composite
	// id parser as biz-update-app-config so the filter sees the target app.
	if appId := ctx.Input.Query("appId"); appId != "" {
		if owner, name, err := util.GetOwnerAndNameFromIdWithError(appId); err == nil {
			return owner, name, nil
		}
		return "", "", nil
	}

	body := ctx.Input.RequestBody
	if len(body) == 0 {
		return "", "", nil
	}

	var b bizAuthzBody
	if err := json.Unmarshal(body, &b); err != nil {
		return "", "", nil
	}

	// 2. Bulk body.ids — resolve from the first id's role/permission to
	// get a conservative authz check at the filter level. The controller
	// is still responsible for per-id scope validation so an org admin
	// can't inject ids from other orgs into the selection.
	if len(b.Ids) > 0 {
		if strings.Contains(path, "-role") &&
			!strings.Contains(path, "-role-member") &&
			!strings.Contains(path, "-role-inheritance") {
			if role, err := object.GetBizRoleById(b.Ids[0]); err == nil && role != nil {
				return role.Organization, role.Name, nil
			}
			return "", "", nil
		}
		if strings.Contains(path, "-permission") &&
			!strings.Contains(path, "-permission-grantee") {
			if perm, err := object.GetBizPermissionById(b.Ids[0]); err == nil && perm != nil {
				return perm.Owner, perm.Name, nil
			}
			return "", "", nil
		}
	}

	// 3. Body roleId / parentRoleId — member / inheritance operations.
	if b.RoleId != 0 {
		if role, err := object.GetBizRoleById(b.RoleId); err == nil && role != nil {
			return role.Organization, role.Name, nil
		}
		return "", "", nil
	}
	if b.ParentRoleId != 0 {
		if role, err := object.GetBizRoleById(b.ParentRoleId); err == nil && role != nil {
			return role.Organization, role.Name, nil
		}
		return "", "", nil
	}

	// 3. Body permissionId — grantee operations.
	if b.PermissionId != 0 {
		if perm, err := object.GetBizPermissionById(b.PermissionId); err == nil && perm != nil {
			return perm.Owner, perm.Name, nil
		}
		return "", "", nil
	}

	// 4. Body.organization (BizRole add).
	if b.Organization != "" {
		return b.Organization, b.Name, nil
	}

	// 5. Body.owner (BizPermission add / BizAppConfig add/delete).
	if b.Owner != "" {
		return b.Owner, b.Name, nil
	}

	return "", "", nil
}

func willLog(subOwner string, subName string, method string, urlPath string, objOwner string, objName string) bool {
	if subOwner == "anonymous" && subName == "anonymous" && method == "GET" && (urlPath == "/api/get-account" || urlPath == "/api/get-app-login") && objOwner == "" && objName == "" {
		return false
	}
	return true
}

func getUrlPath(ctx *context.Context) string {
	urlPath := ctx.Request.URL.Path

	if strings.HasPrefix(urlPath, "/cas") && (strings.HasSuffix(urlPath, "/serviceValidate") || strings.HasSuffix(urlPath, "/proxy") || strings.HasSuffix(urlPath, "/proxyValidate") || strings.HasSuffix(urlPath, "/validate") || strings.HasSuffix(urlPath, "/p3/serviceValidate") || strings.HasSuffix(urlPath, "/p3/proxyValidate") || strings.HasSuffix(urlPath, "/samlValidate")) {
		return "/cas"
	}

	if strings.HasPrefix(urlPath, "/scim") {
		return "/scim"
	}

	if strings.HasPrefix(urlPath, "/api/login/oauth") {
		return "/api/login/oauth"
	}

	if strings.HasPrefix(urlPath, "/api/webauthn") {
		return "/api/webauthn"
	}

	if strings.HasPrefix(urlPath, "/api/mfa/setup") {
		return "/api/mfa/setup"
	}

	if strings.HasPrefix(urlPath, "/api/saml/redirect") {
		return "/api/saml/redirect"
	}

	return urlPath
}

func getExtraInfo(ctx *context.Context, urlPath string) map[string]interface{} {
	var extra map[string]interface{}
	if urlPath == "/api/mcp" {
		var m map[string]interface{}
		if err := json.Unmarshal(ctx.Input.RequestBody, &m); err != nil {
			return nil
		}

		method, ok := m["method"].(string)
		if !ok {
			return nil
		}

		return map[string]interface{}{
			"detailPathUrl": method,
		}
	}
	return extra
}

func getImpersonateUser(ctx *context.Context, subOwner, subName, username string) (string, string, string) {
	impersonateUser, ok := ctx.Input.Session("impersonateUser").(string)
	impersonateUserCookie := ctx.GetCookie("impersonateUser")
	if ok && impersonateUser != "" && impersonateUserCookie != "" {
		user, err := object.GetUser(util.GetId(subOwner, subName))
		if err != nil {
			panic(err)
		}

		if user != nil {
			impUserOwner, impUserName, err := util.GetOwnerAndNameFromIdWithError(impersonateUser)
			if err != nil {
				panic(err)
			}

			if user.IsAdmin && impUserOwner == user.Owner {
				ctx.Input.SetData("impersonating", true)
				return impUserOwner, impUserName, impersonateUser
			}
		}
	}

	return subOwner, subName, username
}

func ApiFilter(ctx *context.Context) {
	subOwner, subName := getSubject(ctx)
	// stash current user info into request context for controllers
	username := ""
	if !(subOwner == "anonymous" && subName == "anonymous") {
		username = fmt.Sprintf("%s/%s", subOwner, subName)
		subOwner, subName, username = getImpersonateUser(ctx, subOwner, subName, username)
	}
	ctx.Input.SetData("currentUserId", username)

	method := ctx.Request.Method
	urlPath := getUrlPath(ctx)
	extraInfo := getExtraInfo(ctx, urlPath)

	objOwner, objName := "", ""
	if urlPath != "/api/get-app-login" && urlPath != "/api/get-resource" {
		var err error
		objOwner, objName, err = getObject(ctx)
		if err != nil {
			responseError(ctx, err.Error())
			return
		}
	}

	if strings.HasPrefix(urlPath, "/api/notify-payment") {
		urlPath = "/api/notify-payment"
	}

	isAllowed := authz.IsAllowed(subOwner, subName, method, urlPath, objOwner, objName, extraInfo)

	if method != "GET" && !strings.HasSuffix(urlPath, "-entry") {
		util.SafeGoroutine(func() {
			writePermissionLog(objOwner, subOwner, subName, method, urlPath, isAllowed)
		})
	}

	result := "deny"
	if isAllowed {
		result = "allow"
	}

	if willLog(subOwner, subName, method, urlPath, objOwner, objName) {
		logLine := fmt.Sprintf("subOwner = %s, subName = %s, method = %s, urlPath = %s, obj.Owner = %s, obj.Name = %s, result = %s",
			subOwner, subName, method, urlPath, objOwner, objName, result)
		extra := formatExtraInfo(extraInfo)
		if extra != "" {
			logLine += fmt.Sprintf(", extraInfo = %s", extra)
		}
		fmt.Println(logLine)
		util.LogInfo(ctx, logLine)
	}

	if !isAllowed {
		if urlPath == "/api/mcp" || strings.HasPrefix(urlPath, "/api/server/") {
			denyMcpRequest(ctx)
		} else {
			denyRequest(ctx)
		}
		record, err := object.NewRecord(ctx)
		if err != nil {
			return
		}

		record.Organization = subOwner
		record.User = subName // auth:Unauthorized operation
		record.Response = fmt.Sprintf("{status:\"error\", msg:\"%s\"}", T(ctx, "auth:Unauthorized operation"))

		util.SafeGoroutine(func() {
			object.AddRecord(record)
		})
	}
}

func writePermissionLog(objOwner, subOwner, subName, method, urlPath string, allowed bool) {
	providers, err := object.GetProvidersByCategory(objOwner, "Log")
	if err != nil {
		return
	}

	severity := "info"
	if !allowed {
		severity = "warning"
	}
	message := fmt.Sprintf("sub=%s/%s method=%s url=%s objOwner=%s allowed=%v", subOwner, subName, method, urlPath, objOwner, allowed)

	for _, provider := range providers {
		// System Log is a pull-based collector; it does not accept Write calls.
		if provider.Type == "System Log" {
			continue
		}
		if provider.State == "Disabled" {
			continue
		}
		logProvider, err := object.GetLogProviderFromProvider(provider)
		if err != nil {
			continue
		}
		_ = logProvider.Write(severity, message)
	}
}

func formatExtraInfo(extra map[string]interface{}) string {
	if extra == nil {
		return ""
	}
	b, err := json.Marshal(extra)
	if err != nil {
		return ""
	}
	return string(b)
}
