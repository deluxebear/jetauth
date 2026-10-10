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
	"sort"
	"strings"
)

// This file holds the PURE half of the platform-Permission -> biz-table
// migration: given platform Role / Permission rows it computes what would be
// created, which fields cannot be mapped, and which inheritance edges are safe.
// It never touches the database; the DB half lives in biz_migrate_from_permission.go.

// Conflict policies for already-existing biz rows (matched by name).
const (
	BizMigrateOnConflictSkip      = "skip"
	BizMigrateOnConflictOverwrite = "overwrite"
)

// Issue kinds reported to the admin.
const (
	// BizMigrationUnmappable: a platform field/reference has no biz equivalent
	// and is dropped; the owning entity is still migrated.
	BizMigrationUnmappable = "unmappable"
	// BizMigrationInvalid: the whole entity cannot be migrated and is skipped.
	BizMigrationInvalid = "invalid"
	// BizMigrationConflict: a biz row with the same name already exists.
	BizMigrationConflict = "conflict"
)

// BizMigrationIssue is one line of the migration report.
type BizMigrationIssue struct {
	Kind    string `json:"kind" example:"unmappable"`
	Entity  string `json:"entity" example:"permission"` // role | permission | inheritance
	Name    string `json:"name" example:"perm-1"`
	Field   string `json:"field,omitempty" example:"domains"`
	Message string `json:"message" example:"domains are not supported by biz permissions and were ignored"`
}

type bizMigrationSubject struct {
	Type string // user | group | role
	Id   string
}

type plannedBizRole struct {
	Name        string
	DisplayName string
	Description string
	IsEnabled   bool
	Members     []bizMigrationSubject // user | group
}

type plannedBizPermission struct {
	Perm     BizPermission
	Grantees []bizMigrationSubject // user | group | role
}

// bizMigrationEdge is a role-inheritance edge by role name: Child inherits Parent.
type bizMigrationEdge struct {
	Parent string
	Child  string
}

type bizMigrationPlan struct {
	Roles       []*plannedBizRole
	Permissions []*plannedBizPermission
	Edges       []bizMigrationEdge
	Issues      []BizMigrationIssue
}

type bizMigrationInput struct {
	Organization string
	AppName      string
	Roles        []*Role
	Permissions  []*Permission
	SupportsDeny bool
	// ExistingRoleNames are biz roles already visible in the target app (app
	// and org scope). Permission grantees may reference them even if they are
	// not part of this migration.
	ExistingRoleNames map[string]bool
}

// splitPlatformRef splits a platform "org/name" reference. A bare name yields
// an empty org.
func splitPlatformRef(ref string) (org, name string) {
	ref = strings.TrimSpace(ref)
	if i := strings.Index(ref, "/"); i >= 0 {
		return ref[:i], ref[i+1:]
	}
	return "", ref
}

