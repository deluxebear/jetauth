// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"fmt"
	"strings"
	"testing"
)

func TestValidateBizRoleProperties(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		wantErr bool
	}{
		{"empty", "", false},
		{"free-form", `{"featureFlag":true,"tier":"gold"}`, false},
		{"typed self", `{"dataScope":{"type":"self"}}`, false},
		{"typed custom", `{"dataScope":{"type":"custom","values":["d1","d2"]}}`, false},
		{"custom without values", `{"dataScope":{"type":"custom"}}`, true},
		{"bad type", `{"dataScope":{"type":"galaxy"}}`, true},
		{"legacy per-resource", `{"dataScope":{"orders":"department"}}`, false},
		{"dataScope not object", `{"dataScope":"all"}`, true},
		{"not an object", `[1,2]`, true},
		{"bad json", `{`, true},
		{"bad key", `{"1bad":1}`, true},
		{"key with space", `{"a b":1}`, true},
		{"resource override", `{"dataScope":{"type":"dept","resources":{"orders":{"type":"self"}}}}`, false},
		{"bad resource override", `{"dataScope":{"type":"dept","resources":{"orders":{"type":"x"}}}}`, true},
		{"empty value", `{"dataScope":{"type":"custom","values":[""]}}`, true},
		{"too large", `{"a":"` + strings.Repeat("x", bizRolePropertiesMaxBytes) + `"}`, true},
	}
	for _, c := range cases {
		err := ValidateBizRoleProperties(c.raw)
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err=%v wantErr=%v", c.name, err, c.wantErr)
		}
	}
}

func TestValidateBizRolePropertiesTooManyKeys(t *testing.T) {
	parts := make([]string, 0, bizRolePropertiesMaxKeys+1)
	for i := 0; i <= bizRolePropertiesMaxKeys; i++ {
		parts = append(parts, fmt.Sprintf(`"k%d":1`, i))
	}
	raw := "{" + strings.Join(parts, ",") + "}"
	if err := ValidateBizRoleProperties(raw); err == nil {
		t.Fatal("expected too-many-keys error")
	}
}

func TestMergeBizDataScopes(t *testing.T) {
	ptr := func(d BizDataScope) *BizDataScope { return &d }

	got := MergeBizDataScopes([]string{"a"}, []*BizDataScope{nil})
	if got.Type != BizDataScopeNone || len(got.Sources) != 0 {
		t.Fatalf("no scopes: %+v", got)
	}

	got = MergeBizDataScopes([]string{"a", "b", "c"}, []*BizDataScope{
		ptr(BizDataScope{Type: BizDataScopeSelf}),
		ptr(BizDataScope{Type: BizDataScopeDeptAndChildren}),
		ptr(BizDataScope{Type: BizDataScopeDept}),
	})
	if got.Type != BizDataScopeDeptAndChildren || len(got.Sources) != 3 {
		t.Fatalf("most permissive: %+v", got)
	}

	got = MergeBizDataScopes([]string{"a", "b"}, []*BizDataScope{
		ptr(BizDataScope{Type: BizDataScopeAll}),
		ptr(BizDataScope{Type: BizDataScopeOrg}),
	})
	if got.Type != BizDataScopeAll {
		t.Fatalf("all wins: %+v", got)
	}

	got = MergeBizDataScopes([]string{"a", "b"}, []*BizDataScope{
		ptr(BizDataScope{Type: BizDataScopeCustom, Values: []string{"d2", "d1"}}),
		ptr(BizDataScope{Type: BizDataScopeCustom, Values: []string{"d1", "d3"}}),
	})
	if got.Type != BizDataScopeCustom || strings.Join(got.Values, ",") != "d1,d2,d3" {
		t.Fatalf("custom union: %+v", got)
	}

	got = MergeBizDataScopes([]string{"a", "b"}, []*BizDataScope{
		ptr(BizDataScope{Type: BizDataScopeSelf}),
		ptr(BizDataScope{Type: BizDataScopeCustom, Values: []string{"d1"}}),
	})
	if got.Type != BizDataScopeSelf || strings.Join(got.Values, ",") != "d1" {
		t.Fatalf("standard + custom: %+v", got)
	}
}

func TestMergeBizDataScopesResources(t *testing.T) {
	a := BizDataScope{Type: BizDataScopeDept, Resources: map[string]BizDataScope{"orders": {Type: BizDataScopeSelf}}}
	b := BizDataScope{Type: BizDataScopeOrg}
	got := MergeBizDataScopes([]string{"a", "b"}, []*BizDataScope{&a, &b})
	if got.Type != BizDataScopeOrg {
		t.Fatalf("default: %+v", got)
	}
	// b has no override for orders, so contributes its default (org).
	if got.Resources["orders"].Type != BizDataScopeOrg {
		t.Fatalf("resource: %+v", got.Resources)
	}
	got = MergeBizDataScopes([]string{"a"}, []*BizDataScope{&a})
	if got.Resources["orders"].Type != BizDataScopeSelf || got.Type != BizDataScopeDept {
		t.Fatalf("override: %+v", got)
	}
}

func TestGetBizRoleDataScope(t *testing.T) {
	if GetBizRoleDataScope(nil) != nil {
		t.Fatal("nil role")
	}
	if GetBizRoleDataScope(&BizRole{Properties: `{"dataScope":{"orders":"department"}}`}) != nil {
		t.Fatal("legacy shape should be ignored")
	}
	ds := GetBizRoleDataScope(&BizRole{Properties: `{"dataScope":{"type":"org"}}`})
	if ds == nil || ds.Type != BizDataScopeOrg {
		t.Fatalf("typed: %+v", ds)
	}
}
