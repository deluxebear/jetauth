// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

// BizPermissionStats aggregates counters for a single permission's detail
// page. Grantees are broken down by subject type so the UI can render the
// `👥 N 授权` pill with a 3-way split tooltip without extra round-trips.
type BizPermissionStats struct {
	PermissionId      int64  `json:"permissionId" example:"42"`
	GranteeCount      int64  `json:"granteeCount" example:"23"`
	UserGranteeCount  int64  `json:"userGranteeCount" example:"15"`
	GroupGranteeCount int64  `json:"groupGranteeCount" example:"5"`
	RoleGranteeCount  int64  `json:"roleGranteeCount" example:"3"`
	ResourceCount     int    `json:"resourceCount" example:"3"`
	ActionCount       int    `json:"actionCount" example:"4"`
	LastUpdatedTime   string `json:"lastUpdatedTime" example:"2026-04-15T08:21:34Z"`
}

// GetBizPermissionStats returns derived counters for a permission. One
// grouped COUNT query covers all three grantee subject types; resource and
// action counts come free from the permission row itself. Returns
// (nil, nil) when the permission does not exist.
func GetBizPermissionStats(permissionId int64) (*BizPermissionStats, error) {
	perm, err := getBizPermissionById(permissionId)
	if err != nil {
		return nil, err
	}
	if perm == nil {
		return nil, nil
	}

	stats := &BizPermissionStats{
		PermissionId:    permissionId,
		ResourceCount:   len(perm.Resources),
		ActionCount:     len(perm.Actions),
		LastUpdatedTime: perm.UpdatedTime,
	}

	type row struct {
		SubjectType string
		C           int64
	}
	rows := []row{}
	if err := ormer.Engine.Table(&BizPermissionGrantee{}).
		Select("subject_type, COUNT(*) AS c").
		Where("permission_id = ?", permissionId).
		GroupBy("subject_type").
		Find(&rows); err != nil {
		return nil, err
	}
	for _, r := range rows {
		stats.GranteeCount += r.C
		switch r.SubjectType {
		case BizPermGranteeUser:
			stats.UserGranteeCount = r.C
		case BizPermGranteeGroup:
			stats.GroupGranteeCount = r.C
		case BizPermGranteeRole:
			stats.RoleGranteeCount = r.C
		}
	}
	return stats, nil
}