// buildBizMigrationPlan maps platform roles and permissions to biz entities.
// Output order is deterministic (sorted by name).
func buildBizMigrationPlan(in bizMigrationInput) *bizMigrationPlan {
	plan := &bizMigrationPlan{}
	issue := func(kind, entity, name, field, format string, args ...interface{}) {
		plan.Issues = append(plan.Issues, BizMigrationIssue{Kind: kind, Entity: entity, Name: name, Field: field, Message: fmt.Sprintf(format, args...)})
	}

	roles := append([]*Role(nil), in.Roles...)
	sort.Slice(roles, func(i, j int) bool { return roles[i].Name < roles[j].Name })
	perms := append([]*Permission(nil), in.Permissions...)
	sort.Slice(perms, func(i, j int) bool { return perms[i].Name < perms[j].Name })

	// ── Roles ──
	migratedRoles := map[string]bool{}
	for _, r := range roles {
		if strings.TrimSpace(r.Name) == "" {
			continue
		}
		migratedRoles[r.Name] = true
	}
	for _, r := range roles {
		if strings.TrimSpace(r.Name) == "" {
			continue
		}
		pr := &plannedBizRole{Name: r.Name, DisplayName: r.DisplayName, Description: r.Description, IsEnabled: r.IsEnabled}
		if len(r.Domains) > 0 {
			issue(BizMigrationUnmappable, "role", r.Name, "domains", "domains %v are not supported by biz roles and were ignored", r.Domains)
		}
		for _, u := range dedupStrings(r.Users) {
			pr.Members = append(pr.Members, bizMigrationSubject{Type: BizRoleSubjectUser, Id: u})
		}
		for _, g := range dedupStrings(r.Groups) {
			pr.Members = append(pr.Members, bizMigrationSubject{Type: BizRoleSubjectGroup, Id: g})
		}
		// Platform: X.Roles = [Y] means members of Y also hold X, i.e. Y
		// inherits X's permissions -> biz edge (parent X, child Y).
		for _, sub := range dedupStrings(r.Roles) {
			subOrg, subName := splitPlatformRef(sub)
			switch {
			case subOrg != "" && subOrg != in.Organization:
				issue(BizMigrationUnmappable, "inheritance", r.Name, "roles", "sub-role %q belongs to another organization and was ignored", sub)
			case !migratedRoles[subName]:
				issue(BizMigrationUnmappable, "inheritance", r.Name, "roles", "sub-role %q does not exist in the source organization and was ignored", sub)
			default:
				plan.Edges = append(plan.Edges, bizMigrationEdge{Parent: r.Name, Child: subName})
			}
		}
		plan.Roles = append(plan.Roles, pr)
	}

	// ── Permissions ──
	knownRole := func(name string) bool { return migratedRoles[name] || in.ExistingRoleNames[name] }
	for _, p := range perms {
		if strings.TrimSpace(p.Name) == "" {
			continue
		}
		resources := dedupStrings(p.Resources)
		actions := dedupStrings(p.Actions)
		if len(resources) == 0 {
			issue(BizMigrationInvalid, "permission", p.Name, "resources", "permission has no resources; biz permissions require at least one")
			continue
		}
		if len(actions) == 0 {
			issue(BizMigrationInvalid, "permission", p.Name, "actions", "permission has no actions; biz permissions require at least one")
			continue
		}
		effect := p.Effect
		if effect == "" {
			effect = EffectAllow
		}
		if effect != EffectAllow && effect != EffectDeny {
			issue(BizMigrationInvalid, "permission", p.Name, "effect", "unsupported effect %q", p.Effect)
			continue
		}
		if effect == EffectDeny && !in.SupportsDeny {
			issue(BizMigrationInvalid, "permission", p.Name, "effect", "effect Deny requires a target app model that honors deny (p = sub, obj, act, eft)")
			continue
		}
		state := p.State
		switch state {
		case "":
			state = StateApproved
		case StateApproved, StatePending, StateRejected:
		default:
			issue(BizMigrationUnmappable, "permission", p.Name, "state", "unknown approval state %q; imported as %s", p.State, StateApproved)
			state = StateApproved
		}

		pp := &plannedBizPermission{Perm: BizPermission{
			Owner: in.Organization, AppName: in.AppName, Name: p.Name,
			DisplayName: p.DisplayName, Description: p.Description,
			Resources: resources, Actions: actions, Effect: effect, IsEnabled: p.IsEnabled,
			Submitter: p.Submitter, Approver: p.Approver, ApproveTime: p.ApproveTime, State: state,
		}}
		if len(p.Domains) > 0 {
			issue(BizMigrationUnmappable, "permission", p.Name, "domains", "domains %v are not supported by biz permissions and were ignored", p.Domains)
		}
		if p.Model != "" {
			issue(BizMigrationUnmappable, "permission", p.Name, "model", "platform model %q is ignored; the target app's model applies", p.Model)
		}
		if p.Adapter != "" {
			issue(BizMigrationUnmappable, "permission", p.Name, "adapter", "platform adapter %q is ignored; the app policy table is used", p.Adapter)
		}
		if p.ResourceType != "" {
			issue(BizMigrationUnmappable, "permission", p.Name, "resourceType", "resourceType %q has no biz equivalent and was ignored", p.ResourceType)
		}
		for _, u := range dedupStrings(p.Users) {
			pp.Grantees = append(pp.Grantees, bizMigrationSubject{Type: BizPermGranteeUser, Id: u})
		}
		for _, g := range dedupStrings(p.Groups) {
			pp.Grantees = append(pp.Grantees, bizMigrationSubject{Type: BizPermGranteeGroup, Id: g})
		}
		for _, ref := range dedupStrings(p.Roles) {
			roleOrg, roleName := splitPlatformRef(ref)
			switch {
			case roleOrg != "" && roleOrg != in.Organization:
				issue(BizMigrationUnmappable, "permission", p.Name, "roles", "role %q belongs to another organization and was not granted", ref)
			case !knownRole(roleName):
				issue(BizMigrationUnmappable, "permission", p.Name, "roles", "role %q does not exist in the source organization and was not granted", ref)
			default:
				pp.Grantees = append(pp.Grantees, bizMigrationSubject{Type: BizPermGranteeRole, Id: roleName})
			}
		}
		if len(pp.Grantees) == 0 {
			issue(BizMigrationUnmappable, "permission", p.Name, "grantees", "permission has no users, groups or roles to grant to")
		}
		plan.Permissions = append(plan.Permissions, pp)
	}
	return plan
}

