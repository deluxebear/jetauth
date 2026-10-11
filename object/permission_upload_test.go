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

// L1: a spreadsheet row cannot smuggle in its own approval state, approver or owner.
func TestPreparePermissionForUploadNonAdmin(t *testing.T) {
	row := &Permission{
		Owner: "victim-org", Name: "forged", State: PermissionStateApproved,
		Approver: "root", ApproveTime: "2020-01-01", Submitter: "root", RejectReason: "x",
	}
	if err := preparePermissionForUpload(row, "org1", "org1/mallory", false, false); err != nil {
		t.Fatal(err)
	}
	if row.Owner != "org1" {
		t.Fatalf("owner must be forced to the uploader's organization, got %q", row.Owner)
	}
	if row.State != PermissionStatePending || row.Approver != "" || row.ApproveTime != "" ||
		row.RejectReason != "" || row.Submitter != "org1/mallory" {
		t.Fatalf("approval fields must be server-controlled: %+v", row)
	}
	if row.IsPolicyLive() {
		t.Fatal("an uploaded non-admin permission must not be live")
	}
}

func TestPreparePermissionForUploadOrgAdmin(t *testing.T) {
	row := &Permission{Owner: "other-org", Name: "ok", State: PermissionStateRejected}
	if err := preparePermissionForUpload(row, "org1", "org1/admin", true, false); err == nil {
		t.Fatal("an admin cannot upload an initially Rejected permission")
	}

	row = &Permission{Owner: "other-org", Name: "ok", Approver: "root"}
	if err := preparePermissionForUpload(row, "org1", "org1/admin", true, false); err != nil {
		t.Fatal(err)
	}
	if row.Owner != "org1" || row.State != PermissionStateApproved || row.Approver != "admin" {
		t.Fatalf("org admin upload: %+v", row)
	}
}

func TestPreparePermissionForUploadGlobalAdminKeepsFileOwner(t *testing.T) {
	row := &Permission{Owner: "other-org", Name: "ok"}
	if err := preparePermissionForUpload(row, "built-in", "built-in/admin", true, true); err != nil {
		t.Fatal(err)
	}
	if row.Owner != "other-org" {
		t.Fatalf("global admin keeps the file owner, got %q", row.Owner)
	}

	row = &Permission{Name: "no-owner"}
	if err := preparePermissionForUpload(row, "built-in", "built-in/admin", true, true); err != nil {
		t.Fatal(err)
	}
	if row.Owner != "built-in" {
		t.Fatalf("a row without owner falls back to the uploader's organization, got %q", row.Owner)
	}
}
