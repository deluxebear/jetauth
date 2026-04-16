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
	"sync"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	xormadapter "github.com/deluxebear/casdoor/adapters/xormadapter"
	"github.com/deluxebear/casdoor/conf"
	"github.com/deluxebear/casdoor/util"
	"golang.org/x/sync/singleflight"
)

var (
	bizEnforcerCache sync.Map          // key: "owner/appName" → value: *casbin.Enforcer
	bizEnforcerGroup singleflight.Group // dedup concurrent cache-fill for the same key
)

// extractPolicies extracts p and g policies from a live enforcer.
func extractPolicies(e *casbin.Enforcer) (policies [][]string, grouping [][]string) {
	policies, err := e.GetPolicy()
	if err != nil {
		policies = [][]string{}
	}
	if e.GetModel()["g"] != nil {
		gp, err := e.GetGroupingPolicy()
		if err == nil {
			grouping = gp
		}
	}
	if grouping == nil {
		grouping = [][]string{}
	}
	return
}

// buildBizEnforcer creates a new Casbin enforcer from the app config.
// Shared by both GetBizEnforcer (cache path) and SyncAppPolicies (rebuild path).
func buildBizEnforcer(config *BizAppConfig) (*casbin.Enforcer, error) {
	if config.ModelText == "" {
		return nil, fmt.Errorf("model text is empty for biz app: %s", config.GetId())
	}

	m, err := model.NewModelFromString(config.ModelText)
	if err != nil {
		return nil, fmt.Errorf("invalid model text for biz app %s: %w", config.GetId(), err)
	}

	tableNamePrefix := conf.GetConfigString("tableNamePrefix")
	a, err := xormadapter.NewAdapterByEngineWithTableName(ormer.Engine, config.PolicyTable, tableNamePrefix)
	if err != nil {
		return nil, fmt.Errorf("failed to create adapter for biz app %s: %w", config.GetId(), err)
	}

	e, err := casbin.NewEnforcer(m, a)
	if err != nil {
		return nil, fmt.Errorf("failed to create enforcer for biz app %s: %w", config.GetId(), err)
	}

	return e, nil
}

// getBizAppConfigOrError returns the config or a descriptive error.
func getBizAppConfigOrError(owner, appName string) (*BizAppConfig, error) {
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, fmt.Errorf("biz app config not found: %s", util.GetId(owner, appName))
	}
	return config, nil
}

// GetBizEnforcer returns a cached Casbin enforcer for the given app.
// Uses singleflight to avoid duplicate builds on concurrent cache misses.
func GetBizEnforcer(owner, appName string) (*casbin.Enforcer, error) {
	key := util.GetId(owner, appName)

	if cached, ok := bizEnforcerCache.Load(key); ok {
		return cached.(*casbin.Enforcer), nil
	}

	// Use singleflight to dedup concurrent cache-fill for the same key
	v, err, _ := bizEnforcerGroup.Do(key, func() (interface{}, error) {
		// Double-check after acquiring the flight
		if cached, ok := bizEnforcerCache.Load(key); ok {
			return cached, nil
		}

		// Try Redis cache — build enforcer from cached policies WITHOUT DB adapter
		if cacheData := bizPolicyCacheGet(owner, appName); cacheData != nil {
			e, err := buildEnforcerInMemory(cacheData.ModelText, cacheData.Policies, cacheData.GroupingPolicies)
			if err == nil {
				bizEnforcerCache.Store(key, e)
				return e, nil
			}
			// Redis data corrupt — fall through to DB
		}

		// DB fallback
		config, err := getBizAppConfigOrError(owner, appName)
		if err != nil {
			return nil, err
		}

		e, err := buildBizEnforcer(config)
		if err != nil {
			return nil, err
		}

		bizEnforcerCache.Store(key, e)

		// Write back to Redis
		policies, grouping := extractPolicies(e)
		bizPolicyCacheSet(owner, appName, &BizPolicyCacheData{
			ModelText:        config.ModelText,
			Policies:         policies,
			GroupingPolicies: grouping,
			PolicyTable:      config.PolicyTable,
			UpdatedTime:      config.UpdatedTime,
		})

		return e, nil
	})
	if err != nil {
		return nil, err
	}

	return v.(*casbin.Enforcer), nil
}

// StoreBizEnforcerCache directly stores an enforcer in the cache.
// Used by SyncAppPolicies to reuse the enforcer it already built.
func StoreBizEnforcerCache(owner, appName string, e *casbin.Enforcer) {
	key := util.GetId(owner, appName)
	bizEnforcerCache.Store(key, e)
}

// ClearBizEnforcerCache removes the cached enforcer for the given app
// from both local memory and Redis.
func ClearBizEnforcerCache(owner, appName string) {
	key := util.GetId(owner, appName)
	bizEnforcerCache.Delete(key)
	bizPolicyCacheClear(owner, appName)
}

