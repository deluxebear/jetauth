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

package controllers

import "testing"

func TestBizAppAccessAllowed(t *testing.T) {
	cases := []struct {
		name        string
		global      bool
		userOwner   string
		hasUser     bool
		appOwner    string
		wantAllowed bool
	}{
		{"global admin any org", true, "built-in", true, "orgB", true},
		{"global admin without user (app subject)", true, "", false, "orgB", true},
		{"same-org member", false, "orgA", true, "orgA", true},
		{"cross-org admin rejected", false, "orgA", true, "orgB", false},
		{"anonymous rejected", false, "", false, "orgA", false},
		{"empty app owner rejected", false, "", true, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := bizAppAccessAllowed(tc.global, tc.userOwner, tc.hasUser, tc.appOwner); got != tc.wantAllowed {
				t.Fatalf("got %v want %v", got, tc.wantAllowed)
			}
		})
	}
}
