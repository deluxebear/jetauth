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

	"github.com/deluxebear/casdoor/util"
)

// Known sources for a catalog entry. Kept as strings so future additions
// (e.g. "sdk") do not require a schema migration.
const (
	BizResourceSourceManual  = "manual"
	BizResourceSourceOpenAPI = "openapi"
	BizResourceSourceTpl     = "template"
	BizResourceSourcePaste   = "paste"
)

// BizAppResource is a catalog entry describing one resource of a business
// application. The catalog is an authoring convenience — permissions still
// reference resources by string pattern, so the Casbin enforcement layer is
// unchanged. Entries live per (Owner, AppName) scope.
type BizAppResource struct {
	Id          int64  `xorm:"pk autoincr" json:"id"`
	Owner       string `xorm:"varchar(100) notnull unique(ux_biz_resource)" json:"owner"`
	AppName     string `xorm:"varchar(100) notnull unique(ux_biz_resource)" json:"appName"`
	Name        string `xorm:"varchar(100) notnull unique(ux_biz_resource)" json:"name"`
	Group       string `xorm:"varchar(100)" json:"group"`
	DisplayName string `xorm:"varchar(200)" json:"displayName"`
	Description string `xorm:"varchar(500)" json:"description"`
	Pattern     string `xorm:"varchar(500) notnull" json:"pattern"`
	Methods     string `xorm:"varchar(200)" json:"methods"`
	MatchMode   string `xorm:"varchar(20) default 'keyMatch2'" json:"matchMode"`
	Source      string `xorm:"varchar(20) default 'manual'" json:"source"`
	SourceRef   string `xorm:"varchar(300)" json:"sourceRef"`
	Deprecated  bool   `xorm:"notnull default false" json:"deprecated"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`
}

func validateBizAppResource(r *BizAppResource) error {
	if util.IsStringsEmpty(r.Owner, r.AppName, r.Name, r.Pattern) {
		return fmt.Errorf("owner, appName, name, pattern are required")
	}
	if r.MatchMode == "" {
		r.MatchMode = "keyMatch2"
	}
	switch r.MatchMode {
	case "keyMatch", "keyMatch2", "regex":
	default:
		return fmt.Errorf("invalid matchMode %q (expected keyMatch | keyMatch2 | regex)", r.MatchMode)
	}
	if r.Source == "" {
		r.Source = BizResourceSourceManual
	}
	r.Methods = normalizeMethods(r.Methods)
	return nil
}

// normalizeMethods uppercases comma-separated HTTP methods and drops blanks.
// Empty string is legal (means "any method").
func normalizeMethods(s string) string {
	if s == "" {
		return ""
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, p := range parts {
		v := strings.ToUpper(strings.TrimSpace(p))
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return strings.Join(out, ",")
}

// ListBizAppResources returns all catalog entries for (owner, appName),
// ordered by group then name for stable UI rendering. Deprecated entries
// are included so the admin can see and unmark them.
func ListBizAppResources(owner, appName string) ([]*BizAppResource, error) {
	resources := []*BizAppResource{}
	err := ormer.Engine.
		Where("owner = ? AND app_name = ?", owner, appName).
		Asc("group", "name").
		Find(&resources)
	return resources, err
}

// GetBizAppResourceById reads one entry by synthetic id. Returns (nil, nil)
// when missing so callers distinguish 404 from error.
func GetBizAppResourceById(id int64) (*BizAppResource, error) {
	r := BizAppResource{Id: id}
	existed, err := ormer.Engine.Get(&r)
	if err != nil || !existed {
		return nil, err
	}
	return &r, nil
}

// GetBizAppResourceByName looks up by natural key. Used by the import diff
// pass to decide update vs insert.
func GetBizAppResourceByName(owner, appName, name string) (*BizAppResource, error) {
	r := BizAppResource{Owner: owner, AppName: appName, Name: name}
	existed, err := ormer.Engine.Get(&r)
	if err != nil || !existed {
		return nil, err
	}
	return &r, nil
}

func AddBizAppResource(r *BizAppResource) (bool, error) {
	if err := validateBizAppResource(r); err != nil {
		return false, err
	}
	if r.CreatedTime == "" {
		r.CreatedTime = util.GetCurrentTime()
	}
	r.UpdatedTime = r.CreatedTime
	affected, err := ormer.Engine.Insert(r)
	return affected != 0, err
}

// UpdateBizAppResource updates by id. Owner/AppName/Name are immutable —
// attempts to change them via the update body are rejected to keep the
// natural key stable (permissions reference Pattern directly, but the
// catalog UI treats Name as the upsert key for imports).
func UpdateBizAppResource(id int64, r *BizAppResource) (bool, error) {
	if err := validateBizAppResource(r); err != nil {
		return false, err
	}
	existing, err := GetBizAppResourceById(id)
	if err != nil {
		return false, err
	}
	if existing == nil {
		return false, nil
	}
	if r.Owner != existing.Owner || r.AppName != existing.AppName || r.Name != existing.Name {
		return false, fmt.Errorf("cannot change owner, appName, or name via update (id=%d)", id)
	}
	r.Id = id
	r.CreatedTime = existing.CreatedTime
	r.UpdatedTime = util.GetCurrentTime()
	affected, err := ormer.Engine.ID(id).AllCols().Update(r)
	return affected != 0, err
}

func DeleteBizAppResource(id int64) (bool, error) {
	affected, err := ormer.Engine.ID(id).Delete(&BizAppResource{})
	return affected != 0, err
}
