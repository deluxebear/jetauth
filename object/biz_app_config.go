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

	"github.com/deluxebear/casdoor/util"
	"github.com/xorm-io/core"
)

type BizAppConfig struct {
	Owner       string `xorm:"varchar(100) notnull pk" json:"owner"`
	AppName     string `xorm:"varchar(100) notnull pk" json:"appName"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`
	DisplayName string `xorm:"varchar(100)" json:"displayName"`
	Description string `xorm:"varchar(500)" json:"description"`
	ModelText   string `xorm:"mediumtext" json:"modelText"`
	PolicyTable string `xorm:"varchar(100)" json:"policyTable"`
	IsEnabled   bool   `json:"isEnabled"`
}

func (c *BizAppConfig) GetId() string {
	return fmt.Sprintf("%s/%s", c.Owner, c.AppName)
}

func GetBizAppConfigCount(owner string) (int64, error) {
	if owner == "admin" {
		return ormer.Engine.Count(&BizAppConfig{})
	}
	return ormer.Engine.Count(&BizAppConfig{Owner: owner})
}

func GetBizAppConfigs(owner string) ([]*BizAppConfig, error) {
	configs := []*BizAppConfig{}
	var err error
	if owner == "admin" {
		err = ormer.Engine.Desc("created_time").Find(&configs)
	} else {
		err = ormer.Engine.Desc("created_time").Find(&configs, &BizAppConfig{Owner: owner})
	}
	if err != nil {
		return nil, err
	}
	return configs, nil
}

func getBizAppConfig(owner, appName string) (*BizAppConfig, error) {
	if owner == "" || appName == "" {
		return nil, nil
	}
	config := BizAppConfig{Owner: owner, AppName: appName}
	existed, err := ormer.Engine.Get(&config)
	if err != nil {
		return nil, err
	}
	if existed {
		return &config, nil
	}
	return nil, nil
}

func GetBizAppConfig(id string) (*BizAppConfig, error) {
	owner, name, err := util.GetOwnerAndNameFromIdWithError(id)
	if err != nil {
		return nil, err
	}
	return getBizAppConfig(owner, name)
}

func AddBizAppConfig(config *BizAppConfig) (bool, error) {
	affected, err := ormer.Engine.Insert(config)
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}

func UpdateBizAppConfig(id string, config *BizAppConfig) (bool, error) {
	owner, name, err := util.GetOwnerAndNameFromIdWithError(id)
	if err != nil {
		return false, err
	}
	if c, _ := getBizAppConfig(owner, name); c == nil {
		return false, nil
	}

	affected, err := ormer.Engine.ID(core.PK{owner, name}).AllCols().Update(config)
	if err != nil {
		return false, err
	}

	if affected != 0 {
		// Model or config changed — resync policies
		_ = SyncAppPolicies(config.Owner, config.AppName)
	}

	return affected != 0, nil
}

func DeleteBizAppConfig(config *BizAppConfig) (bool, error) {
	affected, err := ormer.Engine.ID(core.PK{config.Owner, config.AppName}).Delete(&BizAppConfig{})
	if err != nil {
		return false, err
	}

	if affected != 0 {
		// Clean up enforcer cache
		ClearBizEnforcerCache(config.Owner, config.AppName)
	}

	return affected != 0, nil
}
