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

package controllers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/beego/beego/v2/server/web/context"
)

func newPermissionOperatorController(sessionUser, target string) *ApiController {
	req := httptest.NewRequest(http.MethodPost, target, nil)
	ctx := context.NewContext()
	ctx.Reset(httptest.NewRecorder(), req)
	if sessionUser != "" {
		ctx.Input.SetData("currentUserId", sessionUser)
	}
	c := &ApiController{}
	c.Ctx = ctx
	c.Data = map[interface{}]interface{}{}
	return c
}

// M5: an application session acts as itself and cannot pick the operator through ?userId=.
func TestRequirePermissionOperatorAppSession(t *testing.T) {
	c := newPermissionOperatorController("app/app-m2m", "/api/add-permission?userId=org1/victim-admin")

	operatorId, ok := c.requirePermissionOperator()
	if !ok {
		t.Fatal("an application session must be accepted")
	}
	if operatorId != "app/app-m2m" {
		t.Fatalf("operator = %q, want the application identity, never the userId parameter", operatorId)
	}
}
