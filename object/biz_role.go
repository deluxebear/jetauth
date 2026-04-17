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

	"github.com/deluxebear/jetauth/util"
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
	UpdatedTime  string `xorm:"varchar(100)" json:"updatedTime"`

	// Derived stats populated by enrichBizRoles for list responses. Not stored.
	MemberCount     int64    `xorm:"-" json:"memberCount"`
	PermissionCount int64    `xorm:"-" json:"permissionCount"`
	ParentNames     []string `xorm:"-" json:"parentNames"`
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
	role.UpdatedTime = role.CreatedTime
	affected, err := ormer.Engine.Insert(role)
	return affected != 0, err
}

func UpdateBizRole(id int64, role *BizRole) (bool, error) {
	if err := validateBizRoleScope(role); err != nil {
		return false, err
	}
	role.Id = id
	role.UpdatedTime = util.GetCurrentTime()
	affected, err := ormer.Engine.ID(id).AllCols().Update(role)
	if err != nil {
		return false, err
	}
	if affected != 0 {
		SyncAfterRoleUpdated(role.Organization, role.AppName, id)
	}
	return affected != 0, nil
}

// bizErrTemplateInheritedBy matches the i18n key in i18n/locales/*/data.json.
// BulkDeleteBizRoles inspects this template via errors.As(*BizError{}) to
// distinguish "defer, child may still be in selection" from permanent errors.
const bizErrTemplateInheritedBy = `Cannot delete role "%s": it is inherited by role "%s"`

func DeleteBizRole(id int64) (bool, error) {
	role, err := getBizRoleById(id)
	if err != nil || role == nil {
		return false, err
	}

	// Protect against deletion with active children. Surface the first
	// child's name so the admin can trace the blocker without opening the
	// role's detail page.
	children, err := ListChildRoles(id)
	if err != nil {
		return false, err
	}
	if len(children) > 0 {
		return false, newBizError(bizErrTemplateInheritedBy, role.Name, children[0].Name)
	}

	// Snapshot the identity fields BEFORE we delete the row — post-delete
	// sync fan-out needs name + scope to locate apps that still reference
	// this role via biz_permission_grantee.
	snapOrg, snapApp, snapName, snapScope := role.Organization, role.AppName, role.Name, role.ScopeKind

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
		SyncAfterRoleDeleted(snapOrg, snapApp, snapName, snapScope)
	}
	return affected != 0, nil
}

// BulkDeleteResult reports the outcome of deleting a single role inside a
// bulk call. Ok=true means the row is gone; Ok=false means it couldn't be
// deleted and Err carries the reason. Err may be a *BizError (translatable
// by the controller layer) or a plain error (verbatim to client).
type BulkDeleteResult struct {
	Id  int64
	Ok  bool
	Err error
}

// BulkDeleteBizRoles deletes multiple roles, deferring ones whose only
// blocker is a child that is ALSO in the selection until that child is
// deleted. This lets an admin select a parent + all its children in one
// click without having to manually order the delete. Roles whose children
// are outside the selection fail with the "inherited by" BizError and the
// caller shows the blocker's name to the admin.
//
// Scope consistency is enforced internally: all ids must share the same
// (Organization, AppName). This guards a scoped admin from injecting
// cross-org/cross-app ids after the filter-layer check on ids[0]. A scope
// mismatch aborts the whole call with an error and NO rows are deleted.
//
// Semantics: best-effort per-id for the delete pass — a partial-success
// response is normal. Caller inspects each result; no overall error is
// returned when the error is nil.
func BulkDeleteBizRoles(ids []int64) ([]BulkDeleteResult, error) {
	results := make(map[int64]*BulkDeleteResult, len(ids))
	pending := make([]int64, 0, len(ids))
	for _, id := range ids {
		if _, dup := results[id]; dup {
			continue
		}
		results[id] = &BulkDeleteResult{Id: id}
		pending = append(pending, id)
	}

	// Pre-fetch all roles once to validate scope consistency. Roles that
	// don't exist pass through — the delete loop below will surface
	// "not found" as a per-id error.
	var anchorOrg, anchorApp string
	anchorSet := false
	for _, id := range pending {
		role, err := getBizRoleById(id)
		if err != nil {
			return nil, err
		}
		if role == nil {
			continue
		}
		if !anchorSet {
			anchorOrg, anchorApp = role.Organization, role.AppName
			anchorSet = true
			continue
		}
		if role.Organization != anchorOrg || role.AppName != anchorApp {
			return nil, fmt.Errorf("bulk delete spans multiple (org, app) scopes: %s/%s vs %s/%s",
				anchorOrg, anchorApp, role.Organization, role.AppName)
		}
	}

	// Worst-case depth is a linear chain of length len(ids); +1 guards the
	// off-by-one. Loop also stops early when a pass makes no progress.
	maxPasses := len(pending) + 1
	for pass := 0; pass < maxPasses && len(pending) > 0; pass++ {
		retry := make([]int64, 0, len(pending))
		for _, id := range pending {
			ok, err := DeleteBizRole(id)
			if err == nil && ok {
				results[id].Ok = true
				results[id].Err = nil
				continue
			}
			if isInheritedByOtherError(err) {
				// Defer — a child may be in pending and will unblock us
				// on a later pass.
				results[id].Err = err
				retry = append(retry, id)
				continue
			}
			// Non-retryable (not found, DB error, validation, etc.)
			results[id].Err = err
		}
		if len(retry) == len(pending) {
			break // no progress — blockers are outside the selection
		}
		pending = retry
	}

	// Preserve input order; deduped slice if caller passed duplicates.
	out := make([]BulkDeleteResult, 0, len(results))
	seen := make(map[int64]bool, len(results))
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, *results[id])
	}
	return out, nil
}

