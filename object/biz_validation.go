// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"encoding/json"
	"fmt"
	"strings"
)

const maxRoleInheritanceDepth = 10

// Effect and State constants
const (
	EffectAllow = "Allow"
	EffectDeny  = "Deny"

	StateApproved = "Approved"
	StatePending  = "Pending"
	StateRejected = "Rejected"
)

// Error messages use "biz:" namespace for i18n translation.
// Controller layer translates them via c.T() before returning to client.

// validateBizRole validates a BizRole before add or update.
func validateBizRole(role *BizRole, isUpdate bool) error {
	if strings.TrimSpace(role.Owner) == "" || strings.TrimSpace(role.AppName) == "" {
		return fmt.Errorf("biz:Role owner and appName cannot be empty")
	}
	if strings.TrimSpace(role.Name) == "" {
		return fmt.Errorf("biz:Role name cannot be empty")
	}

	role.Users = dedup(role.Users)
	role.Roles = dedup(role.Roles)

	for _, r := range role.Roles {
		if r == role.Name {
			return fmt.Errorf("biz:Role \"%s\" cannot inherit from itself", role.Name)
		}
	}

	if len(role.Roles) > 0 {
		allRoles, err := GetBizRoles(role.Owner, role.AppName)
		if err != nil {
			return fmt.Errorf("biz:Failed to load roles for validation: %s", err.Error())
		}
		roleSet := make(map[string]bool, len(allRoles))
		for _, r := range allRoles {
			roleSet[r.Name] = true
		}
		if !isUpdate {
			roleSet[role.Name] = true
		}

		for _, subRole := range role.Roles {
			if !roleSet[subRole] {
				return fmt.Errorf("biz:Sub-role \"%s\" does not exist in app %s/%s", subRole, role.Owner, role.AppName)
			}
		}

		adj := make(map[string][]string, len(allRoles)+1)
		for _, r := range allRoles {
			if r.Name == role.Name {
				adj[r.Name] = role.Roles
			} else {
				adj[r.Name] = r.Roles
			}
		}
		if _, ok := adj[role.Name]; !ok {
			adj[role.Name] = role.Roles
		}

		if cycle := detectCycle(adj, role.Name); cycle != "" {
			return fmt.Errorf("biz:Circular role inheritance detected: %s", cycle)
		}

		depth := computeMaxDepth(adj, role.Name)
		if depth > maxRoleInheritanceDepth {
			return fmt.Errorf("biz:Role inheritance depth exceeds limit (%d), current depth: %d", maxRoleInheritanceDepth, depth)
		}
	}

	if role.Properties != "" {
		role.Properties = strings.TrimSpace(role.Properties)
		if role.Properties != "" && !json.Valid([]byte(role.Properties)) {
			return fmt.Errorf("biz:Role properties must be valid JSON")
		}
	}

	return nil
}

