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
	"regexp"

	"github.com/beego/beego/v2/core/logs"
)

var validTableNameRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]{0,63}$`)

// Casbin-level policy effect values (lowercase, distinct from domain-level EffectAllow/EffectDeny).
const (
	casbinEftAllow = "allow"
	casbinEftDeny  = "deny"
)

// ValidatePolicyTable checks that the table name is safe for use in SQL.
func ValidatePolicyTable(tableName string) error {
	if tableName == "" {
		return nil // empty means use default
	}
	if !validTableNameRe.MatchString(tableName) {
		return fmt.Errorf("invalid policy table name %q: must match [a-zA-Z_][a-zA-Z0-9_]{0,63}", tableName)
	}
	return nil
}

// SyncStats holds the result of a policy sync operation.
type SyncStats struct {
	PolicyCount int `json:"policyCount"`
	RoleCount   int `json:"roleCount"`
}

// syncBizPolicies is a helper that wraps SyncAppPolicies with error logging.
// Use this in CRUD operations where the sync is best-effort.
func syncBizPolicies(owner, appName string) {
	_, err := SyncAppPolicies(owner, appName)
	if err != nil {
		logs.Warning("SyncAppPolicies failed for %s/%s: %v", owner, appName, err)
	}
}

// SyncAppPolicies rebuilds all Casbin policies for a business app from its
// biz_role and biz_permission tables, then writes them to the app's dedicated
// policy table. This is called whenever roles or permissions change.
func SyncAppPolicies(owner, appName string) (*SyncStats, error) {
	config, err := getBizAppConfigOrError(owner, appName)
	if err != nil {
		return nil, err
	}
	if config.ModelText == "" {
		return nil, fmt.Errorf("model text is empty for biz app: %s/%s", owner, appName)
	}

	if err := ValidatePolicyTable(config.PolicyTable); err != nil {
		return nil, err
	}

	// 1. Create enforcer with native Casbin model (no GetBuiltInModel magic)
	e, err := buildBizEnforcer(config)
	if err != nil {
		return nil, err
	}

	if err := validateBizPermissionModel(e); err != nil {
		return nil, err
	}

	// 2. Clear all existing policies
	e.ClearPolicy()

	// 3. Load roles and permissions
	roles, err := GetBizRoles(owner, appName)
	if err != nil {
		return nil, err
	}
	permissions, err := GetBizPermissions(owner, appName)
	if err != nil {
		return nil, err
	}

	// 4. Determine if model has eft field and whether the effect expression
	// actually honors deny — needed so computePermPPolicies can fail loud on
	// a Deny permission configured against an allow-only model.
	hasEft := detectHasEft(e)
	honorsDeny := hasEft && modelHonorsDeny(e)

	// 5. Generate p policies from permissions (Cartesian product) — batch
	var policies [][]string
	for _, perm := range permissions {
		permPolicies, err := computePermPPolicies(perm, hasEft, honorsDeny)
		if err != nil {
			return nil, fmt.Errorf("compute p for permission %s: %w", perm.Name, err)
		}
		policies = append(policies, permPolicies...)
	}
	if len(policies) > 0 {
		if _, err := e.AddPolicies(policies); err != nil {
			return nil, fmt.Errorf("failed to add policies: %w", err)
		}
	}

	// 6. Generate g policies from roles (role inheritance) — batch
	var groupingPolicies [][]string
	hasRoleDef := HasRoleDefinition(e.GetModel())
	if hasRoleDef {
		for _, role := range roles {
			rolePolicies, err := computeRoleGPolicies(role)
			if err != nil {
				return nil, fmt.Errorf("compute g for role %s: %w", role.Name, err)
			}
			groupingPolicies = append(groupingPolicies, rolePolicies...)
		}

		// 6b. Expand group membership: any group referenced as a subject
		// (either as a permission grantee or as a role member) needs
		// `g userId groupId` rules so Casbin can resolve user→group.
		// Without this, enforce(alice, ...) fails even when alice is in
		// a group that was granted the permission.
		groupExpansion, err := expandGroupMembership(permissions, roles)
		if err != nil {
			return nil, fmt.Errorf("expand group membership: %w", err)
		}
		groupingPolicies = append(groupingPolicies, groupExpansion...)

		if len(groupingPolicies) > 0 {
			if _, err := e.AddGroupingPolicies(groupingPolicies); err != nil {
				return nil, fmt.Errorf("failed to add grouping policies: %w", err)
			}
		}
	}
	if groupingPolicies == nil {
		groupingPolicies = [][]string{}
	}

	// 7. Persist to policy table
	err = e.SavePolicy()
	if err != nil {
		return nil, fmt.Errorf("failed to save policies: %w", err)
	}

	// 8. Store the fully-loaded enforcer in cache (reuse instead of clearing)
	StoreBizEnforcerCache(owner, appName, e)

	// 9. Write to Redis cache (if enabled) — reuse slices directly, no re-extraction
	bizPolicyCacheSet(owner, appName, &BizPolicyCacheData{
		ModelText:        config.ModelText,
		Policies:         policies,
		GroupingPolicies: groupingPolicies,
		PolicyTable:      config.PolicyTable,
		UpdatedTime:      bumpBizAppConfigUpdatedTime(owner, appName),
	})

	return &SyncStats{
		PolicyCount: len(policies),
		RoleCount:   len(roles),
	}, nil
}
