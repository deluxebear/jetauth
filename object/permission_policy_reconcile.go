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
	"fmt"
)

// InitPermissionPolicyReconciliation is an idempotent startup migration. Before the policy rows
// were gated on the approval state, Pending and Rejected permissions also had live casbin rows
// (and were enforced by /api/enforce). This removes the rows of every non-approved permission.
// It is safe to run on every boot: a clean database costs a single SELECT.
func InitPermissionPolicyReconciliation() {
	removed, err := ReconcilePermissionPolicies()
	if err != nil {
		fmt.Printf("permission policy reconciliation finished with errors: %v\n", err)
	}
	if removed > 0 {
		fmt.Printf("permission policy reconciliation: removed policy rows of %d non-approved permission(s)\n", removed)
	}
}

// ReconcilePermissionPolicies removes the policy rows of permissions that are not live and
// returns how many permissions had rows removed. A failure on one permission (for example a
// deleted model) does not stop the others; the first error is returned.
func ReconcilePermissionPolicies() (int, error) {
	permissions := []*Permission{}
	err := ormer.Engine.Where("state <> '' AND state <> ?", PermissionStateApproved).Find(&permissions)
	if err != nil {
		return 0, err
	}

	var firstErr error
	removed := 0
	for _, permission := range permissions {
		if permission.IsPolicyLive() {
			continue
		}
		has, err := permissionHasPolicyRows(permission)
		if err == nil && !has {
			continue
		}
		if err = removePolicies(permission); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("%s: %w", permission.GetId(), err)
			}
			continue
		}
		removed++
	}
	return removed, firstErr
}

func permissionHasPolicyRows(permission *Permission) (bool, error) {
	enforcer, err := newPermissionEnforcer(permission)
	if err != nil {
		return false, err
	}
	policies, err := enforcer.GetPolicy()
	if err != nil {
		return false, err
	}
	return len(policies) > 0, nil
}
