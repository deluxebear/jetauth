// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestBizReBACAssertion_RoundTrip(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "drive_assertion"
	seedRebacAppConfigForTest(t, owner, appName)

	a := &BizReBACAssertion{
		Owner: owner, AppName: appName,
		Object: "document:roadmap-2026", Relation: "viewer", User: "user:carol",
		Expected: true,
	}
	if _, err := AddBizReBACAssertion(a); err != nil {
		t.Fatalf("AddBizReBACAssertion: %v", err)
	}
	got, err := ListBizReBACAssertions(owner, appName)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].User != "user:carol" {
		t.Fatalf("got %+v", got)
	}
}

func TestRunAssertion_PassAndFail(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	appName := "drive_assertion_run"
	seedRebacAppConfigForTest(t, owner, appName)

	if _, err := SaveAuthorizationModel(owner, appName,
		"model\n  schema 1.1\n\ntype user\n\ntype document\n  relations\n    define viewer: [user]\n",
		"test"); err != nil {
		t.Fatal(err)
	}
	storeId := BuildStoreId(owner, appName)
	if _, err := AddBizTuples([]*BizTuple{{
		StoreId: storeId, Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "viewer", User: "user:alice",
	}}); err != nil {
		t.Fatal(err)
	}

	pass := &BizReBACAssertion{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "viewer", User: "user:alice",
		Expected: true,
	}
	fail := &BizReBACAssertion{
		Owner: owner, AppName: appName,
		Object: "document:d1", Relation: "viewer", User: "user:bob",
		Expected: true, // bob isn't viewer — should report Pass=false
	}
	if _, err := AddBizReBACAssertion(pass); err != nil {
		t.Fatal(err)
	}
	if _, err := AddBizReBACAssertion(fail); err != nil {
		t.Fatal(err)
	}

	results, err := RunAssertionsForApp(owner, appName)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Fatalf("got %d results", len(results))
	}
	var passResult, failResult AssertionRunResult
	for _, r := range results {
		if r.User == "user:alice" {
			passResult = r
		}
		if r.User == "user:bob" {
			failResult = r
		}
	}
	if !passResult.Pass {
		t.Errorf("alice expected pass, got %+v", passResult)
	}
	if failResult.Pass {
		t.Errorf("bob expected fail, got %+v", failResult)
	}
}

func TestRunAssertion_EngineError(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	// Assertion against a (owner, appName) with no AppConfig / no model — the
	// engine should error out, RunAssertion should populate .Error and leave
	// .Pass == false rather than panicking.
	a := &BizReBACAssertion{
		Id:       util.GenerateUUID(),
		Owner:    "rebac-it-noexist-" + util.GenerateUUID()[:8],
		AppName:  "missing_app",
		Object:   "document:d1",
		Relation: "viewer",
		User:     "user:alice",
		Expected: true,
	}
	res := RunAssertion(a)
	if res.Error == "" {
		t.Errorf("expected engine error, got empty Error field; res=%+v", res)
	}
	if res.Pass {
		t.Errorf("expected Pass=false on engine error, got true")
	}
}
