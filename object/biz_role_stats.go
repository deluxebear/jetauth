// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

// BizRoleStats aggregates counters for a single role, used by the detail page
// to render overview cards without the N+1 that would otherwise come from the
// UI calling list-members / list-permissions / list-parents / list-children
// just to read their lengths. All counts are derived state and not stored.
type BizRoleStats struct {
	RoleId           int64  `json:"roleId" example:"1042"`
	MemberCount      int64  `json:"memberCount" example:"12"`
	UserMemberCount  int64  `json:"userMemberCount" example:"10"`
	GroupMemberCount int64  `json:"groupMemberCount" example:"2"`
	ParentRoleCount  int64  `json:"parentRoleCount" example:"2"`
	ChildRoleCount   int64  `json:"childRoleCount" example:"0"`
	PermissionCount  int64  `json:"permissionCount" example:"5"`
	LastUpdatedTime  string `json:"lastUpdatedTime" example:"2026-04-15T08:21:34Z"`
}

// GetBizRoleStats computes the aggregate counters for a role. Queries run
// sequentially since each is a single-row COUNT on an indexed column
// (sub-millisecond each) — the cost is dominated by round-trip overhead,
// not query time, so parallelism would not meaningfully help.
//
// Returns (nil, nil) when the role does not exist so callers can distinguish
// "missing" from an error without another lookup.
func GetBizRoleStats(roleId int64) (*BizRoleStats, error) {
	role, err := getBizRoleById(roleId)
	if err != nil {
		return nil, err
	}
	if role == nil {
		return nil, nil
	}

	stats := &BizRoleStats{
		RoleId:          roleId,
		LastUpdatedTime: role.UpdatedTime,
	}

	// Members by subject type. One query returning rows grouped by
	// subject_type avoids two separate round-trips.
	type memberRow struct {
		SubjectType string
		C           int64
	}
	memberRows := []memberRow{}
	if err := ormer.Engine.Table(&BizRoleMember{}).
		Select("subject_type, COUNT(*) AS c").
		Where("role_id = ?", roleId).
		GroupBy("subject_type").
		Find(&memberRows); err != nil {
		return nil, err
	}
	for _, r := range memberRows {
		stats.MemberCount += r.C
		switch r.SubjectType {
		case BizRoleSubjectUser:
			stats.UserMemberCount = r.C
		case BizRoleSubjectGroup:
			stats.GroupMemberCount = r.C
		}
	}

	// Parent count: inheritance edges where this role is the child.
	parentCount, err := ormer.Engine.Where("child_role_id = ?", roleId).Count(&BizRoleInheritance{})
	if err != nil {
		return nil, err
	}
	stats.ParentRoleCount = parentCount

	// Child count: inheritance edges where this role is the parent.
	childCount, err := ormer.Engine.Where("parent_role_id = ?", roleId).Count(&BizRoleInheritance{})
	if err != nil {
		return nil, err
	}
	stats.ChildRoleCount = childCount

	// Permission count: grantees key role-grants by role NAME (not id) under
	// subject_type='role'. Must filter by role name.
	permCount, err := ormer.Engine.
		Where("subject_type = ? AND subject_id = ?", BizPermGranteeRole, role.Name).
		Count(&BizPermissionGrantee{})
	if err != nil {
		return nil, err
	}
	stats.PermissionCount = permCount

	return stats, nil
}
