// Copyright 2026 The casbin Authors. All Rights Reserved.
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

package rule

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/deluxebear/jetauth/object"
)

func uaRule(name, contains string) *object.Rule {
	return &object.Rule{
		Owner: "o", Name: name, Type: "User-Agent", Action: "Block",
		Expressions: []*object.Expression{{Operator: "contains", Value: contains}},
	}
}

func compound(name string, ids ...string) *object.Rule {
	exprs := []*object.Expression{}
	for i, id := range ids {
		op := "and"
		if i == 0 {
			op = "begin"
		}
		exprs = append(exprs, &object.Expression{Operator: op, Value: id})
	}
	return &object.Rule{Owner: "o", Name: name, Type: "Compound", Action: "Block", Expressions: exprs}
}

func TestCompoundRuleCycleDetected(t *testing.T) {
	object.SetRuleMapForTest([]*object.Rule{compound("a", "o/b"), compound("b", "o/a"), compound("self", "o/self")})
	req := httptest.NewRequest("GET", "/", nil)

	for _, id := range []string{"o/a", "o/self"} {
		_, err := CheckRules([]string{id}, req)
		if err == nil || !strings.Contains(err.Error(), "circular") {
			t.Fatalf("%s: expected circular error, got %v", id, err)
		}
	}
}

func TestCompoundRuleNestedAndMemoized(t *testing.T) {
	object.SetRuleMapForTest([]*object.Rule{
		uaRule("leaf", "bot"),
		compound("mid", "o/leaf", "o/leaf"),
		compound("top", "o/mid", "o/leaf", "o/mid"),
	})
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("User-Agent", "evilbot")

	res, err := CheckRules([]string{"o/top"}, req)
	if err != nil || res == nil || res.Action != "Block" {
		t.Fatalf("unexpected result %+v err %v", res, err)
	}

	ctx := newEvalContext()
	if _, err = ctx.checkRuleOnce("o/top", req); err != nil {
		t.Fatal(err)
	}
	// leaf, mid, top are each evaluated exactly once despite repeated references.
	if len(ctx.memo) != 3 {
		t.Fatalf("expected 3 memo entries, got %d", len(ctx.memo))
	}
	if len(ctx.visiting) != 0 {
		t.Fatalf("visiting set must be empty after evaluation, got %v", ctx.visiting)
	}
}
