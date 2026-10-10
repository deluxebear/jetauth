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
	"sort"
	"testing"
)

func TestWecomGroupSync(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/cgi-bin/gettoken", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("corpid") != "corp" || r.URL.Query().Get("corpsecret") != "sec" {
			fmt.Fprint(w, `{"errcode":40013,"errmsg":"invalid corpid"}`)
			return
		}
		fmt.Fprint(w, `{"errcode":0,"errmsg":"ok","access_token":"tok"}`)
	})
	mux.HandleFunc("/cgi-bin/department/list", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"errcode":0,"errmsg":"ok","department":[{"id":1,"name":"Root","parentid":0},{"id":2,"name":"Dev","parentid":1}]}`)
	})
	mux.HandleFunc("/cgi-bin/user/list", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("department_id") {
		case "1":
			fmt.Fprint(w, `{"errcode":0,"userlist":[{"userid":"alice","name":"Alice","department":[1,2],"status":1,"enable":1}]}`)
		default:
			fmt.Fprint(w, `{"errcode":0,"userlist":[{"userid":"alice","name":"Alice","department":[1,2],"status":1,"enable":1},{"userid":"bob","name":"Bob","department":[2],"status":1,"enable":1}]}`)
		}
	})
	mux.HandleFunc("/cgi-bin/user/get", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"errcode":0,"department":[2]}`)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	old := wecomBaseUrl
	wecomBaseUrl = srv.URL
	defer func() { wecomBaseUrl = old }()

	p := &WecomSyncerProvider{Syncer: &Syncer{User: "corp", Password: "sec"}}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].Name != "1" || groups[1].Name != "2" || groups[1].DisplayName != "Dev" {
		t.Fatalf("unexpected groups: %+v", groups)
	}

	users, err := p.GetOriginalUsers()
	if err != nil {
		t.Fatal(err)
	}
	m := map[string][]string{}
	for _, u := range users {
		sort.Strings(u.Groups)
		m[u.Id] = u.Groups
	}
	if !reflect.DeepEqual(m["alice"], []string{"1", "2"}) || !reflect.DeepEqual(m["bob"], []string{"2"}) {
		t.Fatalf("unexpected membership: %v", m)
	}

	ids, err := p.GetOriginalUserGroups("bob")
	if err != nil || !reflect.DeepEqual(ids, []string{"2"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}

	bad := &WecomSyncerProvider{Syncer: &Syncer{User: "x", Password: "y"}}
	if _, err = bad.GetOriginalGroups(); err == nil {
		t.Fatal("expected token error")
	}
}
