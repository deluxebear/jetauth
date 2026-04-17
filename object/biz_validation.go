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

// BizError carries a translatable error template with arguments.
// The controller layer translates the template via c.T() before formatting.
type BizError struct {
	Namespace string        // e.g. "biz"
	Template  string        // e.g. `Cannot delete role "%s": it is inherited by role "%s"`
	Args      []interface{} // e.g. ["admin", "editor"]
}

func (e *BizError) Error() string {
	return fmt.Sprintf(e.Namespace+":"+e.Template, e.Args...)
}

// newBizError creates a BizError with the "biz" namespace.
func newBizError(template string, args ...interface{}) *BizError {
	return &BizError{Namespace: "biz", Template: template, Args: args}
}

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

// validateBizRole validates a BizRole row before add or update.
//
// Membership (users/groups) and sub-role inheritance moved to the
// biz_role_member and biz_role_inheritance tables, so they are validated at
// their own add paths (with cycle-detection in AddBizRoleInheritance). This
// function only checks the row's own shape.
func validateBizRole(role *BizRole) error {
	if strings.TrimSpace(role.Organization) == "" {
		return newBizError("Role organization cannot be empty")
	}
	if strings.TrimSpace(role.Name) == "" {
		return newBizError("Role name cannot be empty")
	}

	if role.Properties != "" {
		role.Properties = strings.TrimSpace(role.Properties)
		if role.Properties != "" && !json.Valid([]byte(role.Properties)) {
			return newBizError("Role properties must be valid JSON")
		}
	}

	return nil
}

// validateBizPermission validates a BizPermission row before add or update.
//
// Grantees (users/roles) moved to the biz_permission_grantee table and are
// validated at that table's add path. This function only checks the row's
// own shape (identity, resources/actions, effect, approval state).
func validateBizPermission(perm *BizPermission) error {
	if strings.TrimSpace(perm.Owner) == "" || strings.TrimSpace(perm.AppName) == "" {
		return newBizError("Permission owner and appName cannot be empty")
	}
	if strings.TrimSpace(perm.Name) == "" {
		return newBizError("Permission name cannot be empty")
	}

	perm.Resources = dedup(perm.Resources)
	perm.Actions = dedup(perm.Actions)

	if len(perm.Resources) == 0 {
		return newBizError("Permission must have at least one resource")
	}
	if len(perm.Actions) == 0 {
		return newBizError("Permission must have at least one action")
	}

	if perm.Effect != EffectAllow && perm.Effect != EffectDeny {
		return newBizError("Effect must be \"%s\" or \"%s\", got \"%s\"", EffectAllow, EffectDeny, perm.Effect)
	}

	if perm.State != "" && perm.State != StateApproved && perm.State != StatePending && perm.State != StateRejected {
		return newBizError("State must be \"%s\", \"%s\", or \"%s\", got \"%s\"", StateApproved, StatePending, StateRejected, perm.State)
	}

	return nil
}

// validateBizRoleDelete is a row-level pre-check before deleting a role.
//
// The meaningful cross-entity checks (roles inheriting this role, permissions
// granted to this role) now live in the relational tables
// biz_role_inheritance and biz_permission_grantee; their own delete paths
// cascade or block as appropriate. This function is intentionally a no-op
// placeholder that callers may keep invoking without behavioural change.
func validateBizRoleDelete(role *BizRole) error {
	if role == nil {
		return newBizError("Role is nil")
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
