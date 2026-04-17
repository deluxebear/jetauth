// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"fmt"

	"github.com/deluxebear/casdoor/util"
)

const (
	BizRoleScopeOrg = "org"
	BizRoleScopeApp = "app"
)

type BizRole struct {
	Id           int64  `xorm:"pk autoincr" json:"id"`
	Organization string `xorm:"varchar(100) notnull unique(ux_biz_role_app)" json:"organization"`
	AppName      string `xorm:"varchar(100) notnull default '' unique(ux_biz_role_app)" json:"appName"`
	Name         string `xorm:"varchar(100) notnull unique(ux_biz_role_app)" json:"name"`
	ScopeKind    string `xorm:"varchar(10) notnull default 'app'" json:"scopeKind"` // BizRoleScopeOrg | BizRoleScopeApp
	DisplayName  string `xorm:"varchar(200)" json:"displayName"`
	Description  string `xorm:"varchar(500)" json:"description"`
	Properties   string `xorm:"mediumtext" json:"properties"`
	IsEnabled    bool   `xorm:"notnull default true" json:"isEnabled"`
	CreatedTime  string `xorm:"varchar(100)" json:"createdTime"`
}

func (r *BizRole) IsOrgScope() bool {
	return r.ScopeKind == BizRoleScopeOrg
}

func (r *BizRole) GetCompositeKey() string {
	return util.GetSessionId(r.Organization, r.AppName, r.Name)
}

func validateBizRoleScope(role *BizRole) error {
	switch role.ScopeKind {
	case BizRoleScopeOrg:
		if role.AppName != "" {
			return fmt.Errorf("org-scope role must have empty app_name, got %q", role.AppName)
		}
	case BizRoleScopeApp:
		if role.AppName == "" {
			return fmt.Errorf("app-scope role must have non-empty app_name")
		}
	default:
		return fmt.Errorf("invalid scope_kind %q (expected 'org' or 'app')", role.ScopeKind)
	}
	if role.Organization == "" || role.Name == "" {
		return fmt.Errorf("organization and name are required")
	}
	return nil
}

func AddBizRole(role *BizRole) (bool, error) {
	if err := validateBizRoleScope(role); err != nil {
		return false, err
	}
	if role.CreatedTime == "" {
		role.CreatedTime = util.GetCurrentTime()
	}
	affected, err := ormer.Engine.Insert(role)
	return affected != 0, err
}

func UpdateBizRole(id int64, role *BizRole) (bool, error) {
	if err := validateBizRoleScope(role); err != nil {
		return false, err
	}
	role.Id = id
	affected, err := ormer.Engine.ID(id).AllCols().Update(role)
	if err != nil {
		return false, err
	}
	if affected != 0 {
		SyncAfterRoleUpdated(role.Organization, role.AppName, id)
	}
	return affected != 0, nil
}

func DeleteBizRole(id int64) (bool, error) {
	role, err := getBizRoleById(id)
	if err != nil || role == nil {
		return false, err
	}

	// Protect against deletion with active children
	hasChildren, err := HasChildrenOfRole(id)
	if err != nil {
		return false, err
	}
	if hasChildren {
		return false, fmt.Errorf("cannot delete role %s: it is inherited by other roles", role.Name)
	}

	// Cascade members + inheritance edges
	if _, err := ormer.Engine.Where("role_id = ?", id).Delete(&BizRoleMember{}); err != nil {
		return false, err
	}
	if _, err := ormer.Engine.Where("parent_role_id = ? OR child_role_id = ?", id, id).Delete(&BizRoleInheritance{}); err != nil {
		return false, err
	}
	affected, err := ormer.Engine.ID(id).Delete(&BizRole{})
	if err != nil {
		return false, err
	}
	if affected != 0 {
		SyncAfterRoleDeleted(role.Organization, role.AppName, id)
	}
	return affected != 0, nil
}

func getBizRoleById(id int64) (*BizRole, error) {
	r := BizRole{Id: id}
	existed, err := ormer.Engine.Get(&r)
	if err != nil || !existed {
		return nil, err
	}
	return &r, nil
}

// GetBizRoleById is the exported id-based lookup used by HTTP handlers.
// Returns (nil, nil) if not found so callers can distinguish "missing" from error.
func GetBizRoleById(id int64) (*BizRole, error) {
	return getBizRoleById(id)
}

// GetBizRoleByName looks up by (org, app_name, name). For app-level lookup with
// org fallback, use ResolveScopedRoles instead.
func GetBizRoleByName(org, appName, name string) (*BizRole, error) {
	r := BizRole{Organization: org, AppName: appName, Name: name}
	existed, err := ormer.Engine.Get(&r)
	if err != nil || !existed {
		return nil, err
	}
	return &r, nil
}

// ResolveScopedRoles returns all roles matching the given name visible from
// (org, appName): the app-local one (if any) plus the org-scope one (if any).
// Both contribute — union semantics, never one shadows the other.
func ResolveScopedRoles(org, appName, name string) ([]*BizRole, error) {
	roles := []*BizRole{}
	err := ormer.Engine.Where(
		"organization = ? AND name = ? AND (app_name = ? OR app_name = '')",
		org, name, appName,
	).Find(&roles)
	return roles, err
}

func GetBizRoles(org, appName string) ([]*BizRole, error) {
	roles := []*BizRole{}
	// appName == "" means caller wants ORG-scope roles only
	// appName != "" means app-scope roles + org-scope roles (union visible)
	var err error
	if appName == "" {
		err = ormer.Engine.Where("organization = ? AND app_name = ''", org).Find(&roles)
	} else {
		err = ormer.Engine.Where("organization = ? AND (app_name = ? OR app_name = '')", org, appName).Find(&roles)
	}
	return roles, err
}
