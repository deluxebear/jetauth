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
	"github.com/deluxebear/jetauth/util"
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

	// PolicyVersion is bumped on every committed policy change (see
	// biz_policy_changelog.go). Server-maintained: client-supplied values are
	// ignored on add/update.
	PolicyVersion int64 `xorm:"bigint notnull default 0" json:"policyVersion"`

	// ModelType selects the authorization engine. Defaults to "casbin"
	// for backward compatibility; "rebac" routes BizEnforce to the
	// OpenFGA-compatible graph engine. See docs/rebac-spec.md §4.1.
	ModelType string `xorm:"varchar(20) default 'casbin'" json:"modelType"`

	// CurrentAuthorizationModelId points at the latest BizAuthorizationModel
	// row for this app. Writes and Checks default to this model; historical
	// models are preserved (spec §4.2) and can be addressed explicitly.
	CurrentAuthorizationModelId string `xorm:"varchar(40)" json:"currentAuthorizationModelId"`

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

// ValidateBizModelText performs a lightweight parse check of a Casbin model
// text: it must parse, build an enforcer, and expose a policy shape the biz
// permission engine can populate. ReBAC apps do not use ModelText, so the
// check is skipped for them and for empty text.
func ValidateBizModelText(modelType, modelText string) error {
	if modelType == ModelTypeReBAC || strings.TrimSpace(modelText) == "" {
		return nil
	}
	m, err := model.NewModelFromString(modelText)
	if err != nil {
		return fmt.Errorf("invalid Casbin model: %w", err)
	}
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return fmt.Errorf("invalid Casbin model: %w", err)
	}
	if err := validateBizPermissionModel(e); err != nil {
		return fmt.Errorf("invalid Casbin model: %w", err)
	}
	return nil
}

// DefaultAdminRoleName / DefaultAdminPermissionName name the objects created
// by InitBizAppDefaults.
const (
	DefaultAdminRoleName       = "admin"
	DefaultAdminPermissionName = "admin_full_access"
)

// InitBizAppDefaults seeds a freshly created Casbin-mode app with an `admin`
// role and a permission granting that role every resource and action. It is
// idempotent-ish: an existing role/permission with the same name is reused.
// ReBAC apps are skipped.
func InitBizAppDefaults(config *BizAppConfig) error {
	if config.ModelType == ModelTypeReBAC {
		return nil
	}
	role, err := GetBizRoleByName(config.Owner, config.AppName, DefaultAdminRoleName)
	if err != nil {
		return err
	}
	if role == nil {
		role = &BizRole{
			Organization: config.Owner,
			AppName:      config.AppName,
			Name:         DefaultAdminRoleName,
			ScopeKind:    BizRoleScopeApp,
			DisplayName:  "Administrator",
			IsEnabled:    true,
		}
		if _, err = AddBizRole(role); err != nil {
			return err
		}
	}

	perm, err := GetBizPermission(config.Owner, config.AppName, DefaultAdminPermissionName)
	if err != nil {
		return err
	}
	if perm == nil {
		perm = &BizPermission{
			Owner:       config.Owner,
			AppName:     config.AppName,
			Name:        DefaultAdminPermissionName,
			DisplayName: "Admin full access",
			Resources:   []string{".*"},
			Actions:     []string{".*"},
			Effect:      EffectAllow,
			IsEnabled:   true,
			State:       "Approved",
		}
		if _, err = AddBizPermission(perm); err != nil {
			return err
		}
	}

	_, err = AddBizPermissionGrantee(&BizPermissionGrantee{
		PermissionId: perm.Id,
		SubjectType:  BizPermGranteeRole,
		SubjectId:    DefaultAdminRoleName,
	}, "system")
	return err
}

func AddBizAppConfig(config *BizAppConfig) (bool, error) {
	if err := ValidatePolicyTable(config.PolicyTable); err != nil {
		return false, err
	}
	if err := ValidateBizModelText(config.ModelType, config.ModelText); err != nil {
		return false, err
	}

	config.PolicyVersion = 0
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
	if err := ValidateBizModelText(config.ModelType, config.ModelText); err != nil {
		return false, err
	}

	affected, err := ormer.Engine.ID(core.PK{owner, name}).AllCols().Omit("policy_version").Update(config)
	if err != nil {
		return false, err
	}

	if affected != 0 {
		syncBizPolicies(config.Owner, config.AppName)
	}

	return affected != 0, nil
}

// SetBizAppConfigAuthorizationModelId atomically advances only the
// CurrentAuthorizationModelId column on the app config row. It exists so the
// ReBAC save path can move the pointer without going through UpdateBizAppConfig,
// which runs ValidatePolicyTable + syncBizPolicies — both Casbin-lane ops that
// are wasted work on a ReBAC-modeled app (and a literal touch of the "Casbin
// path zero modifications" invariant from spec §13 Always).
func SetBizAppConfigAuthorizationModelId(owner, appName, modelId string) (bool, error) {
	if util.IsStringsEmpty(owner, appName) {
		return false, nil
	}
	affected, err := ormer.Engine.
		ID(core.PK{owner, appName}).
		Cols("current_authorization_model_id").
		Update(&BizAppConfig{CurrentAuthorizationModelId: modelId})
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}

// CompareAndSetBizAppConfigAuthorizationModelId advances the pointer only if
// the stored CurrentAuthorizationModelId still equals expected (an empty
// expected matches both ” and NULL). Returns false when the row's pointer
// changed (or the row is gone), without writing anything. Used by the ReBAC
// schema save/activate paths to close the concurrent-admin overwrite window
// (Plan R6).
func CompareAndSetBizAppConfigAuthorizationModelId(owner, appName, expected, modelId string) (bool, error) {
	if util.IsStringsEmpty(owner, appName) {
		return false, nil
	}
	sess := ormer.Engine.Table(&BizAppConfig{}).Where("owner = ? AND app_name = ?", owner, appName)
	if expected == "" {
		sess = sess.And("(current_authorization_model_id = '' OR current_authorization_model_id IS NULL)")
	} else {
		sess = sess.And("current_authorization_model_id = ?", expected)
	}
	affected, err := sess.Cols("current_authorization_model_id").Update(&BizAppConfig{CurrentAuthorizationModelId: modelId})
	if err != nil {
		return false, err
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
		// ReBAC cascade (spec §4.2, §4.3): tuples and authorization models are
		// per-app and have no standalone delete path, so they must be reaped
		// when the owning config disappears. Errors are swallowed so a
		// partially-cleaned row set can still be reported to the caller as
		// "config deleted" — the alternative is leaving the config half-gone
		// while surfacing a confusing error.
		_, _ = DeleteBizTuplesForApp(config.Owner, config.AppName)
		_, _ = DeleteBizAuthorizationModelsForApp(config.Owner, config.AppName)
	}

	return affected != 0, nil
}
