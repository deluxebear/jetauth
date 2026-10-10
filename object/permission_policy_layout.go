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
	"strings"

	"github.com/casbin/casbin/v3/config"
	"github.com/casbin/casbin/v3/model"
)

// The platform permission system stores p rules in a casbin_rule-shaped table
// with exactly six value columns (v0..v5). The last column (v5) is RESERVED
// for the permission id, regardless of how many fields the model declares:
// the enforcer is loaded with a filter on v5 and rows are removed by v5.
// See docs/permission-policy-layout.md.
const (
	// permissionPolicyWidth is the number of value columns of the adapter.
	permissionPolicyWidth = 6
	// permissionIDColumn is the reserved column holding the permission id.
	permissionIDColumn = permissionPolicyWidth - 1
	// permissionMaxDeclaredFields is the max number of model-declared fields
	// that can coexist with the reserved permission id column.
	permissionMaxDeclaredFields = permissionPolicyWidth - 1

	permissionIDFieldName = "permissionId"
)

// permissionPolicyLayout describes how one permission maps onto the policy
// columns for a given model. Index fields are -1 when absent.
type permissionPolicyLayout struct {
	// Fields are the lower-cased, trimmed model fields (reserved column excluded).
	Fields []string

	Sub, Dom, Obj, Act, Eft int

	// Named is true when sub, obj and act were all recognised by name. When
	// false the legacy positional layout is used.
	Named bool

	// effectCol is where the effect is written when the model has no eft field
	// (kept for compatibility with rows written before this layout existed), or -1.
	effectCol int
}

func fieldRole(name string) string {
	switch strings.ToLower(name) {
	case "sub", "subject", "user":
		return "sub"
	case "dom", "domain", "tenant":
		return "dom"
	case "obj", "object", "res", "resource":
		return "obj"
	case "act", "action":
		return "act"
	case "eft", "effect":
		return "eft"
	}
	return ""
}

// parsePermissionPolicyDefinition returns the declared policy fields of a
// model text, padded to the full adapter width with the permission id last.
// It is the single place that decides which models are accepted.
func parsePermissionPolicyDefinition(modelText string) ([]string, error) {
	cfg, err := config.NewConfigFromText(modelText)
	if err != nil {
		return nil, err
	}

	raw := strings.TrimSpace(cfg.String("policy_definition::p"))
	if raw == "" {
		return nil, fmt.Errorf("the model has no policy_definition p")
	}
	fields := strings.Split(raw, ",")
	for i := range fields {
		fields[i] = strings.TrimSpace(fields[i])
	}

	// permissionId is only meaningful on the reserved column; anywhere else it
	// can never be filtered on.
	for i, f := range fields {
		if f == permissionIDFieldName && i != permissionIDColumn {
			return nil, fmt.Errorf("policy_definition field %q is only allowed as the 6th (last) field, found at position %d", permissionIDFieldName, i+1)
		}
	}

	if len(fields) == permissionPolicyWidth {
		if fields[permissionIDColumn] != permissionIDFieldName {
			return nil, fmt.Errorf("when adding policies with permissions, the sixth field of policy_definition must be %s, got %s; the permission system supports at most %d policy fields, remove or merge a field", permissionIDFieldName, fields[permissionIDColumn], permissionMaxDeclaredFields)
		}
		return fields, nil
	}
	if len(fields) > permissionPolicyWidth {
		return nil, fmt.Errorf("the maximum policy_definition field number cannot exceed %d, got %d", permissionPolicyWidth, len(fields))
	}

	padded := append([]string{}, fields...)
	for len(padded) < permissionIDColumn {
		padded = append(padded, "")
	}
	return append(padded, permissionIDFieldName), nil
}

