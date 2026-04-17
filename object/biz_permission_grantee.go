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

	"github.com/deluxebear/jetauth/util"
)

// Grantee subject-type constants. A permission is granted TO a subject of one
// of these kinds. "userset" is reserved for ReBAC phase 2; it is accepted by
// validation today but has no engine support yet.
const (
	BizPermGranteeUser    = "user"
	BizPermGranteeGroup   = "group"
	BizPermGranteeRole    = "role"
	BizPermGranteeUserset = "userset"
)

// BizPermissionGrantee is an edge in the permission→subject bipartite graph.
// Composite PK (PermissionId, SubjectType, SubjectId) is self-unique — no
// additional unique tag needed. The PK also backs forward lookups
// ("who has permission X?"); reverse lookups ("what perms does role Y have?")
// go through the secondary index on (SubjectType, SubjectId).
type BizPermissionGrantee struct {
	PermissionId int64  `xorm:"pk notnull" json:"permissionId"`
	SubjectType  string `xorm:"pk varchar(20) notnull index(ix_grantee_reverse)" json:"subjectType"`
	SubjectId    string `xorm:"pk varchar(200) notnull index(ix_grantee_reverse)" json:"subjectId"`
	AddedTime    string `xorm:"varchar(100)" json:"addedTime"`
	AddedBy      string `xorm:"varchar(100)" json:"addedBy"`
}

func validateGranteeSubjectType(t string) error {
	switch t {
	case BizPermGranteeUser, BizPermGranteeGroup, BizPermGranteeRole, BizPermGranteeUserset:
		return nil
	}
	return fmt.Errorf("invalid grantee subject_type %q", t)
}

// AddBizPermissionGrantee is idempotent: re-adding an existing edge is a no-op
// that returns (true, nil). We pre-check with Get so duplicate PK collisions
// from concurrent writers don't surface as errors to the caller.
func AddBizPermissionGrantee(g *BizPermissionGrantee, addedBy string) (bool, error) {
	if err := validateGranteeSubjectType(g.SubjectType); err != nil {
		return false, err
	}
	if g.PermissionId == 0 || g.SubjectId == "" {
		return false, fmt.Errorf("permission_id and subject_id are required")
	}

	existing := &BizPermissionGrantee{
		PermissionId: g.PermissionId,
		SubjectType:  g.SubjectType,
		SubjectId:    g.SubjectId,
	}
	found, err := ormer.Engine.Get(existing)
	if err != nil {
		return false, err
	}
	if found {
		return true, nil
	}

	if g.AddedTime == "" {
		g.AddedTime = util.GetCurrentTime()
	}
	g.AddedBy = addedBy
	affected, err := ormer.Engine.Insert(g)
	if err != nil {
		return false, err
	}
	if affected != 0 {
		syncAffectedAppsByPermissionId(g.PermissionId)
	}
	return affected != 0, nil
}

func RemoveBizPermissionGrantee(permissionId int64, subjectType, subjectId string) (bool, error) {
	if err := validateGranteeSubjectType(subjectType); err != nil {
		return false, err
	}
	affected, err := ormer.Engine.Where(
		"permission_id = ? AND subject_type = ? AND subject_id = ?",
		permissionId, subjectType, subjectId,
	).Delete(&BizPermissionGrantee{})
	if err != nil {
		return false, err
	}
	if affected != 0 {
		syncAffectedAppsByPermissionId(permissionId)
	}
	return affected != 0, nil
}

// ListBizPermissionGrantees returns every grantee edge for one permission.
func ListBizPermissionGrantees(permissionId int64) ([]*BizPermissionGrantee, error) {
	out := []*BizPermissionGrantee{}
	err := ormer.Engine.Where("permission_id = ?", permissionId).Find(&out)
	return out, err
}

// ListBizPermissionGranteesPaged returns a page of grantee rows plus the total
// count, for paginated UIs on the permission detail screen.
func ListBizPermissionGranteesPaged(permissionId int64, offset, limit int) ([]*BizPermissionGrantee, int64, error) {
	total, err := ormer.Engine.Where("permission_id = ?", permissionId).Count(&BizPermissionGrantee{})
	if err != nil {
		return nil, 0, err
	}
	out := []*BizPermissionGrantee{}
	err = ormer.Engine.Where("permission_id = ?", permissionId).Limit(limit, offset).Find(&out)
	return out, total, err
}

// ListPermissionsGrantedToRole answers "what can role X do in org Y?" via an
// indexed INNER JOIN on biz_permission_grantee. This is the star reverse-lookup
// that the JSON-array implementation could not do efficiently.
func ListPermissionsGrantedToRole(org, roleName string) ([]*BizPermission, error) {
	out := []*BizPermission{}
	err := ormer.Engine.
		Join("INNER", "biz_permission_grantee",
			"biz_permission.id = biz_permission_grantee.permission_id").
		Where("biz_permission.owner = ? AND biz_permission_grantee.subject_type = ? AND biz_permission_grantee.subject_id = ?",
			org, BizPermGranteeRole, roleName).
		Find(&out)
	return out, err
}

// ListPermissionsGrantedToUser returns only direct user grants. "Effective"
// permissions of a user (direct + via role) are computed by the caller by
// combining this with ListUserRoles → ListPermissionsGrantedToRole.
func ListPermissionsGrantedToUser(org, userId string) ([]*BizPermission, error) {
	out := []*BizPermission{}
	err := ormer.Engine.
		Join("INNER", "biz_permission_grantee",
			"biz_permission.id = biz_permission_grantee.permission_id").
		Where("biz_permission.owner = ? AND biz_permission_grantee.subject_type = ? AND biz_permission_grantee.subject_id = ?",
			org, BizPermGranteeUser, userId).
		Find(&out)
	return out, err
}

// syncAffectedAppsByPermissionId kicks off an async Casbin rebuild for the
// single app that owns the permission. Permissions are app-local, so a
// grantee change never affects other apps.
func syncAffectedAppsByPermissionId(permissionId int64) {
	perm, err := getBizPermissionById(permissionId)
	if err != nil || perm == nil {
		return
	}
	go func(owner, appName string) {
		_, _ = SyncAppPolicies(owner, appName)
	}(perm.Owner, perm.AppName)
}
