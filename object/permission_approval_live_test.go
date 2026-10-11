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

import "testing"

func TestFilterLivePermissionsAndGrouping(t *testing.T) {
	ps := []*Permission{
		{Owner: "o", Name: "approved", State: PermissionStateApproved, Model: "m"},
		{Owner: "o", Name: "pending", State: PermissionStatePending, Model: "m"},
		{Owner: "o", Name: "rejected", State: PermissionStateRejected, Model: "m"},
		{Owner: "o", Name: "legacy", State: "", Model: "m"},
	}
	live := FilterLivePermissions(ps)
	if len(live) != 2 || live[0].Name != "approved" || live[1].Name != "legacy" {
		t.Fatalf("unexpected live set: %+v", live)
	}
	groups := GroupPermissionsByModelAdapter(ps)
	ids := groups["m/"]
	if len(ids) != 2 || ids[0] != "o/approved" || ids[1] != "o/legacy" {
		t.Fatalf("grouping must skip non-approved permissions: %+v", groups)
	}
}
