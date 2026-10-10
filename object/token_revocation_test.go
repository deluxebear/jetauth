// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import "testing"

func TestIsTokenRevoked(t *testing.T) {
	cases := []struct {
		name  string
		token *Token
		want  bool
	}{
		{"nil token is not revoked", nil, false},
		{"active token", &Token{ExpiresIn: 3600}, false},
		{"expires_in zero means revoked", &Token{ExpiresIn: 0}, true},
		{"negative expires_in means revoked", &Token{ExpiresIn: -1}, true},
	}
	for _, c := range cases {
		if got := IsTokenRevoked(c.token); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestTokenBelongsToApplication(t *testing.T) {
	app := &Application{Owner: "admin", Name: "app-a"}
	cases := []struct {
		name  string
		token *Token
		app   *Application
		want  bool
	}{
		{"same app", &Token{Owner: "admin", Application: "app-a"}, app, true},
		{"other app", &Token{Owner: "admin", Application: "app-b"}, app, false},
		{"other owner", &Token{Owner: "org", Application: "app-a"}, app, false},
		{"nil token", nil, app, false},
		{"nil app", &Token{Owner: "admin", Application: "app-a"}, nil, false},
	}
	for _, c := range cases {
		if got := TokenBelongsToApplication(c.token, c.app); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestRevokeTokenEmptyValueIsNoop(t *testing.T) {
	revoked, err := RevokeToken("", "access_token", &Application{})
	if err != nil || revoked {
		t.Fatalf("expected no-op, got revoked=%v err=%v", revoked, err)
	}
}
