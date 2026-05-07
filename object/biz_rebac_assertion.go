// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"errors"
	"fmt"

	"github.com/deluxebear/jetauth/util"
)

// ErrAssertionNotFound is returned when an assertion id doesn't exist
// or belongs to a different (owner, appName). Cross-tenant invisibility
// matches the convention from BizAuthorizationModel — admins can't probe
// other stores via the assertion endpoints.
var ErrAssertionNotFound = errors.New("assertion not found")

// BizReBACAssertion is one frozen test case for a ReBAC app: a
// (object, relation, user) tuple plus the expected Check outcome.
// Running the assertion fires an internal Check and compares.
//
// Indexed by (owner, app_name) — the run-all endpoint reads every row
// for the app in one query and executes them sequentially.
type BizReBACAssertion struct {
	Id          string `xorm:"varchar(40) pk" json:"id"`
	Owner       string `xorm:"varchar(100) notnull index(idx_assert_store)" json:"owner"`
	AppName     string `xorm:"varchar(100) notnull index(idx_assert_store)" json:"appName"`
	Object      string `xorm:"varchar(200) notnull" json:"object"`
	Relation    string `xorm:"varchar(100) notnull" json:"relation"`
	User        string `xorm:"varchar(200) notnull" json:"user"`
	Expected    bool   `xorm:"notnull" json:"expected"`
	Description string `xorm:"varchar(500)" json:"description,omitempty"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	CreatedBy   string `xorm:"varchar(200)" json:"createdBy"`

	// Last-run snapshot — refreshed by RunAssertion. Not the source of
	// truth for the bulk runner (which always re-checks); the columns
	// exist so the list UI can show the most recent verdict without
	// running every time.
	LastActual  *bool  `xorm:"null" json:"lastActual,omitempty"`
	LastRunTime string `xorm:"varchar(100)" json:"lastRunTime,omitempty"`
}

func (a *BizReBACAssertion) GetId() string { return a.Id }

func AddBizReBACAssertion(a *BizReBACAssertion) (bool, error) {
	if a.Id == "" {
		a.Id = util.GenerateUUID()
	}
	if a.CreatedTime == "" {
		a.CreatedTime = util.GetCurrentTime()
	}
	affected, err := ormer.Engine.Insert(a)
	if err != nil {
		return false, fmt.Errorf("insert assertion: %w", err)
	}
	return affected != 0, nil
}

func GetBizReBACAssertion(id string) (*BizReBACAssertion, error) {
	if id == "" {
		return nil, nil
	}
	a := BizReBACAssertion{Id: id}
	existed, err := ormer.Engine.Get(&a)
	if err != nil {
		return nil, err
	}
	if !existed {
		return nil, nil
	}
	return &a, nil
}

func ListBizReBACAssertions(owner, appName string) ([]*BizReBACAssertion, error) {
	out := []*BizReBACAssertion{}
	err := ormer.Engine.
		Where("owner = ? AND app_name = ?", owner, appName).
		Asc("created_time").
		Find(&out)
	return out, err
}

func DeleteBizReBACAssertion(owner, appName, id string) error {
	a, err := GetBizReBACAssertion(id)
	if err != nil {
		return err
	}
	if a == nil || a.Owner != owner || a.AppName != appName {
		return ErrAssertionNotFound
	}
	_, err = ormer.Engine.ID(id).Delete(&BizReBACAssertion{})
	return err
}

// AssertionRunResult is one row of the bulk-run output. Pass=true when
// actual matches expected. Error is set if the engine itself failed
// (cycle, schema mismatch, etc.) — those are reported separately so the
// admin UI can show "X passed, Y failed, Z errored".
type AssertionRunResult struct {
	Id       string `json:"id"`
	Object   string `json:"object"`
	Relation string `json:"relation"`
	User     string `json:"user"`
	Expected bool   `json:"expected"`
	Actual   bool   `json:"actual"`
	Pass     bool   `json:"pass"`
	Error    string `json:"error,omitempty"`
}

// RunAssertion executes one assertion via the internal ReBACCheck engine
// (no HTTP round-trip). Updates the LastActual/LastRunTime columns on the
// row so the list UI can display the most recent verdict.
func RunAssertion(a *BizReBACAssertion) AssertionRunResult {
	storeId := BuildStoreId(a.Owner, a.AppName)
	req := &CheckRequest{
		StoreId: storeId,
		TupleKey: TupleKey{
			Object: a.Object, Relation: a.Relation, User: a.User,
		},
	}
	res, err := ReBACCheck(req)
	out := AssertionRunResult{
		Id: a.Id, Object: a.Object, Relation: a.Relation,
		User: a.User, Expected: a.Expected,
	}
	if err != nil {
		out.Error = err.Error()
		return out
	}
	out.Actual = res.Allowed
	out.Pass = (out.Actual == out.Expected)

	// Update last-run columns. Best-effort — a failure here doesn't
	// invalidate the assertion result, just the cached label.
	// Copy out.Actual into a local so LastActual doesn't alias the
	// stack-allocated AssertionRunResult that the caller receives by value.
	actual := out.Actual
	a.LastActual = &actual
	a.LastRunTime = util.GetCurrentTime()
	_, _ = ormer.Engine.ID(a.Id).Cols("last_actual", "last_run_time").Update(a)

	return out
}

// RunAssertionsForApp executes every assertion for (owner, appName)
// sequentially and returns the result list. Sequential is fine — admin
// pages have ≤50 assertions in practice; parallelisation would
// complicate cycle-detection state across goroutines.
func RunAssertionsForApp(owner, appName string) ([]AssertionRunResult, error) {
	list, err := ListBizReBACAssertions(owner, appName)
	if err != nil {
		return nil, err
	}
	out := make([]AssertionRunResult, 0, len(list))
	for _, a := range list {
		out = append(out, RunAssertion(a))
	}
	return out, nil
}
