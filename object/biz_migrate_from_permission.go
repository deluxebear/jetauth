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

	"github.com/deluxebear/jetauth/util"
)

// BizMigrationCounts summarizes what happens to one entity kind.
type BizMigrationCounts struct {
	Total  int `json:"total" example:"10"` // migratable entities found in the source organization
	Create int `json:"create" example:"7"` // new rows
	Update int `json:"update" example:"1"` // existing rows overwritten (onConflict=overwrite)
	Skip   int `json:"skip" example:"2"`   // existing rows left untouched (onConflict=skip)
	Failed int `json:"failed" example:"0"` // invalid entities that cannot be migrated at all
}

// BizMigrationReport is the dry-run plan or the result of the real run.
type BizMigrationReport struct {
	AppId              string `json:"appId" example:"org/app"`
	SourceOrganization string `json:"sourceOrganization" example:"org"`
	OnConflict         string `json:"onConflict" example:"skip"`
	DryRun             bool   `json:"dryRun" example:"true"`

	Roles           BizMigrationCounts  `json:"roles"`
	Permissions     BizMigrationCounts  `json:"permissions"`
	MemberAdds      int                 `json:"memberAdds" example:"12"`     // biz_role_member rows to add
	GranteeAdds     int                 `json:"granteeAdds" example:"20"`    // biz_permission_grantee rows to add
	InheritanceAdds int                 `json:"inheritanceAdds" example:"3"` // biz_role_inheritance rows to add
	Issues          []BizMigrationIssue `json:"issues"`

	Applied     bool   `json:"applied" example:"false"` // data was written (never true for dryRun)
	Synced      bool   `json:"synced" example:"false"`  // policies were rebuilt after the write
	PolicyCount int    `json:"policyCount" example:"0"`
	SyncError   string `json:"syncError,omitempty"`
}

type bizMigrationAction int

const (
	bizMigrateCreate bizMigrationAction = iota
	bizMigrateUpdate
	bizMigrateSkip
)

type bizMigrationDecisions struct {
	report      *BizMigrationReport
	plan        *bizMigrationPlan
	roleAction  map[string]bizMigrationAction
	permAction  map[string]bizMigrationAction
	roleIds     map[string]int64 // app-scope role name -> id for already existing rows
	permIds     map[string]int64
	edges       []bizMigrationEdge // accepted edges to insert
	roleMembers map[string]map[string]bool
}

// MigrateFromPlatformPermission copies the platform Roles/Permissions of
// sourceOrg into the biz tables of the Casbin-mode app owner/appName.
//
// With dryRun it only reports. Otherwise all writes happen in one DB
// transaction (rolled back on any error) and a single SyncAppPolicies runs
// after commit, which appends one full_rebuild changelog entry. The operation
// is idempotent: rows are matched by name; onConflict=skip leaves existing rows
// untouched, onConflict=overwrite updates their scalar fields and adds missing
// members/grantees/edges (it never deletes anything).
func MigrateFromPlatformPermission(owner, appName, sourceOrg, onConflict string, dryRun bool, operator string) (*BizMigrationReport, error) {
	if onConflict == "" {
		onConflict = BizMigrateOnConflictSkip
	}
	if onConflict != BizMigrateOnConflictSkip && onConflict != BizMigrateOnConflictOverwrite {
		return nil, fmt.Errorf("onConflict must be %q or %q, got %q", BizMigrateOnConflictSkip, BizMigrateOnConflictOverwrite, onConflict)
	}
	if sourceOrg == "" {
		sourceOrg = owner
	}

	config, err := getBizAppConfigOrError(owner, appName)
	if err != nil {
		return nil, err
	}
	if config.ModelType == ModelTypeReBAC {
		return nil, fmt.Errorf("biz app %s is a ReBAC app; migration targets Casbin-mode apps only", util.GetId(owner, appName))
	}

	d, err := decideBizMigration(config, sourceOrg, onConflict)
	if err != nil {
		return nil, err
	}
	d.report.DryRun = dryRun
	if dryRun {
		return d.report, nil
	}

	if err := applyBizMigration(d, owner, appName, operator); err != nil {
		return nil, err
	}
	d.report.Applied = true

	rep := d.report
	if rep.Roles.Create+rep.Roles.Update+rep.Permissions.Create+rep.Permissions.Update+rep.MemberAdds+rep.GranteeAdds+rep.InheritanceAdds > 0 {
		stats, syncErr := SyncAppPolicies(owner, appName)
		if syncErr != nil {
			rep.SyncError = syncErr.Error()
		} else {
			rep.Synced = true
			rep.PolicyCount = stats.PolicyCount
		}
	}
	return rep, nil
}