func dedupStrings(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// acceptInheritanceEdges decides which planned edges can be added on top of the
// existing graph without a cycle or exceeding MaxBizRoleInheritanceDepth.
// It returns the edges to insert (already-present edges are dropped silently)
// and an issue per rejected edge. Mirrors the checks of AddBizRoleInheritance.
func acceptInheritanceEdges(existing, planned []bizMigrationEdge) ([]bizMigrationEdge, []BizMigrationIssue) {
	parents := map[string]map[string]bool{} // child -> parents
	children := map[string]map[string]bool{}
	add := func(e bizMigrationEdge) {
		if parents[e.Child] == nil {
			parents[e.Child] = map[string]bool{}
		}
		parents[e.Child][e.Parent] = true
		if children[e.Parent] == nil {
			children[e.Parent] = map[string]bool{}
		}
		children[e.Parent][e.Child] = true
	}
	for _, e := range existing {
		add(e)
	}

	// longest upward / downward chain length (in edges) from a node
	var depth func(node string, next map[string]map[string]bool, seen map[string]bool) int
	depth = func(node string, next map[string]map[string]bool, seen map[string]bool) int {
		if seen[node] {
			return 0
		}
		seen[node] = true
		defer delete(seen, node)
		best := 0
		for n := range next[node] {
			if d := 1 + depth(n, next, seen); d > best {
				best = d
			}
		}
		return best
	}
	reachesUp := func(from, target string) bool {
		stack, seen := []string{from}, map[string]bool{}
		for len(stack) > 0 {
			n := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if n == target {
				return true
			}
			if seen[n] {
				continue
			}
			seen[n] = true
			for p := range parents[n] {
				stack = append(stack, p)
			}
		}
		return false
	}

	var accepted []bizMigrationEdge
	var issues []BizMigrationIssue
	reject := func(e bizMigrationEdge, msg string) {
		issues = append(issues, BizMigrationIssue{
			Kind: BizMigrationUnmappable, Entity: "inheritance", Name: e.Child, Field: "roles",
			Message: fmt.Sprintf("inheritance %s -> %s skipped: %s", e.Child, e.Parent, msg),
		})
	}
	for _, e := range planned {
		switch {
		case e.Parent == e.Child:
			reject(e, "a role cannot inherit from itself")
		case parents[e.Child][e.Parent]:
			// already present
		case reachesUp(e.Parent, e.Child):
			reject(e, "it would create a cycle")
		default:
			up := depth(e.Parent, parents, map[string]bool{})
			down := depth(e.Child, children, map[string]bool{})
			if up+1+down > MaxBizRoleInheritanceDepth {
				reject(e, fmt.Sprintf("it would exceed the maximum inheritance depth of %d", MaxBizRoleInheritanceDepth))
				continue
			}
			add(e)
			accepted = append(accepted, e)
		}
	}
	return accepted, issues
}
