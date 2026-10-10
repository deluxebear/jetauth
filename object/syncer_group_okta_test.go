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

func TestOktaGroupSync(t *testing.T) {
	var srv *httptest.Server
	mux := http.NewServeMux()
	auth := func(w http.ResponseWriter, r *http.Request) bool {
		if r.Header.Get("Authorization") != "SSWS tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return false
		}
		return true
	}
	mux.HandleFunc("/api/v1/users", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		fmt.Fprint(w, `[{"id":"u1","status":"ACTIVE","profile":{"login":"u1@x.com"}},{"id":"u2","status":"ACTIVE","profile":{"login":"u2@x.com"}}]`)
	})
	mux.HandleFunc("/api/v1/groups", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		if r.URL.Query().Get("after") == "p2" {
			fmt.Fprint(w, `[{"id":"g2","type":"OKTA_GROUP","profile":{"name":"Ops"}}]`)
			return
		}
		w.Header().Set("Link", fmt.Sprintf(`<%s/api/v1/groups?limit=200&after=p2>; rel="next"`, srv.URL))
		fmt.Fprint(w, `[{"id":"g1","type":"OKTA_GROUP","profile":{"name":"Dev","description":"devs"}}]`)
	})
	mux.HandleFunc("/api/v1/groups/g1/users", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"id":"u1"},{"id":"u2"}]`)
	})
	mux.HandleFunc("/api/v1/groups/g2/users", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"id":"u2"}]`)
	})
	mux.HandleFunc("/api/v1/users/u2/groups", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"id":"g1","profile":{"name":"Dev"}},{"id":"g2","profile":{"name":"Ops"}}]`)
	})
	srv = httptest.NewServer(mux)
	defer srv.Close()

	oktaBaseUrlOverride = srv.URL
	defer func() { oktaBaseUrlOverride = "" }()

	p := &OktaSyncerProvider{Syncer: &Syncer{Host: "dev-1.okta.com", Password: "tok"}}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].Name != "g1" || groups[0].DisplayName != "Dev" || groups[0].Description != "devs" || groups[1].DisplayName != "Ops" {
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

	ids, err := p.GetOriginalUserGroups("u2")
	if err != nil || !reflect.DeepEqual(ids, []string{"g1", "g2"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}

	bad := &OktaSyncerProvider{Syncer: &Syncer{Host: "dev-1.okta.com", Password: "wrong"}}
	if _, err = bad.GetOriginalGroups(); err == nil {
		t.Fatal("expected unauthorized error")
	}
}
