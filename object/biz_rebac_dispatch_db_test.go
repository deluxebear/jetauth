// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//go:build !skipCi

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

// editorDSL is a minimal schema with a document type that has an `editor`
// relation restricted to `[user]`. Used by dispatch integration tests.
const editorDSL = `model
  schema 1.1

type user

type document
  relations
    define editor: [user]
`

// TestBizEnforceDispatch_ReBACApp verifies that BizEnforceWithKind routes
// to the ReBAC engine when ModelType is "rebac", returning allowed=true for
// a tuple that is present in the store.
func TestBizEnforceDispatch_ReBACApp(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "dispatch-it-" + util.GenerateUUID()[:8]
	appName := "app_dispatch_rebac"
	seedRebacAppConfigForTest(t, owner, appName)

	res, err := SaveAuthorizationModel(owner, appName, editorDSL, "test-user")
	if err != nil || res.Outcome != SaveOutcomeAdvanced {
		t.Fatalf("save editorDSL: err=%v outcome=%v", err, res)
	}
	modelId := res.AuthorizationModelId

	if _, err := AddBizTuples([]*BizTuple{{
		Owner:                owner,
		AppName:              appName,
		Object:               "document:d1",
		Relation:             "editor",
		User:                 "user:alice",
		AuthorizationModelId: modelId,
	}}); err != nil {
		t.Fatalf("add tuple: %v", err)
	}
	t.Cleanup(func() {
		_, _ = DeleteBizTuplesForApp(owner, appName)
	})

	allowed, kind, err := BizEnforceWithKind(owner, appName, []interface{}{"document:d1", "editor", "user:alice"})
	if err != nil {
		t.Fatalf("BizEnforceWithKind: %v", err)
	}
	if !allowed {
		t.Fatalf("want allowed=true, got false (kind=%v)", kind)
	}
	if kind != BizAuthzKindAllowed {
		t.Errorf("want kind=%v, got %v", BizAuthzKindAllowed, kind)
	}
}

// TestBizEnforceDispatch_CasbinUnchanged verifies that BizEnforceWithKind's
// existing Casbin path is unaffected by the dispatcher: an unknown app
// still returns the NotFound kind exactly as before.
func TestBizEnforceDispatch_CasbinUnchanged(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	_, kind, err := BizEnforceWithKind("no-such-org", "no-such-app", []interface{}{"obj", "rel", "user"})
	if kind != BizAuthzKindNotFound {
		t.Errorf("want kind=%v, got %v (err=%v)", BizAuthzKindNotFound, kind, err)
	}
	if err == nil {
		t.Error("want non-nil error for missing app")
	}
}
