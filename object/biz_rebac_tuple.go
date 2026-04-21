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

	"github.com/deluxebear/jetauth/util"
)

// BizTuple is an OpenFGA-compatible relationship triple: who (User) has what
// Relation to which Object inside a given StoreId.
//
// Per spec §4.3, tuples are immutable after insert: there is no UpdateBizTuple.
// Callers who need to change a tuple must delete-then-insert.
//
// Derived columns (ObjectType, UserType, UserRelation, StoreId) are computed by
// PopulateDerived and stored alongside the raw strings so that the database can
// answer both forward queries ("who can view document:doc-1?") and reverse
// queries ("what can user:alice view?") without re-parsing the triple on every
// read. idx_forward accelerates forward look-ups; idx_reverse accelerates
// reverse look-ups and userset expansion.
type BizTuple struct {
	Id      int64  `xorm:"pk autoincr" json:"-"`
	StoreId string `xorm:"varchar(200) notnull index(idx_forward) index(idx_reverse)" json:"storeId"`
	Owner   string `xorm:"varchar(100) notnull" json:"owner"`
	AppName string `xorm:"varchar(100) notnull" json:"appName"`

	Object   string `xorm:"varchar(256) notnull index(idx_forward)" json:"object"`
	Relation string `xorm:"varchar(100) notnull index(idx_forward)" json:"relation"`
	User     string `xorm:"varchar(256) notnull index(idx_reverse)" json:"user"`

	// Derived from Object/User by PopulateDerived; stored for query performance.
	ObjectType   string `xorm:"varchar(100) notnull index(idx_reverse)" json:"-"`
	UserType     string `xorm:"varchar(100) notnull index(idx_reverse)" json:"-"`
	UserRelation string `xorm:"varchar(100)" json:"-"`

	// ConditionName/ConditionContext hold the CEL condition name and its JSON
	// parameter context respectively. CEL evaluation is wired in CP-4 (Task 9);
	// this task only stores the strings so the schema is forward-compatible.
	ConditionName    string `xorm:"varchar(100)" json:"conditionName,omitempty"`
	ConditionContext string `xorm:"text" json:"conditionContext,omitempty"`

	AuthorizationModelId string `xorm:"varchar(40) notnull index" json:"authorizationModelId"`
	CreatedTime          string `xorm:"varchar(100)" json:"createdTime"`
}

// BuildStoreId constructs the canonical store identifier for (owner, appName).
// The "/" delimiter mirrors OpenFGA's store naming convention while staying
// compatible with JetAuth's owner/appName entity addressing (spec §4.3).
func BuildStoreId(owner, appName string) string {
	return owner + "/" + appName
}

// parseObjectString parses an OpenFGA object string of the form "type:id".
// Only the first colon is treated as a delimiter, so ids may themselves contain
// colons (e.g. "team:eng-team:sub" → type="team", id="eng-team:sub").
//
// Per spec §4.3 strong-compat requirement: empty type or empty id are both
// rejected as they cannot be round-tripped through the OpenFGA wire format.
func parseObjectString(s string) (objectType, objectId string, err error) {
	idx := strings.Index(s, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("object must be of form type:id, got %q", s)
	}
	objectType = s[:idx]
	objectId = s[idx+1:]
	if objectType == "" {
		return "", "", fmt.Errorf("object type cannot be empty in %q", s)
	}
	if objectId == "" {
		return "", "", fmt.Errorf("object id cannot be empty in %q", s)
	}
	return objectType, objectId, nil
}

// parseUserString parses an OpenFGA user string. Three forms are supported:
//
//	"user:alice"          → (user, alice, "")          plain subject
//	"user:*"              → (user, *, "")               type-level wildcard
//	"team:eng#member"     → (team, eng, member)         userset reference
//
// Parse order: # is processed first to extract the optional userRelation, then
// : is processed on the remaining prefix to split type and id.
func parseUserString(s string) (userType, userId, userRel string, err error) {
	// Step 1: strip optional userset relation (everything after the last #).
	if hashIdx := strings.LastIndex(s, "#"); hashIdx >= 0 {
		userRel = s[hashIdx+1:]
		if userRel == "" {
			return "", "", "", fmt.Errorf("user relation cannot be empty after # in %q", s)
		}
		s = s[:hashIdx]
	}

	// Step 2: split on first colon to get type and id.
	colonIdx := strings.Index(s, ":")
	if colonIdx < 0 {
		return "", "", "", fmt.Errorf("user must be of form type:id, got %q", s)
	}
	userType = s[:colonIdx]
	userId = s[colonIdx+1:]
	if userType == "" {
		return "", "", "", fmt.Errorf("user type cannot be empty in %q", s)
	}
	if userId == "" {
		return "", "", "", fmt.Errorf("user id cannot be empty in %q", s)
	}
	return userType, userId, userRel, nil
}