// validateBizPermission validates a BizPermission before add or update.
func validateBizPermission(perm *BizPermission) error {
	if strings.TrimSpace(perm.Owner) == "" || strings.TrimSpace(perm.AppName) == "" {
		return fmt.Errorf("biz:Permission owner and appName cannot be empty")
	}
	if strings.TrimSpace(perm.Name) == "" {
		return fmt.Errorf("biz:Permission name cannot be empty")
	}

	perm.Users = dedup(perm.Users)
	perm.Roles = dedup(perm.Roles)
	perm.Resources = dedup(perm.Resources)
	perm.Actions = dedup(perm.Actions)

	if len(perm.Users) == 0 && len(perm.Roles) == 0 {
		return fmt.Errorf("biz:Permission must have at least one subject (user or role)")
	}
	if len(perm.Resources) == 0 {
		return fmt.Errorf("biz:Permission must have at least one resource")
	}
	if len(perm.Actions) == 0 {
		return fmt.Errorf("biz:Permission must have at least one action")
	}

	if len(perm.Roles) > 0 {
		allRoles, err := GetBizRoles(perm.Owner, perm.AppName)
		if err != nil {
			return fmt.Errorf("biz:Failed to load roles for validation: %s", err.Error())
		}
		roleSet := make(map[string]bool, len(allRoles))
		for _, r := range allRoles {
			roleSet[r.Name] = true
		}
		for _, roleName := range perm.Roles {
			if !roleSet[roleName] {
				return fmt.Errorf("biz:Role \"%s\" does not exist in app %s/%s", roleName, perm.Owner, perm.AppName)
			}
		}
	}

	if perm.Effect != EffectAllow && perm.Effect != EffectDeny {
		return fmt.Errorf("biz:Effect must be \"%s\" or \"%s\", got \"%s\"", EffectAllow, EffectDeny, perm.Effect)
	}

	if perm.State != "" && perm.State != StateApproved && perm.State != StatePending && perm.State != StateRejected {
		return fmt.Errorf("biz:State must be \"%s\", \"%s\", or \"%s\", got \"%s\"", StateApproved, StatePending, StateRejected, perm.State)
	}

	return nil
}

// validateBizRoleDelete checks if a role can be safely deleted.
// Blocks deletion only when OTHER entities reference this role (strong constraints).
// The role's own sub-roles are cleaned up automatically by cleanupRoleBeforeDelete.
func validateBizRoleDelete(role *BizRole) error {
	allRoles, err := GetBizRoles(role.Owner, role.AppName)
	if err != nil {
		return err
	}

	// Block: other roles inherit this role
	for _, r := range allRoles {
		if r.Name == role.Name {
			continue
		}
		for _, sub := range r.Roles {
			if sub == role.Name {
				return fmt.Errorf("biz:Cannot delete role \"%s\": it is inherited by role \"%s\"", role.Name, r.Name)
			}
		}
	}

	// Block: permissions reference this role
	allPerms, err := GetBizPermissions(role.Owner, role.AppName)
	if err != nil {
		return err
	}
	for _, p := range allPerms {
		for _, r := range p.Roles {
			if r == role.Name {
				return fmt.Errorf("biz:Cannot delete role \"%s\": it is referenced by permission \"%s\"", role.Name, p.Name)
			}
		}
	}

	return nil
}

// ── Helpers ──

func dedup(ss []string) []string {
	if len(ss) == 0 {
		return ss
	}
	seen := make(map[string]bool, len(ss))
	result := make([]string, 0, len(ss))
	for _, s := range ss {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	return result
}

func detectCycle(adj map[string][]string, startNode string) string {
	visited := make(map[string]bool)
	inStack := make(map[string]bool)
	var stack []string

	var dfs func(node string) string
	dfs = func(node string) string {
		visited[node] = true
		inStack[node] = true
		stack = append(stack, node)

		for _, next := range adj[node] {
			if !visited[next] {
				if result := dfs(next); result != "" {
					return result
				}
			} else if inStack[next] {
				stack = append(stack, next)
				for i, n := range stack {
					if n == next {
						return strings.Join(stack[i:], " → ")
					}
				}
			}
		}

		inStack[node] = false
		stack = stack[:len(stack)-1]
		return ""
	}

	return dfs(startNode)
}

func computeMaxDepth(adj map[string][]string, node string) int {
	memo := make(map[string]int)
	var compute func(n string, visiting map[string]bool) int
	compute = func(n string, visiting map[string]bool) int {
		if visiting[n] {
			return 0
		}
		if v, ok := memo[n]; ok {
			return v
		}
		visiting[n] = true
		maxChild := 0
		for _, child := range adj[n] {
			d := compute(child, visiting)
			if d > maxChild {
				maxChild = d
			}
			if maxChild+1 > maxRoleInheritanceDepth {
				break
			}
		}
		visiting[n] = false
		memo[n] = maxChild + 1
		return maxChild + 1
	}
	return compute(node, make(map[string]bool))
}
