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

type BizPermission struct {
	Owner       string   `xorm:"varchar(100) notnull pk" json:"owner"`
	AppName     string   `xorm:"varchar(100) notnull pk" json:"appName"`
	Name        string   `xorm:"varchar(100) notnull pk" json:"name"`
	CreatedTime string   `xorm:"varchar(100)" json:"createdTime"`
	DisplayName string   `xorm:"varchar(100)" json:"displayName"`
	Description string   `xorm:"varchar(500)" json:"description"`
	Users       []string `xorm:"mediumtext" json:"users"`
	Roles       []string `xorm:"mediumtext" json:"roles"` // references BizRole.Name in same app
	Resources   []string `xorm:"mediumtext" json:"resources"`
	Actions     []string `xorm:"mediumtext" json:"actions"`
	Effect      string   `xorm:"varchar(20)" json:"effect"` // Allow / Deny
	IsEnabled   bool     `json:"isEnabled"`
	// Approval
	Submitter   string `xorm:"varchar(100)" json:"submitter"`
	Approver    string `xorm:"varchar(100)" json:"approver"`
	ApproveTime string `xorm:"varchar(100)" json:"approveTime"`
	State       string `xorm:"varchar(20)" json:"state"` // Approved / Pending / Rejected
}

func (p *BizPermission) GetId() string {
	return util.GetSessionId(p.Owner, p.Name, p.AppName)
}

func GetBizPermissions(owner, appName string) ([]*BizPermission, error) {
	perms := []*BizPermission{}
	err := ormer.Engine.Desc("created_time").Find(&perms, &BizPermission{Owner: owner, AppName: appName})
	if err != nil {
		return nil, err
	}
	return perms, nil
}

func getBizPermission(owner, appName, name string) (*BizPermission, error) {
	if util.IsStringsEmpty(owner, appName, name) {
		return nil, nil
	}
	perm := BizPermission{Owner: owner, AppName: appName, Name: name}
	existed, err := ormer.Engine.Get(&perm)
	if err != nil {
		return nil, err
	}
	if existed {
		return &perm, nil
	}
	return nil, nil
}

func GetBizPermission(owner, appName, name string) (*BizPermission, error) {
	return getBizPermission(owner, appName, name)
}

func AddBizPermission(perm *BizPermission) (bool, error) {
	if err := validateBizPermission(perm); err != nil {
		return false, err
	}

	affected, err := ormer.Engine.Insert(perm)
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(perm.Owner, perm.AppName)
	}

	return affected != 0, nil
}

func UpdateBizPermission(owner, appName, name string, perm *BizPermission) (bool, error) {
	if err := validateBizPermission(perm); err != nil {
		return false, err
	}

	affected, err := ormer.Engine.ID(core.PK{owner, appName, name}).AllCols().Update(perm)
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(perm.Owner, perm.AppName)
	}

	return affected != 0, nil
}

func DeleteBizPermission(perm *BizPermission) (bool, error) {
	affected, err := ormer.Engine.ID(core.PK{perm.Owner, perm.AppName, perm.Name}).Delete(&BizPermission{})
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(perm.Owner, perm.AppName)
	}

	return affected != 0, nil
}
