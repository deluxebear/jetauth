// Copyright 2025 The Casdoor Authors. All Rights Reserved.
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

package object

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestLarkGroupSync(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/open-apis/auth/v3/tenant_access_token/internal", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"code":0,"msg":"ok","tenant_access_token":"tok"}`)
	})
	mux.HandleFunc("/open-apis/contact/v3/departments", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			fmt.Fprint(w, `{"code":99991663,"msg":"invalid token"}`)
			return
		}
		if r.URL.Query().Get("page_token") == "p2" {
			fmt.Fprint(w, `{"code":0,"data":{"items":[{"department_id":"d2","open_department_id":"od_2","name":"Ops"}],"has_more":false}}`)
			return
		}
		fmt.Fprint(w, `{"code":0,"data":{"items":[{"department_id":"d1","open_department_id":"od_1","name":"Dev","leader_user_id":"alice"}],"has_more":true,"page_token":"p2"}}`)
	})
	mux.HandleFunc("/open-apis/contact/v3/users/find_by_department", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"code":0,"data":{"items":[{"user_id":"alice","name":"Alice","department_ids":["od_1","od_2","0"]}],"has_more":false}}`)
	})
	mux.HandleFunc("/open-apis/contact/v3/users/bob", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"code":0,"data":{"user":{"user_id":"bob","department_ids":["od_2"]}}}`)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	p := &LarkSyncerProvider{Syncer: &Syncer{Host: srv.URL, User: "app", Password: "sec"}}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].Name != "od_1" || groups[0].DisplayName != "Dev" || groups[0].Manager != "alice" || groups[1].Name != "od_2" {
		t.Fatalf("unexpected groups: %+v", groups)
	}

	users, err := p.GetOriginalUsers()
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || !reflect.DeepEqual(users[0].Groups, []string{"od_1", "od_2"}) {
		t.Fatalf("unexpected users: %+v", users)
	}

	ids, err := p.GetOriginalUserGroups("bob")
	if err != nil || !reflect.DeepEqual(ids, []string{"od_2"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}
}
