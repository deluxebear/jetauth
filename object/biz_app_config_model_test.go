// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import "testing"

func TestValidateBizModelText(t *testing.T) {
	good := `[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act`

	cases := []struct {
		name      string
		modelType string
		text      string
		wantErr   bool
	}{
		{"valid", "casbin", good, false},
		{"empty skipped", "casbin", "", false},
		{"rebac skipped", "rebac", "garbage", false},
		{"garbage", "casbin", "not a model", true},
		{"wrong arity", "casbin", "[request_definition]\nr = sub, dom, obj, act\n[policy_definition]\np = sub, dom, obj, act\n[policy_effect]\ne = some(where (p.eft == allow))\n[matchers]\nm = r.sub == p.sub", true},
	}
	for _, c := range cases {
		err := ValidateBizModelText(c.modelType, c.text)
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err=%v wantErr=%v", c.name, err, c.wantErr)
		}
	}
}
