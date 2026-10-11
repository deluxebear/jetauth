// Copyright 2021 The Casdoor Authors. All Rights Reserved.
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
	"errors"
	"fmt"

	"github.com/deluxebear/jetauth/util"
)

// Permission approval states. Only PermissionStateApproved takes effect in check.go.
const (
	PermissionStatePending  = "Pending"
	PermissionStateApproved = "Approved"
	PermissionStateRejected = "Rejected"
)

// PermissionApprovalLog is one row of the platform permission approval audit trail.
type PermissionApprovalLog struct {
	Id int64 `xorm:"pk autoincr" json:"id"`

	Owner          string `xorm:"varchar(100) index" json:"owner"`
	PermissionName string `xorm:"varchar(100) index" json:"permissionName"`
	CreatedTime    string `xorm:"varchar(100)" json:"createdTime"`

	Operator  string `xorm:"varchar(200)" json:"operator"`
	FromState string `xorm:"varchar(100)" json:"fromState"`
	ToState   string `xorm:"varchar(100)" json:"toState"`
	Reason    string `xorm:"varchar(500)" json:"reason"`
}

// IsPolicyLive reports whether the permission's casbin policy rows may exist. Only Approved
// permissions are enforced by /api/enforce; an empty state is legacy data created before the
// approval workflow existed (every write path since then forces a non-empty state), so it keeps
// working. IsEnabled is deliberately not part of this gate: it is a zero-valued bool for API
// clients that never set it, and the platform enforcer has never honoured it.
func (p *Permission) IsPolicyLive() bool {
	return p.State == "" || p.State == PermissionStateApproved
}

// FilterLivePermissions drops permissions whose policies must not be enforced (Pending/Rejected).
func FilterLivePermissions(permissions []*Permission) []*Permission {
	res := make([]*Permission, 0, len(permissions))
	for _, permission := range permissions {
		if permission != nil && permission.IsPolicyLive() {
			res = append(res, permission)
		}
	}
	return res
}

func normalizePermissionState(state string) string {
	if state == "" {
		return PermissionStatePending
	}
	return state
}

func isValidPermissionState(state string) bool {
	return state == PermissionStatePending || state == PermissionStateApproved || state == PermissionStateRejected
}

// ValidatePermissionTransition enforces the approval state machine:
//
//	Pending  -> Approved | Rejected   (admin only)
//	Rejected -> Pending               (admin or the submitter: resubmit)
//	Approved -> Pending               (admin only: revoke)
//
// An empty state is treated as Pending. from == to is always a no-op.
func ValidatePermissionTransition(from, to string, isAdmin, isSubmitter bool, reason string) error {
	from = normalizePermissionState(from)
	to = normalizePermissionState(to)
	if !isValidPermissionState(from) || !isValidPermissionState(to) {
		return fmt.Errorf("invalid permission state: %s -> %s", from, to)
	}
	if from == to {
		return nil
	}

	switch {
	case from == PermissionStatePending && to == PermissionStateApproved:
		if !isAdmin {
			return errors.New("only administrators can approve permissions")
		}
	case from == PermissionStatePending && to == PermissionStateRejected:
		if !isAdmin {
			return errors.New("only administrators can reject permissions")
		}
		if reason == "" {
			return errors.New("a reject reason is required")
		}
	case from == PermissionStateRejected && to == PermissionStatePending:
		if !isAdmin && !isSubmitter {
			return errors.New("only the submitter or an administrator can resubmit a rejected permission")
		}
	case from == PermissionStateApproved && to == PermissionStatePending:
		if !isAdmin {
			return errors.New("only administrators can revoke an approved permission")
		}
	default:
		return fmt.Errorf("permission state transition %s -> %s is not allowed", from, to)
	}
	return nil
}

func permissionUserName(userId string) string {
	_, name := util.GetOwnerAndNameFromIdNoCheck(userId)
	return name
}

// PreparePermissionForAdd normalizes the server-controlled approval fields of a new permission.
// Non-admins always create Pending permissions; admins may create Approved (default) or Pending ones.
func PreparePermissionForAdd(permission *Permission, operatorId string, isAdmin bool) error {
	permission.Submitter = permissionUserName(operatorId)
	permission.Approver = ""
	permission.ApproveTime = ""
	permission.RejectReason = ""

	state := permission.State
	if !isAdmin {
		state = PermissionStatePending
	} else if state == "" {
		state = PermissionStateApproved
	}
	if state == PermissionStateRejected || !isValidPermissionState(state) {
		return fmt.Errorf("invalid initial permission state: %s", state)
	}

	permission.State = state
	if state == PermissionStateApproved {
		permission.Approver = permissionUserName(operatorId)
		permission.ApproveTime = util.GetCurrentTime()
	}
	return nil
}

