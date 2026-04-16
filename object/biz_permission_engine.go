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
	"strings"

	"github.com/beego/beego/v2/core/logs"
)

var validTableNameRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]{0,63}$`)

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

	// 4. Determine if model has eft field using parsed model tokens
	hasEft := false
	if pDef, ok := e.GetModel()["p"]["p"]; ok {
		for _, token := range pDef.Tokens {
			if token == "p_eft" {
				hasEft = true
				break
			}
		}
	}

	// 5. Generate p policies from permissions (Cartesian product) — batch
	var policies [][]string
	for _, perm := range permissions {
		if !perm.IsEnabled || perm.State != "Approved" {
			continue
		}

		subjects := make([]string, 0, len(perm.Users)+len(perm.Roles))
		subjects = append(subjects, perm.Users...)
		subjects = append(subjects, perm.Roles...)

		for _, sub := range subjects {
			for _, res := range perm.Resources {
				for _, act := range perm.Actions {
					if hasEft {
						eft := "allow"
						if perm.Effect == "Deny" {
							eft = "deny"
						}
						policies = append(policies, []string{sub, res, act, eft})
					} else {
						policies = append(policies, []string{sub, res, act})
					}
				}
			}
		}
	}
	if len(policies) > 0 {
		if _, err := e.AddPolicies(policies); err != nil {
			return nil, fmt.Errorf("failed to add policies: %w", err)
		}
	}

	// 6. Generate g policies from roles (role inheritance) — batch
	var groupingPolicies [][]string
	hasRoleDef := strings.Contains(config.ModelText, "[role_definition]")
	if hasRoleDef {
		for _, role := range roles {
			if !role.IsEnabled {
				continue
			}
			for _, user := range role.Users {
				groupingPolicies = append(groupingPolicies, []string{user, role.Name})
			}
			for _, subRole := range role.Roles {
				groupingPolicies = append(groupingPolicies, []string{subRole, role.Name})
			}
		}
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
		UpdatedTime:      config.UpdatedTime,
	})

	return &SyncStats{
		PolicyCount: len(policies),
		RoleCount:   len(roles),
	}, nil
}