// decideBizMigration reads source + target state and computes the full set of
// decisions and the report. It performs no writes.
func decideBizMigration(config *BizAppConfig, sourceOrg, onConflict string) (*bizMigrationDecisions, error) {
	owner, appName := config.Owner, config.AppName

	srcRoles, err := GetRoles(sourceOrg)
	if err != nil {
		return nil, err
	}
	srcPerms, err := GetPermissions(sourceOrg)
	if err != nil {
		return nil, err
	}

	visible := []*BizRole{}
	if err := ormer.Engine.Where("organization = ? AND (app_name = ? OR app_name = '')", owner, appName).Find(&visible); err != nil {
		return nil, err
	}
	existingNames := map[string]bool{}
	appRoles := map[string]*BizRole{}
	orgScopeNames := map[string]bool{}
	idToName := map[int64]string{}
	roleIds := make([]int64, 0, len(visible))
	for _, r := range visible {
		existingNames[r.Name] = true
		idToName[r.Id] = r.Name
		roleIds = append(roleIds, r.Id)
		if r.ScopeKind == BizRoleScopeOrg {
			orgScopeNames[r.Name] = true
		} else {
			appRoles[r.Name] = r
		}
	}

	existingPerms := []*BizPermission{}
	if err := ormer.Engine.Where("owner = ? AND app_name = ?", owner, appName).Find(&existingPerms); err != nil {
		return nil, err
	}
	permByName := map[string]*BizPermission{}
	for _, p := range existingPerms {
		permByName[p.Name] = p
	}

	plan := buildBizMigrationPlan(bizMigrationInput{
		Organization: owner, AppName: appName,
		Roles: srcRoles, Permissions: srcPerms,
		SupportsDeny:      modelTextSupportsDeny(config.ModelText),
		ExistingRoleNames: existingNames,
	})

	rep := &BizMigrationReport{
		AppId: util.GetId(owner, appName), SourceOrganization: sourceOrg, OnConflict: onConflict,
		Issues: plan.Issues,
	}
	d := &bizMigrationDecisions{
		report: rep, plan: plan,
		roleAction: map[string]bizMigrationAction{}, permAction: map[string]bizMigrationAction{},
		roleIds: map[string]int64{}, permIds: map[string]int64{},
		roleMembers: map[string]map[string]bool{},
	}

	decide := func(exists bool) bizMigrationAction {
		switch {
		case !exists:
			return bizMigrateCreate
		case onConflict == BizMigrateOnConflictOverwrite:
			return bizMigrateUpdate
		default:
			return bizMigrateSkip
		}
	}
	count := func(c *BizMigrationCounts, a bizMigrationAction) {
		c.Total++
		switch a {
		case bizMigrateCreate:
			c.Create++
		case bizMigrateUpdate:
			c.Update++
		default:
			c.Skip++
		}
	}

	// Existing members per existing app-scope role.
	for _, pr := range plan.Roles {
		existing := appRoles[pr.Name]
		a := decide(existing != nil)
		d.roleAction[pr.Name] = a
		count(&rep.Roles, a)
		if existing != nil {
			d.roleIds[pr.Name] = existing.Id
			rep.Issues = append(rep.Issues, conflictIssue("role", pr.Name, a))
			ms := []*BizRoleMember{}
			if err := ormer.Engine.Where("role_id = ?", existing.Id).Find(&ms); err != nil {
				return nil, err
			}
			set := map[string]bool{}
			for _, m := range ms {
				set[m.SubjectType+"\x00"+m.SubjectId] = true
			}
			d.roleMembers[pr.Name] = set
		} else if orgScopeNames[pr.Name] {
			rep.Issues = append(rep.Issues, BizMigrationIssue{
				Kind: BizMigrationConflict, Entity: "role", Name: pr.Name,
				Message: "an org-scope role with this name exists; the new app-scope role will be visible alongside it",
			})
		}
		if a != bizMigrateSkip {
			for _, m := range pr.Members {
				if !d.roleMembers[pr.Name][m.Type+"\x00"+m.Id] {
					rep.MemberAdds++
				}
			}
		}
	}

	for _, pp := range plan.Permissions {
		existing := permByName[pp.Perm.Name]
		a := decide(existing != nil)
		d.permAction[pp.Perm.Name] = a
		count(&rep.Permissions, a)
		have := map[string]bool{}
		if existing != nil {
			d.permIds[pp.Perm.Name] = existing.Id
			rep.Issues = append(rep.Issues, conflictIssue("permission", pp.Perm.Name, a))
			gs := []*BizPermissionGrantee{}
			if err := ormer.Engine.Where("permission_id = ?", existing.Id).Find(&gs); err != nil {
				return nil, err
			}
			for _, g := range gs {
				have[g.SubjectType+"\x00"+g.SubjectId] = true
			}
		}
		if a != bizMigrateSkip {
			for _, g := range pp.Grantees {
				if !have[g.Type+"\x00"+g.Id] {
					rep.GranteeAdds++
				}
			}
		}
	}
	// Invalid permissions were dropped by the planner; surface them in the count.
	for _, is := range plan.Issues {
		if is.Kind == BizMigrationInvalid && is.Entity == "permission" {
			rep.Permissions.Failed++
		}
	}

	// Inheritance edges: only where at least one endpoint is created/updated.
	existingEdges := []bizMigrationEdge{}
	if len(roleIds) > 0 {
		es := []*BizRoleInheritance{}
		if err := ormer.Engine.In("child_role_id", roleIds).Find(&es); err != nil {
			return nil, err
		}
		for _, e := range es {
			p, c := idToName[e.ParentRoleId], idToName[e.ChildRoleId]
			if p != "" && c != "" {
				existingEdges = append(existingEdges, bizMigrationEdge{Parent: p, Child: c})
			}
		}
	}
	candidates := []bizMigrationEdge{}
	for _, e := range plan.Edges {
		if d.roleAction[e.Parent] == bizMigrateSkip && d.roleAction[e.Child] == bizMigrateSkip {
			continue
		}
		candidates = append(candidates, e)
	}
	accepted, edgeIssues := acceptInheritanceEdges(existingEdges, candidates)
	d.edges = accepted
	rep.InheritanceAdds = len(accepted)
	rep.Issues = append(rep.Issues, edgeIssues...)
	return d, nil
}

