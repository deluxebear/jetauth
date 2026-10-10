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

func TestSCIMGroupSync(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/scim/v2/Users", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, `{"totalResults":2,"Resources":[{"id":"u1","userName":"a","active":true},{"id":"u2","userName":"b","active":true}]}`)
	})
	mux.HandleFunc("/scim/v2/Groups", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Query().Get("startIndex") {
		case "1":
			fmt.Fprint(w, `{"totalResults":2,"Resources":[{"id":"g1","displayName":"Dev","members":[{"value":"u1","type":"User"},{"value":"u2"}]}]}`)
		default:
			fmt.Fprint(w, `{"totalResults":2,"Resources":[{"id":"g2","displayName":"Ops","members":[{"value":"u2","type":"User"},{"value":"g1","type":"Group"}]}]}`)
		}
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	p := &SCIMSyncerProvider{Syncer: &Syncer{Host: srv.URL + "/scim/v2/", Password: "tok"}}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].Name != "g1" || groups[0].DisplayName != "Dev" || groups[1].Name != "g2" {
		t.Fatalf("unexpected groups: %+v", groups)
	}

	users, err := p.GetOriginalUsers()
	if err != nil {
		t.Fatal(err)
	}
	m := map[string][]string{}
	for _, u := range users {
		m[u.Id] = u.Groups
	}
	if !reflect.DeepEqual(m["u1"], []string{"g1"}) || !reflect.DeepEqual(m["u2"], []string{"g1", "g2"}) {
		t.Fatalf("unexpected membership: %v", m)
	}

	ids, err := p.GetOriginalUserGroups("u1")
	if err != nil || !reflect.DeepEqual(ids, []string{"g1"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}
	ids, err = p.GetOriginalUserGroups("nobody")
	if err != nil || len(ids) != 0 {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}
}
