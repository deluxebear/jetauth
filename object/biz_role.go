// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"github.com/deluxebear/casdoor/util"
	"github.com/xorm-io/core"
)

type BizRole struct {
	Owner       string   `xorm:"varchar(100) notnull pk" json:"owner"`
	AppName     string   `xorm:"varchar(100) notnull pk" json:"appName"`
	Name        string   `xorm:"varchar(100) notnull pk" json:"name"`
	CreatedTime string   `xorm:"varchar(100)" json:"createdTime"`
	DisplayName string   `xorm:"varchar(100)" json:"displayName"`
	Description string   `xorm:"varchar(500)" json:"description"`
	Users       []string `xorm:"mediumtext" json:"users"`
	Groups      []string `xorm:"mediumtext" json:"groups"`
	Roles       []string `xorm:"mediumtext" json:"roles"` // sub-roles within same app
	Properties  string   `xorm:"mediumtext" json:"properties"`
	IsEnabled   bool     `json:"isEnabled"`
}

func (r *BizRole) GetId() string {
	return util.GetSessionId(r.Owner, r.Name, r.AppName)
}

func GetBizRoles(owner, appName string) ([]*BizRole, error) {
	roles := []*BizRole{}
	err := ormer.Engine.Desc("created_time").Find(&roles, &BizRole{Owner: owner, AppName: appName})
	if err != nil {
		return nil, err
	}
	return roles, nil
}

func getBizRole(owner, appName, name string) (*BizRole, error) {
	if util.IsStringsEmpty(owner, appName, name) {
		return nil, nil
	}
	role := BizRole{Owner: owner, AppName: appName, Name: name}
	existed, err := ormer.Engine.Get(&role)
	if err != nil {
		return nil, err
	}
	if existed {
		return &role, nil
	}
	return nil, nil
}

func GetBizRole(owner, appName, name string) (*BizRole, error) {
	return getBizRole(owner, appName, name)
}

func AddBizRole(role *BizRole) (bool, error) {
	affected, err := ormer.Engine.Insert(role)
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(role.Owner, role.AppName)
	}

	return affected != 0, nil
}

func UpdateBizRole(owner, appName, name string, role *BizRole) (bool, error) {
	affected, err := ormer.Engine.ID(core.PK{owner, appName, name}).AllCols().Update(role)
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(role.Owner, role.AppName)
	}

	return affected != 0, nil
}

func DeleteBizRole(role *BizRole) (bool, error) {
	affected, err := ormer.Engine.ID(core.PK{role.Owner, role.AppName, role.Name}).Delete(&BizRole{})
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(role.Owner, role.AppName)
	}

	return affected != 0, nil
}

// GetBizRolesByUser returns all roles a user belongs to in a given app.
func GetBizRolesByUser(owner, appName, userId string) ([]*BizRole, error) {
	allRoles, err := GetBizRoles(owner, appName)
	if err != nil {
		return nil, err
	}

	var result []*BizRole
	for _, role := range allRoles {
		if !role.IsEnabled {
			continue
		}
		for _, u := range role.Users {
			if u == userId || u == "*" {
				result = append(result, role)
				break
			}
		}
	}
	return result, nil
}
