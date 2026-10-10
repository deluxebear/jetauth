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

func TestMergeSyncedGroups(t *testing.T) {
	known := map[string]bool{"a": true, "b": true}
	got := mergeSyncedGroups([]string{"a", "local", "b"}, []string{"b", "c"}, known)
	want := []string{"local", "b", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}

	if !sameStringSet([]string{"x", "y"}, []string{"y", "x"}) || sameStringSet([]string{"x"}, []string{"y"}) {
		t.Fatal("sameStringSet misbehaves")
	}
}

func newAzureAdMock(t *testing.T) *httptest.Server {
	var srv *httptest.Server
	mux := http.NewServeMux()
	mux.HandleFunc("/tenant1/oauth2/v2.0/token", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"access_token":"tok","token_type":"Bearer"}`)
	})
	mux.HandleFunc("/v1.0/users", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"value":[{"id":"u1","userPrincipalName":"u1@x.com","accountEnabled":true},{"id":"u2","userPrincipalName":"u2@x.com","accountEnabled":true}]}`)
	})
	mux.HandleFunc("/v1.0/groups", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Query().Get("page") == "2" {
			fmt.Fprint(w, `{"value":[{"id":"g2","displayName":"Ops"}]}`)
			return
		}
		fmt.Fprintf(w, `{"@odata.nextLink":"%s/v1.0/groups?page=2","value":[{"id":"g1","displayName":"Dev","description":"devs","mail":"dev@x.com"}]}`, srv.URL)
	})
	mux.HandleFunc("/v1.0/groups/g1/members/microsoft.graph.user", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"value":[{"id":"u1"},{"id":"u2"}]}`)
	})
	mux.HandleFunc("/v1.0/groups/g2/members/microsoft.graph.user", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"value":[{"id":"u2"}]}`)
	})
	mux.HandleFunc("/v1.0/users/u2/memberOf/microsoft.graph.group", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"value":[{"id":"g1"},{"id":"g2"}]}`)
	})
	srv = httptest.NewServer(mux)

	oldLogin, oldGraph := azureAdLoginBaseUrl, azureAdGraphBaseUrl
	azureAdLoginBaseUrl, azureAdGraphBaseUrl = srv.URL, srv.URL+"/v1.0"
	t.Cleanup(func() {
		azureAdLoginBaseUrl, azureAdGraphBaseUrl = oldLogin, oldGraph
		srv.Close()
	})
	return srv
}

func TestAzureAdGroupSync(t *testing.T) {
	newAzureAdMock(t)
	p := &AzureAdSyncerProvider{Syncer: &Syncer{Host: "tenant1", User: "cid", Password: "secret"}}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].Name != "g1" || groups[0].DisplayName != "Dev" || groups[0].Email != "dev@x.com" || groups[1].Name != "g2" {
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
	if !reflect.DeepEqual(m["u1"], []string{"g1"}) || !reflect.DeepEqual(m["u2"], []string{"g1", "g2"}) {
		t.Fatalf("unexpected membership: %v", m)
	}

	ids, err := p.GetOriginalUserGroups("u2")
	if err != nil || !reflect.DeepEqual(ids, []string{"g1", "g2"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}
}

func TestAzureAdGroupSyncMembershipFailureLeavesGroupsUnknown(t *testing.T) {
	srv := newAzureAdMock(t)
	_ = srv
	// Break the groups endpoint by using an invalid token path: point Graph to a server that 403s on groups.
	forbidden := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1.0/groups" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		fmt.Fprint(w, `{"value":[{"id":"u1","userPrincipalName":"u1@x.com","accountEnabled":true}]}`)
	}))
	defer forbidden.Close()
	azureAdGraphBaseUrl = forbidden.URL + "/v1.0"

	p := &AzureAdSyncerProvider{Syncer: &Syncer{Host: "tenant1", User: "cid", Password: "secret"}}
	users, err := p.GetOriginalUsers()
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0].Groups != nil {
		t.Fatalf("expected users with unknown (nil) groups, got %+v", users)
	}
}