func conflictIssue(entity, name string, a bizMigrationAction) BizMigrationIssue {
	msg := "already exists and will be left unchanged (onConflict=skip)"
	if a == bizMigrateUpdate {
		msg = "already exists and will be overwritten (onConflict=overwrite)"
	}
	return BizMigrationIssue{Kind: BizMigrationConflict, Entity: entity, Name: name, Message: msg}
}

// applyBizMigration writes the decisions in a single transaction.
func applyBizMigration(d *bizMigrationDecisions, owner, appName, operator string) error {
	s := ormer.Engine.NewSession()
	defer s.Close()
	if err := s.Begin(); err != nil {
		return err
	}
	fail := func(err error) error {
		_ = s.Rollback()
		return err
	}
	now := util.GetCurrentTime()
	addedBy := operator
	if addedBy == "" {
		addedBy = "migrate-from-permission"
	}

	roleIds := map[string]int64{}
	for k, v := range d.roleIds {
		roleIds[k] = v
	}

	for _, pr := range d.plan.Roles {
		switch d.roleAction[pr.Name] {
		case bizMigrateCreate:
			role := &BizRole{
				Organization: owner, AppName: appName, Name: pr.Name, ScopeKind: BizRoleScopeApp,
				DisplayName: pr.DisplayName, Description: pr.Description, IsEnabled: pr.IsEnabled,
				CreatedTime: now, UpdatedTime: now,
			}
			if err := validateBizRoleScope(role); err != nil {
				return fail(err)
			}
			if _, err := s.Insert(role); err != nil {
				return fail(err)
			}
			roleIds[pr.Name] = role.Id
		case bizMigrateUpdate:
			id := roleIds[pr.Name]
			if _, err := s.ID(id).Cols("display_name", "description", "is_enabled", "updated_time").
				Update(&BizRole{DisplayName: pr.DisplayName, Description: pr.Description, IsEnabled: pr.IsEnabled, UpdatedTime: now}); err != nil {
				return fail(err)
			}
		default:
			continue
		}
		for _, m := range pr.Members {
			has, err := s.Get(&BizRoleMember{RoleId: roleIds[pr.Name], SubjectType: m.Type, SubjectId: m.Id})
			if err != nil {
				return fail(err)
			}
			if has {
				continue
			}
			if _, err := s.Insert(&BizRoleMember{RoleId: roleIds[pr.Name], SubjectType: m.Type, SubjectId: m.Id, AddedTime: now, AddedBy: addedBy}); err != nil {
				return fail(err)
			}
		}
	}

	for _, pp := range d.plan.Permissions {
		perm := pp.Perm
		var permId int64
		switch d.permAction[perm.Name] {
		case bizMigrateCreate:
			if err := validateBizPermission(&perm); err != nil {
				return fail(err)
			}
			perm.CreatedTime, perm.UpdatedTime = now, now
			if _, err := s.Insert(&perm); err != nil {
				return fail(err)
			}
			permId = perm.Id
		case bizMigrateUpdate:
			if err := validateBizPermission(&perm); err != nil {
				return fail(err)
			}
			permId = d.permIds[perm.Name]
			perm.UpdatedTime = now
			if _, err := s.ID(permId).Cols("display_name", "description", "resources", "actions", "effect", "is_enabled",
				"submitter", "approver", "approve_time", "state", "updated_time").Update(&perm); err != nil {
				return fail(err)
			}
		default:
			continue
		}
		for _, g := range pp.Grantees {
			has, err := s.Get(&BizPermissionGrantee{PermissionId: permId, SubjectType: g.Type, SubjectId: g.Id})
			if err != nil {
				return fail(err)
			}
			if has {
				continue
			}
			if _, err := s.Insert(&BizPermissionGrantee{PermissionId: permId, SubjectType: g.Type, SubjectId: g.Id, AddedTime: now, AddedBy: addedBy}); err != nil {
				return fail(err)
			}
		}
	}

	for _, e := range d.edges {
		pid, cid := roleIds[e.Parent], roleIds[e.Child]
		if pid == 0 || cid == 0 {
			continue
		}
		has, err := s.Get(&BizRoleInheritance{ParentRoleId: pid, ChildRoleId: cid})
		if err != nil {
			return fail(err)
		}
		if has {
			continue
		}
		if _, err := s.Insert(&BizRoleInheritance{ParentRoleId: pid, ChildRoleId: cid, CreatedTime: now}); err != nil {
			return fail(err)
		}
	}
	return s.Commit()
}
