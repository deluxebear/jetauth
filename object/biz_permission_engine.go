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
	"strings"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	xormadapter "github.com/deluxebear/casdoor/adapters/xormadapter"
	"github.com/deluxebear/casdoor/conf"
)

// SyncAppPolicies rebuilds all Casbin policies for a business app from its
// biz_role and biz_permission tables, then writes them to the app's dedicated
// policy table. This is called whenever roles or permissions change.
func SyncAppPolicies(owner, appName string) error {
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return err
	}
	if config == nil {
		return fmt.Errorf("biz app config not found: %s/%s", owner, appName)
	}
	if config.ModelText == "" {
		return fmt.Errorf("model text is empty for biz app: %s/%s", owner, appName)
	}

	// 1. Create enforcer with native Casbin model (no GetBuiltInModel magic)
	m, err := model.NewModelFromString(config.ModelText)
	if err != nil {
		return fmt.Errorf("invalid model text: %w", err)
	}

	tableNamePrefix := conf.GetConfigString("tableNamePrefix")
	a, err := xormadapter.NewAdapterByEngineWithTableName(ormer.Engine, config.PolicyTable, tableNamePrefix)
	if err != nil {
		return fmt.Errorf("failed to create adapter: %w", err)
	}

	e, err := casbin.NewEnforcer(m, a)
	if err != nil {
		return fmt.Errorf("failed to create enforcer: %w", err)
	}

	// 2. Clear all existing policies
	e.ClearPolicy()

	// 3. Load roles and permissions
	roles, err := GetBizRoles(owner, appName)
	if err != nil {
		return err
	}
	permissions, err := GetBizPermissions(owner, appName)
	if err != nil {
		return err
	}

	// 4. Determine if model has eft field in policy_definition (not policy_effect)
	hasEft := false
	for _, line := range strings.Split(config.ModelText, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "p") && strings.Contains(trimmed, "=") && !strings.HasPrefix(trimmed, "[") {
			hasEft = strings.Contains(trimmed, "eft")
			break
		}
	}

	// 5. Generate p policies from permissions (Cartesian product)
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
						_, _ = e.AddPolicy(sub, res, act, eft)
					} else {
						_, _ = e.AddPolicy(sub, res, act)
					}
				}
			}
		}
	}

	// 6. Generate g policies from roles (role inheritance)
	hasRoleDef := strings.Contains(config.ModelText, "[role_definition]")
	if hasRoleDef {
		for _, role := range roles {
			if !role.IsEnabled {
				continue
			}
			// User → Role mapping
			for _, user := range role.Users {
				_, _ = e.AddGroupingPolicy(user, role.Name)
			}
			// Sub-role inheritance
			for _, subRole := range role.Roles {
				_, _ = e.AddGroupingPolicy(subRole, role.Name)
			}
		}
	}

	// 7. Persist to policy table
	err = e.SavePolicy()
	if err != nil {
		return fmt.Errorf("failed to save policies: %w", err)
	}

	// 8. Clear cached enforcer so next request picks up new policies
	ClearBizEnforcerCache(owner, appName)

	return nil
}
