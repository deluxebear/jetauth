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
)

// BizError carries a translatable error template with arguments.
// The controller layer translates the template via c.T() before formatting.
type BizError struct {
	Namespace string        // e.g. "biz"
	Template  string        // e.g. `Cannot delete role "%s": it is inherited by role "%s"`
	Args      []interface{} // e.g. ["admin", "editor"]
}

func (e *BizError) Error() string {
	return fmt.Sprintf(e.Namespace+":"+e.Template, e.Args...)
}

// newBizError creates a BizError with the "biz" namespace.
func newBizError(template string, args ...interface{}) *BizError {
	return &BizError{Namespace: "biz", Template: template, Args: args}
}

// Effect and State constants
const (
	EffectAllow = "Allow"
	EffectDeny  = "Deny"

	StateApproved = "Approved"
	StatePending  = "Pending"
	StateRejected = "Rejected"
)

// Error messages use "biz:" namespace for i18n translation.
// Controller layer translates them via c.T() before returning to client.

// validateBizPermission validates a BizPermission row before add or update.
//
// Grantees (users/roles) moved to the biz_permission_grantee table and are
// validated at that table's add path. This function only checks the row's
// own shape (identity, resources/actions, effect, approval state).
func validateBizPermission(perm *BizPermission) error {
	if strings.TrimSpace(perm.Owner) == "" || strings.TrimSpace(perm.AppName) == "" {
		return newBizError("Permission owner and appName cannot be empty")
	}
	if strings.TrimSpace(perm.Name) == "" {
		return newBizError("Permission name cannot be empty")
	}

	perm.Resources = dedup(perm.Resources)
	perm.Actions = dedup(perm.Actions)

	if len(perm.Resources) == 0 {
		return newBizError("Permission must have at least one resource")
	}
	if len(perm.Actions) == 0 {
		return newBizError("Permission must have at least one action")
	}

	if perm.Effect != EffectAllow && perm.Effect != EffectDeny {
		return newBizError("Effect must be \"%s\" or \"%s\", got \"%s\"", EffectAllow, EffectDeny, perm.Effect)
	}

	// Deny only takes effect when the app's Casbin model actually honors it.
	// Fail at save time rather than at enforce time — a silent "Deny that
	// behaves like Allow" is the worst kind of security bug.
	if perm.Effect == EffectDeny {
		if err := validateAppModelSupportsDeny(perm.Owner, perm.AppName); err != nil {
			return err
		}
	}

	if perm.State != "" && perm.State != StateApproved && perm.State != StatePending && perm.State != StateRejected {
		return newBizError("State must be \"%s\", \"%s\", or \"%s\", got \"%s\"", StateApproved, StatePending, StateRejected, perm.State)
	}

	return nil
}

// validateAppModelSupportsDeny rejects a Deny permission when the app's
// model would silently ignore it. Reuses modelTextSupportsDeny so the save-
// time check and the computed JSON flag can't drift.
func validateAppModelSupportsDeny(owner, appName string) error {
	config, err := getBizAppConfig(owner, appName)
	if err != nil {
		return err
	}
	if config == nil || config.ModelText == "" {
		return newBizError(
			"Effect=Deny requires an app model that honors deny, but app \"%s/%s\" has no model configured yet",
			owner, appName,
		)
	}
	if !modelTextSupportsDeny(config.ModelText) {
		return newBizError(
			"Effect=Deny is not supported by app \"%s/%s\" — the model's [policy_definition] p must include p_eft AND [policy_effect] must reference p.eft == deny (e.g. `!some(where (p.eft == deny)) && some(where (p.eft == allow))`)",
			owner, appName,
		)
	}
	return nil
}

// ── Helpers ──

func dedup(ss []string) []string {
	if len(ss) == 0 {
		return ss
	}
	seen := make(map[string]bool, len(ss))
	result := make([]string, 0, len(ss))
	for _, s := range ss {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	return result
}

