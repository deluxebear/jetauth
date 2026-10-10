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
	"reflect"
	"testing"

	goldap "github.com/go-ldap/ldap/v3"
)

func TestActiveDirectoryGroupMapping(t *testing.T) {
	guid := []byte{0x78, 0x56, 0x34, 0x12, 0xbc, 0x9a, 0xf0, 0xde, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef}
	groupEntry := &goldap.Entry{
		DN: "CN=Developers,OU=Groups,DC=corp,DC=example,DC=com",
		Attributes: []*goldap.EntryAttribute{
			{Name: "sAMAccountName", Values: []string{"developers"}, ByteValues: [][]byte{[]byte("developers")}},
			{Name: "cn", Values: []string{"Developers"}, ByteValues: [][]byte{[]byte("Developers")}},
			{Name: "description", Values: []string{"All devs"}, ByteValues: [][]byte{[]byte("All devs")}},
			{Name: "mail", Values: []string{"devs@example.com"}, ByteValues: [][]byte{[]byte("devs@example.com")}},
			{Name: "managedBy", Values: []string{"CN=Jane Doe,OU=Users,DC=corp,DC=example,DC=com"}, ByteValues: [][]byte{[]byte("CN=Jane Doe,OU=Users,DC=corp,DC=example,DC=com")}},
			{Name: "objectGUID", Values: []string{string(guid)}, ByteValues: [][]byte{guid}},
		},
	}

	group := adEntryToOriginalGroup(groupEntry)
	if group.Name != "developers" || group.DisplayName != "Developers" || group.Description != "All devs" ||
		group.Email != "devs@example.com" || group.Manager != "Jane Doe" || group.Id != "12345678-9abc-def0-0123-456789abcdef" {
		t.Fatalf("unexpected group: %+v", group)
	}

	userEntry := &goldap.Entry{
		DN: "CN=Alice,OU=Users,DC=corp,DC=example,DC=com",
		Attributes: []*goldap.EntryAttribute{
			{Name: "memberOf", Values: []string{
				"cn=developers,ou=groups,dc=corp,dc=example,dc=com", // case differs from the group DN
				"CN=Unknown,OU=Groups,DC=corp,DC=example,DC=com",
				"CN=Developers,OU=Groups,DC=corp,DC=example,DC=com", // duplicate
			}},
		},
	}
	dnMap := map[string]string{"cn=developers,ou=groups,dc=corp,dc=example,dc=com": "developers"}
	if got := adGroupNamesForEntry(userEntry, dnMap); !reflect.DeepEqual(got, []string{"developers"}) {
		t.Fatalf("unexpected group names: %v", got)
	}
}

func TestActiveDirectoryGuidFilter(t *testing.T) {
	got := adGuidStringToLdapFilterBytes("12345678-9abc-def0-0123-456789abcdef")
	want := `\78\56\34\12\bc\9a\f0\de\01\23\45\67\89\ab\cd\ef`
	if got != want {
		t.Fatalf("got %s, want %s", got, want)
	}
	if adGuidStringToLdapFilterBytes("jdoe") != "" {
		t.Fatal("sAMAccountName must not be treated as a GUID")
	}
}

func TestActiveDirectoryTlsConfig(t *testing.T) {
	cases := map[string]bool{"": true, "require": true, "disable": true, "verify-ca": true, "verify-full": false}
	for mode, skip := range cases {
		cfg := (&ActiveDirectorySyncerProvider{Syncer: &Syncer{SslMode: mode}}).getTlsConfig("ad.example.com")
		if cfg.InsecureSkipVerify != skip {
			t.Errorf("mode %q: InsecureSkipVerify=%v, want %v", mode, cfg.InsecureSkipVerify, skip)
		}
	}

	full := (&ActiveDirectorySyncerProvider{Syncer: &Syncer{SslMode: "verify-full"}}).getTlsConfig("ad.example.com")
	if full.ServerName != "ad.example.com" {
		t.Errorf("verify-full must set ServerName, got %q", full.ServerName)
	}
	ca := (&ActiveDirectorySyncerProvider{Syncer: &Syncer{SslMode: "verify-ca"}}).getTlsConfig("ad.example.com")
	if ca.VerifyConnection == nil {
		t.Error("verify-ca must install a VerifyConnection callback")
	}
}
