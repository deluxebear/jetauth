// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"github.com/deluxebear/jetauth/util"
)

// AuditFilter narrows the audit list endpoint to write-only or delete-only
// events. Empty string means "all". Concrete strings double as the JSON
// query-param values to keep the controller and store in lock-step.
type AuditFilter string

const (
	AuditFilterAll    AuditFilter = ""
	AuditFilterWrite  AuditFilter = "write"
	AuditFilterDelete AuditFilter = "delete"
)

// BizReBACTupleAudit is one immutable record of a write or delete
// against a ReBAC tuple. Indexed by (owner, app_name) for the per-app
// list view and by at_time for the 90-day retention sweep. ActorUser
// is the JetAuth admin who triggered the write — empty when the call
// came from a non-session code path.
type BizReBACTupleAudit struct {
	Id        int64  `xorm:"bigint pk autoincr" json:"id"`
	Owner     string `xorm:"varchar(100) notnull index(idx_audit_store)" json:"owner"`
	AppName   string `xorm:"varchar(100) notnull index(idx_audit_store)" json:"appName"`
	Op        string `xorm:"varchar(10) notnull" json:"op"` // "write" | "delete"
	Object    string `xorm:"varchar(255) notnull" json:"object"`
	Relation  string `xorm:"varchar(100) notnull" json:"relation"`
	User      string `xorm:"varchar(255) notnull" json:"user"`
	ActorUser string `xorm:"varchar(200)" json:"actorUser,omitempty"`
	AtTime    string `xorm:"varchar(100) notnull index" json:"atTime"`
}

func AddBizReBACTupleAudit(a *BizReBACTupleAudit) (int64, error) {
	if a.AtTime == "" {
		a.AtTime = util.GetCurrentTime()
	}
	affected, err := ormer.Engine.Insert(a)
	if err != nil {
		return 0, err
	}
	return affected, nil
}

// ListTupleAuditForApp returns audit rows for (owner, appName) ordered
// most-recent-first. limit is hard-capped at 1000 to prevent admin-UI
// pagination misuse from blowing up the server.
func ListTupleAuditForApp(owner, appName string, filter AuditFilter, offset, limit int) ([]*BizReBACTupleAudit, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	out := []*BizReBACTupleAudit{}
	s := ormer.Engine.Where("owner = ? AND app_name = ?", owner, appName)
	if filter != AuditFilterAll {
		s = s.And("op = ?", string(filter))
	}
	err := s.Desc("at_time").Limit(limit, offset).Find(&out)
	return out, err
}

// PurgeTupleAuditOlderThan deletes audit rows whose at_time is strictly
// less than the given ISO timestamp. Used by the 90-day retention sweeper
// (B3). Returns the number of rows deleted.
func PurgeTupleAuditOlderThan(cutoffISO string) (int64, error) {
	affected, err := ormer.Engine.
		Where("at_time < ?", cutoffISO).
		Delete(&BizReBACTupleAudit{})
	return affected, err
}
