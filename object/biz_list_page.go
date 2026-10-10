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

package object

import (
	"fmt"

	"github.com/xorm-io/xorm"
)

// Whitelists of columns that may be used for search (field) and sort on the
// paginated biz role / permission lists. Derived (non-stored) columns such
// as memberCount are intentionally absent.
var (
	bizRoleListColumns = map[string]string{
		"name": "name", "displayName": "display_name", "description": "description",
		"createdTime": "created_time", "updatedTime": "updated_time",
		"scopeKind": "scope_kind", "appName": "app_name", "isEnabled": "is_enabled",
	}
	bizPermissionListColumns = map[string]string{
		"name": "name", "displayName": "display_name", "description": "description",
		"createdTime": "created_time", "updatedTime": "updated_time",
		"effect": "effect", "state": "state", "isEnabled": "is_enabled",
	}
)

// BizListQuery carries the optional search/sort parameters of a paged list.
type BizListQuery struct {
	Field     string
	Value     string
	SortField string
	SortOrder string // "ascend" | "descend"

	// Exact-match filters; keys not whitelisted for the list are ignored.
	ScopeKind string // roles only: "app" | "org"
	Effect    string // permissions only: "Allow" | "Deny"
	State     string // permissions only: "Approved" | "Pending" | "Rejected"
	IsEnabled string // "true" | "false" | "" (any)
}

// bizListOrderColumn resolves the ORDER BY column and direction. Unknown or
// missing sort fields fall back to created_time desc.
func bizListOrderColumn(allowed map[string]string, q BizListQuery) (string, bool) {
	col := allowed[q.SortField]
	if col == "" || q.SortOrder == "" {
		return "created_time", false
	}
	return col, q.SortOrder == "ascend"
}

// applyBizListQuery adds the LIKE filter (when field+value are set and the
// field is whitelisted) and, if withOrder, the ORDER BY clause with id as a
// stable tiebreaker.
func applyBizListQuery(session *xorm.Session, allowed map[string]string, q BizListQuery, withOrder bool) *xorm.Session {
	if _, ok := allowed["scopeKind"]; ok && (q.ScopeKind == BizRoleScopeApp || q.ScopeKind == BizRoleScopeOrg) {
		session = session.And("scope_kind = ?", q.ScopeKind)
	}
	if _, ok := allowed["effect"]; ok {
		if q.Effect == "Allow" || q.Effect == "Deny" {
			session = session.And("effect = ?", q.Effect)
		}
		switch q.State {
		case "Approved":
			// Legacy rows have an empty state and are treated as Approved.
			session = session.And("(state = ? OR state = '' OR state IS NULL)", "Approved")
		case "Pending", "Rejected":
			session = session.And("state = ?", q.State)
		}
	}
	switch q.IsEnabled {
	case "true":
		session = session.And("is_enabled = ?", true)
	case "false":
		session = session.And("is_enabled = ?", false)
	}
	if col := allowed[q.Field]; col != "" && q.Value != "" {
		session = session.And(fmt.Sprintf("%s like ?", col), "%"+q.Value+"%")
	}
	if withOrder {
		col, asc := bizListOrderColumn(allowed, q)
		if asc {
			session = session.Asc(col)
		} else {
			session = session.Desc(col)
		}
		session = session.Asc("id")
	}
	return session
}

func bizRoleScopeSession(org, appName string) *xorm.Session {
	s := ormer.Engine.Prepare()
	if appName == "" {
		return s.Where("organization = ? AND app_name = ''", org)
	}
	return s.Where("organization = ? AND (app_name = ? OR app_name = '')", org, appName)
}

// GetBizRoleCount counts roles visible in (org, appName) matching the query filter.
func GetBizRoleCount(org, appName string, q BizListQuery) (int64, error) {
	s := applyBizListQuery(bizRoleScopeSession(org, appName), bizRoleListColumns, q, false)
	return s.Count(&BizRole{})
}

// GetPaginationBizRoles returns one page of roles (same visibility rules as GetBizRoles).
func GetPaginationBizRoles(org, appName string, offset, limit int, q BizListQuery) ([]*BizRole, error) {
	roles := []*BizRole{}
	s := applyBizListQuery(bizRoleScopeSession(org, appName), bizRoleListColumns, q, true)
	if err := s.Limit(limit, offset).Find(&roles); err != nil {
		return nil, err
	}
	_ = enrichBizRoles(roles)
	return roles, nil
}

// GetBizPermissionCount counts permissions of (owner, appName) matching the query filter.
func GetBizPermissionCount(owner, appName string, q BizListQuery) (int64, error) {
	s := ormer.Engine.Prepare().Where("owner = ? AND app_name = ?", owner, appName)
	s = applyBizListQuery(s, bizPermissionListColumns, q, false)
	return s.Count(&BizPermission{})
}

// GetPaginationBizPermissions returns one page of permissions.
func GetPaginationBizPermissions(owner, appName string, offset, limit int, q BizListQuery) ([]*BizPermission, error) {
	perms := []*BizPermission{}
	s := ormer.Engine.Prepare().Where("owner = ? AND app_name = ?", owner, appName)
	s = applyBizListQuery(s, bizPermissionListColumns, q, true)
	if err := s.Limit(limit, offset).Find(&perms); err != nil {
		return nil, err
	}
	_ = enrichBizPermissions(perms)
	return perms, nil
}
