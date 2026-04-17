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

const (
	BizRoleSubjectUser    = "user"
	BizRoleSubjectGroup   = "group"
	BizRoleSubjectUserset = "userset" // Reserved for ReBAC convergence; not resolved in phase 1
)

type BizRoleMember struct {
	RoleId      int64  `xorm:"pk notnull" json:"roleId"`
	SubjectType string `xorm:"pk varchar(20) notnull" json:"subjectType"`
	SubjectId   string `xorm:"pk varchar(200) notnull" json:"subjectId"`
	AddedTime   string `xorm:"varchar(100)" json:"addedTime"`
	AddedBy     string `xorm:"varchar(100)" json:"addedBy"`
}

func validateSubjectType(t string) error {
	switch t {
	case BizRoleSubjectUser, BizRoleSubjectGroup, BizRoleSubjectUserset:
		return nil
	}
	return fmt.Errorf("invalid subject_type %q", t)
}

// AddBizRoleMember inserts a (role, subject) membership. Idempotent on duplicate PK.
func AddBizRoleMember(m *BizRoleMember, addedBy string) (bool, error) {
	if err := validateSubjectType(m.SubjectType); err != nil {
		return false, err
	}
	if m.RoleId == 0 || m.SubjectId == "" {
		return false, fmt.Errorf("role_id and subject_id are required")
	}
	if m.AddedTime == "" {
		m.AddedTime = util.GetCurrentTime()
	}
	m.AddedBy = addedBy
	affected, err := ormer.Engine.Insert(m)
	return affected != 0, err
}

func RemoveBizRoleMember(roleId int64, subjectType, subjectId string) (bool, error) {
	if err := validateSubjectType(subjectType); err != nil {
		return false, err
	}
	affected, err := ormer.Engine.Where(
		"role_id = ? AND subject_type = ? AND subject_id = ?",
		roleId, subjectType, subjectId,
	).Delete(&BizRoleMember{})
	return affected != 0, err
}

// ListBizRoleMembers returns all direct members of a role (not transitive via
// inheritance; that's the sync engine's job).
func ListBizRoleMembers(roleId int64) ([]*BizRoleMember, error) {
	members := []*BizRoleMember{}
	err := ormer.Engine.Where("role_id = ?", roleId).Find(&members)
	return members, err
}

// ListBizRoleMembersPaged: UI-driven pagination for large rolls.
func ListBizRoleMembersPaged(roleId int64, offset, limit int) ([]*BizRoleMember, int64, error) {
	members := []*BizRoleMember{}
	total, err := ormer.Engine.Where("role_id = ?", roleId).Count(&BizRoleMember{})
	if err != nil {
		return nil, 0, err
	}
	err = ormer.Engine.Where("role_id = ?", roleId).Limit(limit, offset).Find(&members)
	return members, total, err
}

// ListUserRoles: "which roles does this user belong to in this org"
// Critical for /my-permissions page — must be indexed lookup, not full scan.
func ListUserRoles(org, userId string) ([]*BizRole, error) {
	// INNER JOIN biz_role ON member.role_id = biz_role.id
	// WHERE biz_role.organization = ? AND member.subject_type='user' AND member.subject_id = ?
	roles := []*BizRole{}
	err := ormer.Engine.
		Join("INNER", "biz_role_member", "biz_role_member.role_id = biz_role.id").
		Where("biz_role.organization = ? AND biz_role_member.subject_type = 'user' AND biz_role_member.subject_id = ?", org, userId).
		Find(&roles)
	return roles, err
}
