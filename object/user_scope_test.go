// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"reflect"
	"testing"
)

func TestFilterConsentScopes(t *testing.T) {
	app := &Application{CustomScopes: []*ScopeDescription{
		{Scope: "files:read"},
		{Scope: "files:write"},
		nil,
	}}

	cases := []struct {
		name      string
		requested string
		granted   []string
		want      []string
	}{
		{"keeps requested custom scopes", "openid files:read files:write", []string{"files:read", "files:write"}, []string{"files:read", "files:write"}},
		{"drops scopes not in the request", "openid files:read", []string{"files:read", "files:write"}, []string{"files:read"}},
		{"drops scopes the app does not define", "openid admin:all files:read", []string{"admin:all", "files:read"}, []string{"files:read"}},
		{"drops standard OIDC scopes", "openid profile", []string{"openid", "profile"}, []string{}},
		{"empty grant", "files:read", nil, []string{}},
	}
	for _, c := range cases {
		if got := FilterConsentScopes(app, c.requested, c.granted); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