// newPermissionPolicyLayout builds the layout from a padded definition (as
// returned by parsePermissionPolicyDefinition). nil/short input is padded.
func newPermissionPolicyLayout(padded []string) *permissionPolicyLayout {
	l := &permissionPolicyLayout{Sub: -1, Dom: -1, Obj: -1, Act: -1, Eft: -1, effectCol: -1}

	declared := 0
	for i := 0; i < permissionIDColumn; i++ {
		name := ""
		if i < len(padded) {
			name = strings.ToLower(strings.TrimSpace(padded[i]))
		}
		l.Fields = append(l.Fields, name)
		if name != "" {
			declared = i + 1
		}
		switch fieldRole(name) {
		case "sub":
			if l.Sub < 0 {
				l.Sub = i
			}
		case "dom":
			if l.Dom < 0 {
				l.Dom = i
			}
		case "obj":
			if l.Obj < 0 {
				l.Obj = i
			}
		case "act":
			if l.Act < 0 {
				l.Act = i
			}
		case "eft":
			if l.Eft < 0 {
				l.Eft = i
			}
		}
	}
	l.Named = l.Sub >= 0 && l.Obj >= 0 && l.Act >= 0

	if l.Named && l.Eft < 0 {
		taken := func(i int) bool { return i == l.Sub || i == l.Dom || i == l.Obj || i == l.Act }
		legacy := 3
		if l.Dom >= 0 {
			legacy = 4
		}
		if legacy < permissionIDColumn && !taken(legacy) {
			l.effectCol = legacy
		} else {
			for i := declared; i < permissionIDColumn; i++ {
				if !taken(i) {
					l.effectCol = i
					break
				}
			}
		}
	}
	return l
}

// permissionPolicyLayoutFromModel derives the layout from an already built
// permission model (see GetBuiltInModel).
func permissionPolicyLayoutFromModel(m model.Model) *permissionPolicyLayout {
	padded := make([]string, 0, permissionPolicyWidth)
	if m != nil && m["p"] != nil && m["p"]["p"] != nil {
		for _, tok := range m["p"]["p"].Tokens {
			padded = append(padded, strings.TrimPrefix(tok, "p_"))
		}
	}
	return newPermissionPolicyLayout(padded)
}

// buildRows generates the policy rows for a permission. Each row has exactly
// permissionPolicyWidth values with the permission id on the reserved column.
func (l *permissionPolicyLayout) buildRows(permission *Permission) [][]string {
	var policies [][]string

	permissionId := permission.GetId()
	effect := strings.ToLower(permission.Effect)
	usersAndRoles := append(append([]string{}, permission.Users...), permission.Roles...)

	if !l.Named {
		// Legacy positional layout, shape decided by the permission itself.
		domainExist := len(permission.Domains) > 0
		for _, userOrRole := range usersAndRoles {
			for _, resource := range permission.Resources {
				for _, action := range permission.Actions {
					if domainExist {
						for _, domain := range permission.Domains {
							policies = append(policies, []string{userOrRole, domain, resource, action, effect, permissionId})
						}
					} else {
						policies = append(policies, []string{userOrRole, resource, action, effect, "", permissionId})
					}
				}
			}
		}
		return policies
	}

	domains := []string{""}
	if l.Dom >= 0 && len(permission.Domains) > 0 {
		domains = permission.Domains
	}

	for _, userOrRole := range usersAndRoles {
		for _, resource := range permission.Resources {
			for _, action := range permission.Actions {
				for _, domain := range domains {
					row := make([]string, permissionPolicyWidth)
					row[l.Sub] = userOrRole
					row[l.Obj] = resource
					row[l.Act] = action
					if l.Dom >= 0 {
						row[l.Dom] = domain
					}
					if l.Eft >= 0 {
						row[l.Eft] = effect
					} else if l.effectCol >= 0 {
						row[l.effectCol] = effect
					}
					row[permissionIDColumn] = permissionId
					policies = append(policies, row)
				}
			}
		}
	}
	return policies
}

// valueColumn returns the column holding the given role ("obj" or "act") or
// the legacy default when the model is not name-recognisable.
func (l *permissionPolicyLayout) valueColumn(role string) int {
	if l.Named {
		if role == "obj" {
			return l.Obj
		}
		return l.Act
	}
	if role == "obj" {
		return 1
	}
	return 2
}
