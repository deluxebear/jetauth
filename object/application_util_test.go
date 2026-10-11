// Copyright 2026 The Casdoor Authors. All Rights Reserved.
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

import "testing"

func TestRedirectUriMatchesPattern(t *testing.T) {
	tests := []struct {
		redirectUri string
		targetUri   string
		want        bool
	}{
		// Exact match
		{"https://login.example.com/callback", "https://login.example.com/callback", true},

		// Full URL pattern: exact host
		{"https://login.example.com/callback", "https://login.example.com/callback", true},
		{"https://login.example.com/other", "https://login.example.com/callback", false},

		// Full URL pattern: subdomain of configured host
		{"https://def.abc.com/callback", "abc.com", true},
		{"https://def.abc.com/callback", ".abc.com", true},
		{"https://def.abc.com/callback", ".abc.com/", true},
		{"https://deep.app.example.com/callback", "https://example.com/callback", true},

		// Full URL pattern: unrelated host must not match
		{"https://evil.com/callback", "https://example.com/callback", false},
		// Suffix collision: evilexample.com must not match example.com
		{"https://evilexample.com/callback", "https://example.com/callback", false},

		// Full URL pattern: scheme mismatch
		{"http://app.example.com/callback", "https://example.com/callback", false},

		// Full URL pattern: path mismatch
		{"https://app.example.com/other", "https://example.com/callback", false},

		// Scheme-less pattern: exact host
		{"https://login.example.com/callback", "login.example.com/callback", true},
		{"http://login.example.com/callback", "login.example.com/callback", true},

		// Scheme-less pattern: subdomain of configured host
		{"https://app.login.example.com/callback", "login.example.com/callback", true},

		// Scheme-less pattern: unrelated host must not match
		{"https://evil.com/callback", "login.example.com/callback", false},

		// Scheme-less pattern: query-string injection must not match
		{"https://evil.com/?r=https://login.example.com/callback", "login.example.com/callback", false},
		{"https://evil.com/page?redirect=https://login.example.com/callback", "login.example.com/callback", false},

		// Scheme-less pattern: path mismatch
		{"https://login.example.com/other", "login.example.com/callback", false},

		// Scheme-less pattern: non-http scheme must not match
		{"ftp://login.example.com/callback", "login.example.com/callback", false},

		// Empty target
		{"https://login.example.com/callback", "", false},
	}

	for _, tt := range tests {
		got := redirectUriMatchesPattern(tt.redirectUri, tt.targetUri)
		if got != tt.want {
			t.Errorf("redirectUriMatchesPattern(%q, %q) = %v, want %v", tt.redirectUri, tt.targetUri, got, tt.want)
		}
	}
}

func TestExtendApplicationWithSigninItems_LegacyCssLabelMigration(t *testing.T) {
	const legacyCss = ".login-languages {\n    top: 55px;\n}"
	app := &Application{SigninItems: []*SigninItem{
		{Name: "Languages", Label: legacyCss},
		{Name: "Username", Label: "Employee ID"},
		{Name: "Password", Label: "Passphrase", CustomCss: ".x {}"},
		{Name: "Promo", IsCustom: true, Label: "<b>hi</b>"},
		{Name: "Promo2", IsCustom: true, Label: "a {b}"},
		nil,
	}}
	if err := extendApplicationWithSigninItems(app); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		idx                int
		wantLabel, wantCss string
	}{
		{0, "", legacyCss},         // legacy CSS-in-Label row is still migrated
		{1, "Employee ID", ""},     // plain-text override survives without CSS
		{2, "Passphrase", ".x {}"}, // already has CSS: untouched
		{3, "<b>hi</b>", ""},       // custom HTML item keeps its label
		{4, "a {b}", ""},           // custom items are never treated as legacy
	}
	for _, c := range cases {
		item := app.SigninItems[c.idx]
		if item.Label != c.wantLabel || item.CustomCss != c.wantCss {
			t.Errorf("item %q: label=%q css=%q, want label=%q css=%q", item.Name, item.Label, item.CustomCss, c.wantLabel, c.wantCss)
		}
	}
}