// ApplyPermissionStateChange reconciles the approval fields of an updated permission against the
// stored one. Client-supplied submitter/approver/approveTime are ignored; they are derived from the
// stored record and the (validated) state transition. Returns the previous and new state.
func ApplyPermissionStateChange(oldPermission, permission *Permission, operatorId string, isAdmin bool) (string, string, error) {
	from := normalizePermissionState(oldPermission.State)
	to := permission.State
	if to == "" {
		to = from
	}
	reason := permission.RejectReason

	isSubmitter := oldPermission.Submitter != "" && oldPermission.Submitter == permissionUserName(operatorId)
	if err := ValidatePermissionTransition(from, to, isAdmin, isSubmitter, reason); err != nil {
		return from, to, err
	}

	permission.Submitter = oldPermission.Submitter
	permission.State = to
	if from == to {
		permission.Approver = oldPermission.Approver
		permission.ApproveTime = oldPermission.ApproveTime
		permission.RejectReason = oldPermission.RejectReason
		return from, to, nil
	}

	switch to {
	case PermissionStateApproved:
		permission.Approver = permissionUserName(operatorId)
		permission.ApproveTime = util.GetCurrentTime()
		permission.RejectReason = ""
	case PermissionStateRejected:
		permission.Approver = permissionUserName(operatorId)
		permission.ApproveTime = util.GetCurrentTime()
		permission.RejectReason = reason
	default:
		permission.Approver = ""
		permission.ApproveTime = ""
		permission.RejectReason = ""
	}
	return from, to, nil
}

func addPermissionApprovalLog(permission *Permission, operatorId, from, to, reason string) error {
	_, err := ormer.Engine.Insert(&PermissionApprovalLog{
		Owner:          permission.Owner,
		PermissionName: permission.Name,
		CreatedTime:    util.GetCurrentTime(),
		Operator:       operatorId,
		FromState:      from,
		ToState:        to,
		Reason:         reason,
	})
	return err
}

// GetPermissionApprovalLogs returns the approval history of one permission, newest first.
func GetPermissionApprovalLogs(owner, name string) ([]*PermissionApprovalLog, error) {
	logs := []*PermissionApprovalLog{}
	err := ormer.Engine.Where("owner = ? and permission_name = ?", owner, name).Desc("id").Find(&logs)
	return logs, err
}

// AddPermissionWithApproval adds a permission through the approval workflow and notifies org admins
// when it is created in the Pending state.
func AddPermissionWithApproval(permission *Permission, operatorId string, isAdmin bool) (bool, error) {
	if err := PreparePermissionForAdd(permission, operatorId, isAdmin); err != nil {
		return false, err
	}

	affected, err := AddPermission(permission)
	if err != nil || !affected {
		return affected, err
	}

	recordApprovalChange(permission, operatorId, "", permission.State, "")
	return affected, nil
}

// UpdatePermissionWithApproval updates a permission, enforcing the approval state machine and
// server-side approver bookkeeping. Every state change is written to the audit log.
func UpdatePermissionWithApproval(id string, permission *Permission, operatorId string, isAdmin bool) (bool, error) {
	owner, name := util.GetOwnerAndNameFromIdNoCheck(id)
	oldPermission, err := getPermission(owner, name)
	if err != nil {
		return false, err
	}
	if oldPermission == nil {
		return false, nil
	}

	from, to, err := ApplyPermissionStateChange(oldPermission, permission, operatorId, isAdmin)
	if err != nil {
		return false, err
	}

	// A pure state transition (approve/reject/revoke/resubmit with the stored content) is not a
	// content save, so it skips field validation; legacy incomplete data must stay transitionable.
	contentChanged := permissionPolicyFieldsChanged(oldPermission, permission)
	if contentChanged || from == to {
		if err = ValidatePermissionFields(permission, oldPermission); err != nil {
			return false, err
		}
	}

	reason := permission.RejectReason
	if demoteOnContentChange(oldPermission, permission, from, to, isAdmin) {
		to = PermissionStatePending
		reason = PermissionReasonContentChanged
	}
	affected, err := UpdatePermission(id, permission)
	if err != nil || !affected {
		return affected, err
	}

	if from != to {
		recordApprovalChange(permission, operatorId, from, to, reason)
	}
	return affected, nil
}

