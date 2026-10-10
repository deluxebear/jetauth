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
	"sort"
	"strings"

	"github.com/casbin/casbin/v3/model"
)

// Validation messages. They double as i18n keys in the "permission" section of
// the backend locale files; controllers translate them with c.T.
const (
	PermissionErrNoSubject = "Permission must have at least one user or role"
	PermissionErrNoRes     = "Permission must have at least one resource"
	PermissionErrNoAction  = "Permission must have at least one action"
	PermissionErrDomains   = "The model of the permission has no domain-aware role definition (g = _, _, _), so domains must be empty"
)

// PermissionValidationError is a field-level validation failure whose Error()
// text is the English i18n key.
type PermissionValidationError struct {
	Msg string
}

func (e *PermissionValidationError) Error() string { return e.Msg }

// PermissionModelSupport describes which permission fields a Casbin model can make use of.
type PermissionModelSupport struct {
	HasRole   bool // model has a role_definition: Roles are honoured
	HasDomain bool // a role definition with 3 arguments (g = _, _, _): Domains are honoured
}

// GetPermissionModelSupport inspects a parsed Casbin model.
func GetPermissionModelSupport(m model.Model) PermissionModelSupport {
	s := PermissionModelSupport{HasRole: HasRoleDefinition(m)}
	if !s.HasRole {
		return s
	}
	for ptype, ast := range m["g"] {
		if ast == nil || !strings.HasPrefix(ptype, "g") {
			continue
		}
		if len(strings.Split(ast.Value, ",")) >= 3 {
			s.HasDomain = true
		}
	}
	return s
}

func (p *Permission) modelSupport() (PermissionModelSupport, error) {
	m, err := p.getEnforcerModel()
	if err != nil {
		return PermissionModelSupport{}, err
	}
	return GetPermissionModelSupport(m), nil
}

// validatePermissionFieldValues is the pure part of save-time validation.
// Groups are deliberately not a subject: they never generate policies.
// checkDomains is false when the domains/model are unchanged from the stored
// record, so legacy data does not block unrelated edits.
func validatePermissionFieldValues(p *Permission, support PermissionModelSupport, checkDomains bool) error {
	hasSubject := len(p.Users) > 0 || (support.HasRole && len(p.Roles) > 0)
	if !hasSubject {
		return &PermissionValidationError{PermissionErrNoSubject}
	}
	if len(p.Resources) == 0 {
		return &PermissionValidationError{PermissionErrNoRes}
	}
	if len(p.Actions) == 0 {
		return &PermissionValidationError{PermissionErrNoAction}
	}
	if checkDomains && len(p.Domains) > 0 && !support.HasDomain {
		return &PermissionValidationError{PermissionErrDomains}
	}
	return nil
}

// ValidatePermissionFields checks the permission against its model. old may be nil.
func ValidatePermissionFields(p, old *Permission) error {
	support, err := p.modelSupport()
	if err != nil {
		return err
	}
	checkDomains := old == nil || p.Model != old.Model || !sameStringSet(p.Domains, old.Domains)
	return validatePermissionFieldValues(p, support, checkDomains)
}

func sameStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	x := append([]string(nil), a...)
	y := append([]string(nil), b...)
	sort.Strings(x)
	sort.Strings(y)
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

// permissionPolicyFieldsChanged reports whether any field that affects the
// generated policies (or whether they are enforced) differs.
func permissionPolicyFieldsChanged(old, p *Permission) bool {
	return old.Model != p.Model ||
		old.Adapter != p.Adapter ||
		old.ResourceType != p.ResourceType ||
		old.Effect != p.Effect ||
		old.IsEnabled != p.IsEnabled ||
		!sameStringSet(old.Users, p.Users) ||
		!sameStringSet(old.Groups, p.Groups) ||
		!sameStringSet(old.Roles, p.Roles) ||
		!sameStringSet(old.Domains, p.Domains) ||
		!sameStringSet(old.Resources, p.Resources) ||
		!sameStringSet(old.Actions, p.Actions)
}
