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
)

// BizPermission is a business-scoped permission rule. The synthetic Id is the
// stable primary key; (Owner, AppName, Name) is enforced unique via
// ux_biz_perm. Subject grants (users, groups, roles) now live in the
// biz_permission_grantee relational table; Resources/Actions remain JSON
// arrays as they are small, permission-local, and not joined to.
type BizPermission struct {
	Id          int64  `xorm:"pk autoincr" json:"id"`
	Owner       string `xorm:"varchar(100) notnull unique(ux_biz_perm)" json:"owner"`
	AppName     string `xorm:"varchar(100) notnull unique(ux_biz_perm)" json:"appName"`
	Name        string `xorm:"varchar(100) notnull unique(ux_biz_perm)" json:"name"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	DisplayName string `xorm:"varchar(100)" json:"displayName"`
	Description string `xorm:"varchar(500)" json:"description"`

	// Grantees (Users + Roles) moved to biz_permission_grantee table.

	Resources []string `xorm:"mediumtext" json:"resources"`
	Actions   []string `xorm:"mediumtext" json:"actions"`
	Effect    string   `xorm:"varchar(20)" json:"effect"` // Allow / Deny
	IsEnabled bool     `json:"isEnabled"`

	// Approval workflow
	Submitter   string `xorm:"varchar(100)" json:"submitter"`
	Approver    string `xorm:"varchar(100)" json:"approver"`
	ApproveTime string `xorm:"varchar(100)" json:"approveTime"`
	State       string `xorm:"varchar(20)" json:"state"` // Approved / Pending / Rejected

	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`

	// Derived stats populated by enrichBizPermissions for list responses.
	GranteeCount int64 `xorm:"-" json:"granteeCount"`
}

func (p *BizPermission) GetId() string {
	return util.GetSessionId(p.Owner, p.Name, p.AppName)
}

// GetBizPermissions lists all permissions for a business app, ordered by most
// recently created first.
func GetBizPermissions(owner, appName string) ([]*BizPermission, error) {
	perms := []*BizPermission{}
	err := ormer.Engine.Desc("created_time").Find(&perms, &BizPermission{Owner: owner, AppName: appName})
	if err != nil {
		return nil, err
	}
	if err := enrichBizPermissions(perms); err != nil {
		return perms, nil
	}
	return perms, nil
}

// enrichBizPermissions fills GranteeCount via a single grouped count query.
func enrichBizPermissions(perms []*BizPermission) error {
	if len(perms) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(perms))
	byId := make(map[int64]*BizPermission, len(perms))
	for _, p := range perms {
		ids = append(ids, p.Id)
		byId[p.Id] = p
	}
	type row struct {
		PermissionId int64
		C            int64
	}
	rows := []row{}
	err := ormer.Engine.Table(&BizPermissionGrantee{}).
		Select("permission_id, COUNT(*) AS c").
		In("permission_id", ids).
		GroupBy("permission_id").
		Find(&rows)
	if err != nil {
		return err
	}
	for _, r := range rows {
		if p, ok := byId[r.PermissionId]; ok {
			p.GranteeCount = r.C
		}
	}
	return nil
}

// GetBizPermission looks up a permission by its natural key (owner, app, name).
// Prefer getBizPermissionById internally where an id is already known.
func GetBizPermission(owner, appName, name string) (*BizPermission, error) {
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

// getBizPermissionById is the id-based lookup used by all CRUD paths.
func getBizPermissionById(id int64) (*BizPermission, error) {
	p := BizPermission{Id: id}
	existed, err := ormer.Engine.Get(&p)
	if err != nil || !existed {
		return nil, err
	}
	return &p, nil
}

// GetBizPermissionById is the exported id-based lookup used by HTTP handlers.
// Returns (nil, nil) if not found so callers can distinguish "missing" from error.
func GetBizPermissionById(id int64) (*BizPermission, error) {
	return getBizPermissionById(id)
}

func AddBizPermission(perm *BizPermission) (bool, error) {
	if err := validateBizPermission(perm); err != nil {
		return false, err
	}
	if perm.CreatedTime == "" {
		perm.CreatedTime = util.GetCurrentTime()
	}
	perm.UpdatedTime = perm.CreatedTime
	affected, err := ormer.Engine.Insert(perm)
	if err != nil {
		return false, err
	}
	if affected != 0 {
		syncAffectedAppsByPermissionId(perm.Id)
	}
	return affected != 0, nil
}

// UpdateBizPermission updates an existing permission identified by its
// synthetic id. Owner and AppName are immutable — attempts to change them
// via the update body are rejected.
func UpdateBizPermission(id int64, perm *BizPermission) (bool, error) {
	if err := validateBizPermission(perm); err != nil {
		return false, err
	}

	existing, err := getBizPermissionById(id)
	if err != nil {
		return false, err
	}
	if existing == nil {
		return false, nil
	}

	// Lock immutable fields
	if perm.Owner != existing.Owner || perm.AppName != existing.AppName {
		return false, fmt.Errorf("cannot change owner or appName via update (id=%d)", id)
	}

	perm.Id = id
	perm.UpdatedTime = util.GetCurrentTime()
	affected, err := ormer.Engine.ID(id).AllCols().Update(perm)
	if err != nil {
		return false, err
	}
	if affected != 0 {
		syncAffectedAppsByPermissionId(id)
	}
	return affected != 0, nil
}

// DeleteBizPermission removes a permission by id, cascading all rows in
// biz_permission_grantee that reference it before deleting the permission
// itself.
func DeleteBizPermission(id int64) (bool, error) {
	perm, err := getBizPermissionById(id)
	if err != nil {
		return false, err
	}
	if perm == nil {
		return false, nil
	}

	// Cascade grantees first so we never leave orphaned grant rows.
	if _, err := ormer.Engine.Where("permission_id = ?", id).Delete(&BizPermissionGrantee{}); err != nil {
		return false, err
	}

	affected, err := ormer.Engine.ID(id).Delete(&BizPermission{})
	if err != nil {
		return false, err
	}
	if affected != 0 {
		go func(owner, appName string) {
			_, _ = SyncAppPolicies(owner, appName)
		}(perm.Owner, perm.AppName)
	}
	return affected != 0, nil
}