// PermissionReasonContentChanged is the audit-log reason written when a non-approver's edit sends
// an Approved/Rejected permission back to Pending.
const PermissionReasonContentChanged = "policy content changed by a non-approver; re-approval required"

// demoteOnContentChange closes the approval bypass where a non-approver edits the content of an
// Approved (or Rejected) permission and it keeps its state. When the state is otherwise unchanged,
// the editor is not an approver and policy-affecting fields differ from the stored record, the
// permission is reset to Pending (approver bookkeeping cleared). Returns true if it demoted.
func demoteOnContentChange(old, permission *Permission, from, to string, isAdmin bool) bool {
	if isAdmin || from != to || (to != PermissionStateApproved && to != PermissionStateRejected) {
		return false
	}
	if !permissionPolicyFieldsChanged(old, permission) {
		return false
	}
	permission.State = PermissionStatePending
	permission.Approver = ""
	permission.ApproveTime = ""
	permission.RejectReason = ""
	return true
}

// SetPermissionState moves a permission to a new state (used by the approve/reject endpoints).
func SetPermissionState(id, to, reason, operatorId string, isAdmin bool, contentHash string) (bool, error) {
	owner, name := util.GetOwnerAndNameFromIdNoCheck(id)
	oldPermission, err := getPermission(owner, name)
	if err != nil {
		return false, err
	}
	if oldPermission == nil {
		return false, fmt.Errorf("the permission: %s does not exist", id)
	}
	if err = checkPermissionContentHash(oldPermission, to, contentHash); err != nil {
		return false, err
	}

	updated := *oldPermission
	updated.State = to
	updated.RejectReason = reason
	return UpdatePermissionWithApproval(id, &updated, operatorId, isAdmin)
}

// recordApprovalChange writes the audit row and sends notifications. Both are best-effort:
// failures are logged and never fail the originating request.
func recordApprovalChange(permission *Permission, operatorId, from, to, reason string) {
	if err := addPermissionApprovalLog(permission, operatorId, from, to, reason); err != nil {
		fmt.Printf("permission approval log failed for %s: %v\n", permission.GetId(), err)
	}

	snapshot := *permission
	util.SafeGoroutine(func() {
		notifyPermissionApproval(&snapshot, operatorId, from, to, reason)
	})
}

func getPermissionNotifyProvider(organization string) (*Provider, error) {
	application, err := GetApplicationByOrganizationName(organization)
	if err != nil || application == nil {
		return nil, err
	}
	return application.GetEmailProvider("All")
}

func notifyPermissionApproval(permission *Permission, operatorId, from, to, reason string) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("permission approval notification panic: %v\n", r)
		}
	}()

	var title, content string
	var dest []string

	switch {
	case to == PermissionStatePending && (from != PermissionStateApproved || reason == PermissionReasonContentChanged):
		// new submission or resubmission: notify org admins
		users, err := GetUsers(permission.Owner)
		if err != nil {
			return
		}
		for _, u := range users {
			if u.IsAdmin && u.Email != "" {
				dest = append(dest, u.Email)
			}
		}
		title = fmt.Sprintf("Permission awaiting approval: %s", permission.GetId())
		content = fmt.Sprintf("Permission %s was submitted by %s and is waiting for approval.", permission.GetId(), permission.Submitter)
	case to == PermissionStateApproved || to == PermissionStateRejected:
		user, err := GetUser(util.GetId(permission.Owner, permission.Submitter))
		if err != nil || user == nil || user.Email == "" {
			return
		}
		dest = []string{user.Email}
		title = fmt.Sprintf("Permission %s: %s", to, permission.GetId())
		content = fmt.Sprintf("Your permission %s was %s by %s.", permission.GetId(), to, operatorId)
		if reason != "" {
			content += fmt.Sprintf(" Reason: %s", reason)
		}
	default:
		return
	}

	if len(dest) == 0 {
		return
	}

	provider, err := getPermissionNotifyProvider(permission.Owner)
	if err != nil || provider == nil {
		return
	}

	if err = SendEmail(provider, title, content, dest, "JetAuth"); err != nil {
		fmt.Printf("permission approval email failed for %s: %v\n", permission.GetId(), err)
	}
}
