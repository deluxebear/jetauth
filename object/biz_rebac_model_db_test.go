// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestBizAuthorizationModel_InsertAndGet(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-test-org-" + util.GenerateUUID()[:8]
	appName := "rebac-test-app"
	m := &BizAuthorizationModel{
		Owner:       owner,
		AppName:     appName,
		SchemaDSL:   "model\n  schema 1.1\ntype user\n",
		SchemaJSON:  `{"schema_version":"1.1"}`,
		CreatedTime: util.GetCurrentTime(),
		CreatedBy:   "test",
	}
	ok, err := AddBizAuthorizationModel(m)
	if err != nil || !ok {
		t.Fatalf("add failed: ok=%v err=%v", ok, err)
	}
	if m.Id == "" {
		t.Fatalf("Id was not auto-assigned")
	}
	if m.SchemaHash == "" {
		t.Fatalf("SchemaHash was not auto-computed")
	}

	got, err := GetBizAuthorizationModel(m.Id)
	if err != nil {
		t.Fatalf("get failed: %v", err)
	}
	if got == nil || got.SchemaDSL != m.SchemaDSL {
		t.Fatalf("roundtrip mismatch: got=%v", got)
	}

	by, err := FindLatestBizAuthorizationModelByHash(owner, appName, m.SchemaHash)
	if err != nil || by == nil || by.Id != m.Id {
		t.Fatalf("hash lookup failed: got=%v err=%v", by, err)
	}

	_, _ = DeleteBizAuthorizationModelsForApp(owner, appName)
}