func isInheritedByOtherError(err error) bool {
	if err == nil {
		return false
	}
	bizErr, ok := err.(*BizError)
	if !ok {
		return false
	}
	return bizErr.Template == bizErrTemplateInheritedBy
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
	if err != nil {
		return nil, err
	}
	if err := enrichBizRoles(roles); err != nil {
		// Enrichment failures shouldn't break the list endpoint — log via
		// returned zero stats and continue.
		return roles, nil
	}
	return roles, nil
}

// enrichBizRoles fills MemberCount / PermissionCount / ParentNames on the given
// roles via three aggregate queries. Runs once per list call (not per row), so
// the cost stays constant regardless of role count.
func enrichBizRoles(roles []*BizRole) error {
	if len(roles) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(roles))
	names := make([]string, 0, len(roles))
	byId := make(map[int64]*BizRole, len(roles))
	byName := make(map[string]*BizRole, len(roles))
	for _, r := range roles {
		ids = append(ids, r.Id)
		names = append(names, r.Name)
		byId[r.Id] = r
		byName[r.Name] = r
	}

	// Member counts: one row per role_id with COUNT(*).
	type countRow struct {
		RoleId int64
		C      int64
	}
	memberRows := []countRow{}
	err := ormer.Engine.Table(&BizRoleMember{}).
		Select("role_id, COUNT(*) AS c").
		In("role_id", ids).
		GroupBy("role_id").
		Find(&memberRows)
	if err != nil {
		return err
	}
	for _, row := range memberRows {
		if r, ok := byId[row.RoleId]; ok {
			r.MemberCount = row.C
		}
	}

	// Permission counts: number of permissions granted to each role. Grantees
	// key role-grants by role NAME (not id), so group by subject_id scoped
	// to subject_type='role'.
	type permCountRow struct {
		SubjectId string
		C         int64
	}
	permRows := []permCountRow{}
	err = ormer.Engine.Table(&BizPermissionGrantee{}).
		Select("subject_id, COUNT(*) AS c").
		Where("subject_type = ?", BizPermGranteeRole).
		In("subject_id", names).
		GroupBy("subject_id").
		Find(&permRows)
	if err != nil {
		return err
	}
	for _, row := range permRows {
		if r, ok := byName[row.SubjectId]; ok {
			r.PermissionCount = row.C
		}
	}

	// Parent names: collect all inheritance edges where child is one of our
	// roles, then resolve parent_role_id → parent name in a second query.
	edges := []BizRoleInheritance{}
	err = ormer.Engine.In("child_role_id", ids).Find(&edges)
	if err != nil {
		return err
	}
	if len(edges) > 0 {
		parentIds := make([]int64, 0, len(edges))
		for _, e := range edges {
			parentIds = append(parentIds, e.ParentRoleId)
		}
		parents := []BizRole{}
		if err := ormer.Engine.Cols("id", "name").In("id", parentIds).Find(&parents); err != nil {
			return err
		}
		parentNameById := make(map[int64]string, len(parents))
		for _, p := range parents {
			parentNameById[p.Id] = p.Name
		}
		for _, e := range edges {
			child, ok := byId[e.ChildRoleId]
			if !ok {
				continue
			}
			if name, ok2 := parentNameById[e.ParentRoleId]; ok2 {
				child.ParentNames = append(child.ParentNames, name)
			}
		}
	}
	return nil
}