// PopulateDerived fills StoreId, ObjectType, UserType, and UserRelation from
// the raw triple fields (Owner/AppName/Object/User). It must be called before
// any insert so that the derived columns in idx_forward and idx_reverse are
// consistent with the raw strings.
//
// Returns an error — rather than panicking — when the raw fields are invalid so
// that the API layer can return a structured 400 response.
func (t *BizTuple) PopulateDerived() error {
	if t.Owner == "" || t.AppName == "" {
		return fmt.Errorf("tuple missing owner or appName")
	}

	objType, _, err := parseObjectString(t.Object)
	if err != nil {
		return fmt.Errorf("tuple object: %w", err)
	}

	uType, _, uRel, err := parseUserString(t.User)
	if err != nil {
		return fmt.Errorf("tuple user: %w", err)
	}

	t.StoreId = BuildStoreId(t.Owner, t.AppName)
	t.ObjectType = objType
	t.UserType = uType
	t.UserRelation = uRel
	return nil
}

// AddBizTuples batch-inserts a slice of tuples in a single engine call.
// PopulateDerived is called on each tuple before insert so derived columns are
// always consistent (spec §4.3). CreatedTime is auto-filled when left empty.
//
// An empty slice is a no-op — returns (0, nil) without touching the database.
func AddBizTuples(tuples []*BizTuple) (int64, error) {
	if len(tuples) == 0 {
		return 0, nil
	}
	now := util.GetCurrentTime()
	for _, tup := range tuples {
		if err := tup.PopulateDerived(); err != nil {
			return 0, err
		}
		if tup.CreatedTime == "" {
			tup.CreatedTime = now
		}
	}
	affected, err := ormer.Engine.Insert(&tuples)
	if err != nil {
		return 0, err
	}
	return affected, nil
}

// DeleteBizTuple removes the single tuple identified by the full key
// (owner/appName, object, relation, user). StoreId is derived from
// owner+appName so the caller never has to compute it separately.
//
// Returns the number of rows deleted (0 if no matching row existed).
func DeleteBizTuple(owner, appName, object, relation, user string) (int64, error) {
	storeId := BuildStoreId(owner, appName)
	affected, err := ormer.Engine.
		Where("store_id = ? AND object = ? AND relation = ? AND user = ?",
			storeId, object, relation, user).
		Delete(&BizTuple{})
	if err != nil {
		return 0, err
	}
	return affected, nil
}

// ReadBizTuples returns tuples matching the given filter. Empty strings are
// treated as wildcards. storeId is always applied as a filter so the query
// never crosses application boundaries.
func ReadBizTuples(owner, appName, object, relation, user string) ([]*BizTuple, error) {
	storeId := BuildStoreId(owner, appName)
	session := ormer.Engine.Where("store_id = ?", storeId)
	if object != "" {
		session = session.And("object = ?", object)
	}
	if relation != "" {
		session = session.And("relation = ?", relation)
	}
	if user != "" {
		session = session.And("user = ?", user)
	}
	tuples := []*BizTuple{}
	if err := session.Find(&tuples); err != nil {
		return nil, err
	}
	return tuples, nil
}

// ListBizTuplesForApp returns all tuples for (owner, appName). Used by
// administrative list endpoints and schema migration tooling.
func ListBizTuplesForApp(owner, appName string) ([]*BizTuple, error) {
	storeId := BuildStoreId(owner, appName)
	tuples := []*BizTuple{}
	if err := ormer.Engine.Where("store_id = ?", storeId).Find(&tuples); err != nil {
		return nil, err
	}
	return tuples, nil
}

// DeleteBizTuplesForApp removes ALL tuples for (owner, appName). This is the
// cascade path called when an application is torn down — it mirrors the
// equivalent function in biz_rebac_model.go (spec §4.3 cascade semantics).
func DeleteBizTuplesForApp(owner, appName string) (int64, error) {
	storeId := BuildStoreId(owner, appName)
	affected, err := ormer.Engine.
		Where("store_id = ?", storeId).
		Delete(&BizTuple{})
	if err != nil {
		return 0, err
	}
	return affected, nil
}
