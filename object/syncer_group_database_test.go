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
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// newSqliteSyncer opens a throw-away SQLite database (pure Go driver, no external service) and
// runs the given statements on it.
func newSqliteSyncer(t *testing.T, statements ...string) *Syncer {
	t.Helper()

	dsn := "file:" + filepath.Join(t.TempDir(), "syncer.db")
	ormer, err := NewAdapter("sqlite3", dsn, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ormer.Engine.Close() })

	for _, stmt := range statements {
		if _, err = ormer.Engine.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}

	return &Syncer{
		Type:         "Database",
		DatabaseType: "sqlite3",
		Ormer:        ormer,
	}
}

func TestDatabaseGroupSync(t *testing.T) {
	syncer := newSqliteSyncer(t,
		"create table users (id text, username text)",
		"insert into users values ('1', 'alice'), ('2', 'bob'), ('3', 'carol')",
		"create table grp (gid text, gname text, title text, descr text)",
		"insert into grp values ('10', 'dev', 'Developers', 'all devs'), ('20', 'ops', '', ''), ('', '', '', '')",
		"create table user_grp (uid text, gid text)",
		"insert into user_grp values ('1', '10'), ('1', '20'), ('2', '20'), ('2', '99'), ('2', '20')",
	)
	syncer.Table = "users"
	syncer.TableColumns = []*TableColumn{
		{Name: "id", CasdoorName: "Id", IsKey: true},
		{Name: "username", CasdoorName: "Name"},
	}
	syncer.GroupTable = "grp"
	syncer.GroupTableColumns = []*TableColumn{
		{Name: "gid", CasdoorName: "Id"},
		{Name: "gname", CasdoorName: "Name"},
		{Name: "title", CasdoorName: "DisplayName"},
		{Name: "descr", CasdoorName: "Description"},
	}
	syncer.GroupMembershipTable = "user_grp"
	syncer.GroupMembershipUserColumn = "uid"
	syncer.GroupMembershipGroupColumn = "gid"

	p := &DatabaseSyncerProvider{Syncer: syncer}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	// the row without id and name is skipped; empty display name falls back to the name
	if len(groups) != 2 {
		t.Fatalf("unexpected groups: %+v", groups)
	}
	if groups[0].Id != "10" || groups[0].Name != "dev" || groups[0].DisplayName != "Developers" || groups[0].Description != "all devs" || groups[0].Type != "Virtual" {
		t.Fatalf("unexpected group: %+v", groups[0])
	}
	if groups[1].Name != "ops" || groups[1].DisplayName != "ops" {
		t.Fatalf("unexpected group: %+v", groups[1])
	}

	users, err := p.GetOriginalUsers()
	if err != nil {
		t.Fatal(err)
	}
	m := map[string][]string{}
	for _, u := range users {
		sort.Strings(u.Groups)
		m[u.Name] = u.Groups
	}
	// membership rows pointing to unknown group ids and duplicates are dropped
	want := map[string][]string{"alice": {"dev", "ops"}, "bob": {"ops"}, "carol": {}}
	if !reflect.DeepEqual(m, want) {
		t.Fatalf("got %v, want %v", m, want)
	}

	ids, err := p.GetOriginalUserGroups("1")
	sort.Strings(ids)
	if err != nil || !reflect.DeepEqual(ids, []string{"dev", "ops"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}
}

func TestDatabaseGroupSyncDisabledAndValidation(t *testing.T) {
	syncer := newSqliteSyncer(t)
	p := &DatabaseSyncerProvider{Syncer: syncer}

	groups, err := p.GetOriginalGroups()
	if err != nil || len(groups) != 0 {
		t.Fatalf("group sync must be a no-op without a group table, got %v, %v", groups, err)
	}

	syncer.GroupTable = "grp; drop table users"
	syncer.GroupTableColumns = []*TableColumn{{Name: "id", CasdoorName: "Id"}}
	if _, err = p.GetOriginalGroups(); err == nil {
		t.Fatal("expected an invalid table name error")
	}
}

func TestKeycloakGroupSync(t *testing.T) {
	syncer := newSqliteSyncer(t,
		"create table user_entity (id text, username text, email text, enabled integer, created_timestamp integer)",
		"insert into user_entity values ('u1', 'alice', 'a@x.com', 1, 1700000000000), ('u2', 'bob', 'b@x.com', 1, 1700000000000)",
		"create table keycloak_group (id text, name text, parent_group text)",
		"insert into keycloak_group values ('g1', 'Admins', ' '), ('g2', 'Staff', 'g1')",
		"create table user_group_membership (group_id text, user_id text)",
		"insert into user_group_membership values ('g1', 'u1'), ('g2', 'u1'), ('g2', 'u2')",
	)
	syncer.Type = "Keycloak"
	syncer.Table = "user_entity"
	syncer.TableColumns = []*TableColumn{
		{Name: "id", CasdoorName: "Id", IsKey: true},
		{Name: "username", CasdoorName: "Name"},
		{Name: "email", CasdoorName: "Email"},
		{Name: "created_timestamp", CasdoorName: "CreatedTime"},
	}

	p := &KeycloakSyncerProvider{DatabaseSyncerProvider: DatabaseSyncerProvider{Syncer: syncer}}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].Name != "g1" || groups[0].DisplayName != "Admins" || groups[1].Name != "g2" {
		t.Fatalf("unexpected groups: %+v", groups)
	}

	users, err := p.GetOriginalUsers()
	if err != nil {
		t.Fatal(err)
	}
	m := map[string][]string{}
	for _, u := range users {
		sort.Strings(u.Groups)
		m[u.Name] = u.Groups
	}
	if !reflect.DeepEqual(m["alice"], []string{"g1", "g2"}) || !reflect.DeepEqual(m["bob"], []string{"g2"}) {
		t.Fatalf("unexpected membership: %v", m)
	}

	ids, err := p.GetOriginalUserGroups("u2")
	if err != nil || !reflect.DeepEqual(ids, []string{"g2"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}
}