// BizEnforce checks if the request is allowed for the given app.
// Returns false immediately if the app config is disabled.
func BizEnforce(owner, appName string, request []interface{}) (bool, error) {
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return false, err
	}
	if config == nil {
		return false, fmt.Errorf("biz app config not found: %s/%s", owner, appName)
	}
	if !config.IsEnabled {
		return false, fmt.Errorf("biz app is disabled: %s/%s", owner, appName)
	}

	e, err := GetBizEnforcer(owner, appName)
	if err != nil {
		return false, err
	}

	return e.Enforce(request...)
}

// BizBatchEnforce checks multiple requests at once.
// Returns error immediately if the app config is disabled.
func BizBatchEnforce(owner, appName string, requests [][]interface{}) ([]bool, error) {
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, fmt.Errorf("biz app config not found: %s/%s", owner, appName)
	}
	if !config.IsEnabled {
		return nil, fmt.Errorf("biz app is disabled: %s/%s", owner, appName)
	}

	e, err := GetBizEnforcer(owner, appName)
	if err != nil {
		return nil, err
	}

	return e.BatchEnforce(requests)
}

// BizGetUserRoles returns all roles the user has in the given app.
func BizGetUserRoles(owner, appName, userId string) ([]string, error) {
	e, err := GetBizEnforcer(owner, appName)
	if err != nil {
		return nil, err
	}

	roles, err := e.GetRolesForUser(userId)
	if err != nil {
		return nil, err
	}
	return roles, nil
}

// BizGetPoliciesForExport returns model text, policies, and grouping policies
// for SDK local caching. Tries Redis cache first to avoid DB/Enforcer overhead.
func BizGetPoliciesForExport(owner, appName string) (map[string]interface{}, error) {
	// Try Redis cache first — no DB query needed
	if cacheData := bizPolicyCacheGet(owner, appName); cacheData != nil {
		return map[string]interface{}{
			"modelText":        cacheData.ModelText,
			"policies":         cacheData.Policies,
			"groupingPolicies": cacheData.GroupingPolicies,
			"version":          cacheData.UpdatedTime,
		}, nil
	}

	// Fallback: load from enforcer
	config, err := getBizAppConfigOrError(owner, appName)
	if err != nil {
		return nil, err
	}

	e, err := GetBizEnforcer(owner, appName)
	if err != nil {
		return nil, err
	}

	policies, groupingPolicies := extractPolicies(e)

	return map[string]interface{}{
		"modelText":        config.ModelText,
		"policies":         policies,
		"groupingPolicies": groupingPolicies,
		"version":          config.UpdatedTime,
	}, nil
}

// BizGetUserPermissionSummary returns a summary of what a user can do in an app,
// including roles, allowed resources/actions, and role properties.
func BizGetUserPermissionSummary(owner, appName, userId string) (map[string]interface{}, error) {
	roles, err := BizGetUserRoles(owner, appName, userId)
	if err != nil {
		return nil, err
	}

	// Batch-fetch all roles for the app once to avoid N+1 queries
	allRoles, err := GetBizRoles(owner, appName)
	if err != nil {
		return nil, err
	}
	roleMap := make(map[string]*BizRole, len(allRoles))
	for _, r := range allRoles {
		roleMap[r.Name] = r
	}

	// Get role properties (data scope etc.)
	properties := map[string]interface{}{}
	for _, roleName := range roles {
		role := roleMap[roleName]
		if role == nil {
			_, name := util.GetOwnerAndNameFromIdNoCheck(roleName)
			role = roleMap[name]
		}
		if role == nil {
			continue
		}
		if role.Properties != "" {
			var roleProps map[string]interface{}
			if err := util.JsonToStruct(role.Properties, &roleProps); err == nil {
				for k, v := range roleProps {
					properties[k] = v
				}
			}
		}
	}

	// Collect allowed resources and actions from permissions
	resourceSet := map[string]bool{}
	actionSet := map[string]bool{}

	permissions, err := GetBizPermissions(owner, appName)
	if err != nil {
		return nil, err
	}

	roleSet := map[string]bool{}
	for _, r := range roles {
		roleSet[r] = true
	}

	for _, perm := range permissions {
		if !perm.IsEnabled || perm.State != "Approved" || perm.Effect == "Deny" {
			continue
		}
		// Check if this permission applies to the user (directly or via role)
		applies := false
		for _, u := range perm.Users {
			if u == userId || u == "*" {
				applies = true
				break
			}
		}
		if !applies {
			for _, r := range perm.Roles {
				if roleSet[r] {
					applies = true
					break
				}
			}
		}
		if !applies {
			continue
		}
		for _, res := range perm.Resources {
			resourceSet[res] = true
		}
		for _, act := range perm.Actions {
			actionSet[act] = true
		}
	}

	allowedResources := make([]string, 0, len(resourceSet))
	for res := range resourceSet {
		allowedResources = append(allowedResources, res)
	}
	allowedActions := make([]string, 0, len(actionSet))
	for act := range actionSet {
		allowedActions = append(allowedActions, act)
	}

	return map[string]interface{}{
		"roles":            roles,
		"allowedResources": allowedResources,
		"allowedActions":   allowedActions,
		"properties":       properties,
	}, nil
}
