// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"sync"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
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

	// SupportsDeny is a computed field (not persisted) that reports whether
	// the current ModelText has both a p_eft field and a policy_effect that
	// references p.eft == deny. The frontend uses this to hide or disable
	// the Deny option in permission edit UIs so admins can't save a
	// permission whose Effect will never fire.
	SupportsDeny bool `xorm:"-" json:"supportsDeny"`
}

// modelDenySupportCache memoizes modelTextSupportsDeny by the exact model
// text. ModelText is admin-controlled and mostly static — distinct values
// are few, so the cache is naturally bounded and never needs eviction. The
// alternative (parsing a Casbin model + building an enforcer on every app
// read) was measurable backend overhead on large-tenant list endpoints.
var modelDenySupportCache sync.Map // modelText string → bool

// modelTextSupportsDeny probes a Casbin model text to report whether
// Effect=Deny has a chance of firing. Shared by JSON marshalling of
// BizAppConfig and by the save-time validator.
func modelTextSupportsDeny(modelText string) bool {
	if modelText == "" {
		return false
	}
	if v, ok := modelDenySupportCache.Load(modelText); ok {
		return v.(bool)
	}
	result := computeModelSupportsDeny(modelText)
	modelDenySupportCache.Store(modelText, result)
	return result
}

func computeModelSupportsDeny(modelText string) bool {
	m, err := model.NewModelFromString(modelText)
	if err != nil {
		return false
	}
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return false
	}
	return detectHasEft(e) && modelHonorsDeny(e)
}

// fillSupportsDeny fills the computed flag on any BizAppConfig returned to
// the HTTP layer. Called from every read path.
func fillSupportsDeny(c *BizAppConfig) {
	if c == nil {
		return
	}
	c.SupportsDeny = modelTextSupportsDeny(c.ModelText)
}

func (c *BizAppConfig) GetId() string {
	return util.GetId(c.Owner, c.AppName)
}

// isCrossOrgOwner reports whether the caller-supplied owner should surface
// configs from every organization. Frontend's "All" org selector sends an
// empty string, while older / admin API paths send the literal "admin".
// Accept both so the two conventions coexist instead of silently filtering
// to the empty-owner row set.
func isCrossOrgOwner(owner string) bool {
	return owner == "" || owner == "admin"
}

func GetBizAppConfigCount(owner string) (int64, error) {
	if isCrossOrgOwner(owner) {
		return ormer.Engine.Count(&BizAppConfig{})
	}
	return ormer.Engine.Count(&BizAppConfig{Owner: owner})
}

func GetBizAppConfigs(owner string) ([]*BizAppConfig, error) {
	configs := []*BizAppConfig{}
	var err error
	if isCrossOrgOwner(owner) {
		err = ormer.Engine.Desc("created_time").Find(&configs)
	} else {
		err = ormer.Engine.Desc("created_time").Find(&configs, &BizAppConfig{Owner: owner})
	}
	if err != nil {
		return nil, err
	}
	for _, c := range configs {
		fillSupportsDeny(c)
	}
	return configs, nil
}

func getBizAppConfig(owner, appName string) (*BizAppConfig, error) {
	if util.IsStringsEmpty(owner, appName) {
		return nil, nil
	}
	config := BizAppConfig{Owner: owner, AppName: appName}
	existed, err := ormer.Engine.Get(&config)
	if err != nil {
		return nil, err
	}
	if existed {
		fillSupportsDeny(&config)
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
	if err := ValidatePolicyTable(config.PolicyTable); err != nil {
		return false, err
	}

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

	if err := ValidatePolicyTable(config.PolicyTable); err != nil {
		return false, err
	}

	affected, err := ormer.Engine.ID(core.PK{owner, name}).AllCols().Update(config)
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(config.Owner, config.AppName)
	}

	return affected != 0, nil
}

func DeleteBizAppConfig(config *BizAppConfig) (bool, error) {
	affected, err := ormer.Engine.ID(core.PK{config.Owner, config.AppName}).Delete(&BizAppConfig{})
	if err != nil {
		return false, err
	}

	if affected != 0 {
		ClearBizEnforcerCache(config.Owner, config.AppName)
	}

	return affected != 0, nil
}
