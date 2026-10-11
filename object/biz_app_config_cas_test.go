// Copyright 2026 The JetAuth Authors. All Rights Reserved.
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
	"testing"
)

func TestCompareAndSetBizAppConfigAuthorizationModelId(t *testing.T) {
	prev := ormer
	a, err := NewAdapter("sqlite3", "file:"+filepath.Join(t.TempDir(), "cas.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	ormer = a
	t.Cleanup(func() {
		ormer = prev
		_ = a.Engine.Close()
	})
	if err = a.Engine.Sync2(new(BizAppConfig)); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Engine.Insert(&BizAppConfig{Owner: "o", AppName: "a", CurrentAuthorizationModelId: "m1"}); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name     string
		app      string
		expected string
		modelId  string
		want     bool
	}{
		{"activate already-current model succeeds", "a", "m1", "m1", true},
		{"advance from current succeeds", "a", "m1", "m2", true},
		{"stale expected fails", "a", "m1", "m3", false},
		{"re-activating new current succeeds", "a", "m2", "m2", true},
		{"stale same-value fails", "a", "m1", "m1", false},
		{"missing row fails", "nope", "m2", "m2", false},
	}
	for _, c := range cases {
		got, err := CompareAndSetBizAppConfigAuthorizationModelId("o", c.app, c.expected, c.modelId)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}
