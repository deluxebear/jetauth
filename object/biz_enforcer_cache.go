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
	"sync"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	xormadapter "github.com/deluxebear/casdoor/adapters/xormadapter"
	"github.com/deluxebear/casdoor/conf"
	"github.com/deluxebear/casdoor/util"
)

var bizEnforcerCache sync.Map // key: "owner/appName" → value: *casbin.Enforcer

// GetBizEnforcer returns a cached Casbin enforcer for the given app.
// The enforcer is created on first access and cached in memory.
func GetBizEnforcer(owner, appName string) (*casbin.Enforcer, error) {
	key := fmt.Sprintf("%s/%s", owner, appName)

	if cached, ok := bizEnforcerCache.Load(key); ok {
		return cached.(*casbin.Enforcer), nil
	}

	// Cache miss — build enforcer from app config
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, fmt.Errorf("biz app config not found: %s/%s", owner, appName)
	}
	if config.ModelText == "" {
		return nil, fmt.Errorf("model text is empty for biz app: %s/%s", owner, appName)
	}

	m, err := model.NewModelFromString(config.ModelText)
	if err != nil {
		return nil, fmt.Errorf("invalid model text for biz app %s/%s: %w", owner, appName, err)
	}

	tableNamePrefix := conf.GetConfigString("tableNamePrefix")
	a, err := xormadapter.NewAdapterByEngineWithTableName(ormer.Engine, config.PolicyTable, tableNamePrefix)
	if err != nil {
		return nil, fmt.Errorf("failed to create adapter for biz app %s/%s: %w", owner, appName, err)
	}

	e, err := casbin.NewEnforcer(m, a)
	if err != nil {
		return nil, fmt.Errorf("failed to create enforcer for biz app %s/%s: %w", owner, appName, err)
	}

	bizEnforcerCache.Store(key, e)
	return e, nil
}

// ClearBizEnforcerCache removes the cached enforcer for the given app.
// Next call to GetBizEnforcer will rebuild it from the database.
func ClearBizEnforcerCache(owner, appName string) {
	key := fmt.Sprintf("%s/%s", owner, appName)
	bizEnforcerCache.Delete(key)
}

// BizEnforce checks if the request is allowed for the given app.
func BizEnforce(owner, appName string, request []interface{}) (bool, error) {
	e, err := GetBizEnforcer(owner, appName)
	if err != nil {
		return false, err
	}

	return e.Enforce(request...)
}

// BizBatchEnforce checks multiple requests at once.
func BizBatchEnforce(owner, appName string, requests [][]interface{}) ([]bool, error) {
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
// for SDK local caching.
func BizGetPoliciesForExport(owner, appName string) (map[string]interface{}, error) {
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, fmt.Errorf("biz app config not found: %s/%s", owner, appName)
	}

	e, err := GetBizEnforcer(owner, appName)
	if err != nil {
		return nil, err
	}

	policies, err := e.GetPolicy()
	if err != nil {
		return nil, err
	}

	groupingPolicies := [][]string{}
	if e.GetModel()["g"] != nil {
		gp, err := e.GetGroupingPolicy()
		if err != nil {
			return nil, err
		}
		groupingPolicies = gp
	}

	return map[string]interface{}{
		"modelText":        config.ModelText,
		"policies":         policies,
		"groupingPolicies": groupingPolicies,
		"version":          config.UpdatedTime,
	}, nil
}

// BizGetUserPermissionSummary returns a summary of what a user can do in an app.
func BizGetUserPermissionSummary(owner, appName, userId string) (map[string]interface{}, error) {
	roles, err := BizGetUserRoles(owner, appName, userId)
	if err != nil {
		return nil, err
	}

	// Get role properties (data scope etc.)
	properties := map[string]interface{}{}
	for _, roleName := range roles {
		role, err := getBizRole(owner, appName, roleName)
		if err != nil || role == nil {
			// Try without owner prefix
			parts := strings.SplitN(roleName, "/", 2)
			if len(parts) == 2 {
				role, _ = getBizRole(owner, appName, parts[1])
			}
			if role == nil {
				continue
			}
		}
		if role.Properties != "" {
			// Merge properties (last role wins for conflicts)
			var roleProps map[string]interface{}
			if err := util.JsonToStruct(role.Properties, &roleProps); err == nil {
				for k, v := range roleProps {
					properties[k] = v
				}
			}
		}
	}

	return map[string]interface{}{
		"roles":      roles,
		"properties": properties,
	}, nil
}
