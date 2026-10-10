// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
)

// Data scope types a biz role may declare in properties.dataScope.type.
const (
	BizDataScopeAll             = "all"
	BizDataScopeOrg             = "org"
	BizDataScopeDept            = "dept"
	BizDataScopeDeptAndChildren = "dept_and_children"
	BizDataScopeSelf            = "self"
	BizDataScopeCustom          = "custom"
	// BizDataScopeNone is only produced by the merge helper when no role of
	// the user declares a data scope. It is not a valid stored value.
	BizDataScopeNone = "none"
)

const (
	bizRolePropertiesMaxBytes   = 16 * 1024
	bizRolePropertiesMaxKeys    = 50
	bizDataScopeMaxValues       = 500
	bizDataScopeMaxValueLen     = 200
	bizDataScopeMaxResources    = 50
	bizRolePropertyDataScopeKey = "dataScope"
)

var bizRolePropertyKeyRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]{0,63}$`)

// bizDataScopeRank orders the standard (non-custom) scope types by how much
// data they expose. Higher is more permissive.
var bizDataScopeRank = map[string]int{
	BizDataScopeSelf:            1,
	BizDataScopeDept:            2,
	BizDataScopeDeptAndChildren: 3,
	BizDataScopeOrg:             4,
	BizDataScopeAll:             5,
}

// BizDataScope is the structured data-scope declaration stored under
// biz_role.properties["dataScope"].
//
//	{"type":"custom","values":["dept-1","dept-2"],
//	 "resources":{"orders":{"type":"self"}}}
//
// Resources optionally overrides the default scope per business resource.
type BizDataScope struct {
	Type      string                  `json:"type"`
	Values    []string                `json:"values,omitempty"`
	Resources map[string]BizDataScope `json:"resources,omitempty"`
}

// BizEffectiveDataScope is the merged data scope of a user in an app.
//
// Merge rule (most permissive wins): among the standard types the order is
// self < dept < dept_and_children < org < all and the highest one wins.
// "custom" values are additive: they are unioned across roles and, when a
// standard type also wins, returned alongside it in Values as extra grants.
// A user whose roles declare no data scope gets Type "none".
type BizEffectiveDataScope struct {
	Type      string                           `json:"type"`
	Values    []string                         `json:"values"`
	Resources map[string]BizEffectiveDataScope `json:"resources,omitempty"`
	Sources   []string                         `json:"sources"` // names of roles that contributed
}

func validBizDataScopeType(t string) bool {
	if t == BizDataScopeCustom {
		return true
	}
	_, ok := bizDataScopeRank[t]
	return ok
}

func validateBizDataScope(ds *BizDataScope, allowResources bool) error {
	if !validBizDataScopeType(ds.Type) {
		return fmt.Errorf("invalid dataScope type %q (expected all, org, dept, dept_and_children, self or custom)", ds.Type)
	}
	if len(ds.Values) > bizDataScopeMaxValues {
		return fmt.Errorf("dataScope values: at most %d entries", bizDataScopeMaxValues)
	}
	for _, v := range ds.Values {
		if v == "" || len(v) > bizDataScopeMaxValueLen {
			return fmt.Errorf("dataScope values must be non-empty strings of at most %d bytes", bizDataScopeMaxValueLen)
		}
	}
	if ds.Type == BizDataScopeCustom && len(ds.Values) == 0 {
		return fmt.Errorf("dataScope type custom requires at least one value")
	}
	if len(ds.Resources) > 0 {
		if !allowResources {
			return fmt.Errorf("dataScope resources cannot be nested")
		}
		if len(ds.Resources) > bizDataScopeMaxResources {
			return fmt.Errorf("dataScope resources: at most %d entries", bizDataScopeMaxResources)
		}
		for name, sub := range ds.Resources {
			if !bizRolePropertyKeyRe.MatchString(name) {
				return fmt.Errorf("invalid dataScope resource name %q", name)
			}
			sub := sub
			if err := validateBizDataScope(&sub, false); err != nil {
				return fmt.Errorf("resource %q: %w", name, err)
			}
		}
	}
	return nil
}

// ParseBizRoleProperties decodes the stored properties JSON. Empty means no
// properties. The returned map is never nil on success.
func ParseBizRoleProperties(raw string) (map[string]json.RawMessage, error) {
	props := map[string]json.RawMessage{}
	if raw == "" {
		return props, nil
	}
	if err := json.Unmarshal([]byte(raw), &props); err != nil {
		return nil, fmt.Errorf("properties must be a JSON object: %w", err)
	}
	return props, nil
}

// ValidateBizRoleProperties checks size, key format and the structure of the
// dataScope entry. A dataScope object without a "type" key (the legacy
// per-resource shape such as {"orders":"department"}) is stored untouched
// and ignored by the merge helper, so existing data keeps saving.
func ValidateBizRoleProperties(raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > bizRolePropertiesMaxBytes {
		return fmt.Errorf("properties too large: at most %d bytes", bizRolePropertiesMaxBytes)
	}
	props, err := ParseBizRoleProperties(raw)
	if err != nil {
		return err
	}
	if len(props) > bizRolePropertiesMaxKeys {
		return fmt.Errorf("properties: at most %d keys", bizRolePropertiesMaxKeys)
	}
	for k := range props {
		if !bizRolePropertyKeyRe.MatchString(k) {
			return fmt.Errorf("invalid property key %q (letters, digits, '_', '.', '-'; must start with a letter or '_'; max 64 chars)", k)
		}
	}
	ds, typed, err := extractBizDataScope(props)
	if err != nil {
		return err
	}
	if typed {
		return validateBizDataScope(ds, true)
	}
	return nil
}

// extractBizDataScope returns the typed data scope, if the dataScope entry is
// in the typed shape. typed is false for absent or legacy entries.
func extractBizDataScope(props map[string]json.RawMessage) (*BizDataScope, bool, error) {
	rawDs, ok := props[bizRolePropertyDataScopeKey]
	if !ok {
		return nil, false, nil
	}
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(rawDs, &probe); err != nil {
		return nil, false, fmt.Errorf("dataScope must be a JSON object")
	}
	if _, hasType := probe["type"]; !hasType {
		return nil, false, nil
	}
	ds := &BizDataScope{}
	if err := json.Unmarshal(rawDs, ds); err != nil {
		return nil, false, fmt.Errorf("invalid dataScope: %w", err)
	}
	return ds, true, nil
}

// GetBizRoleDataScope returns the typed data scope of a role, or nil when the
// role declares none (or only the legacy shape).
func GetBizRoleDataScope(role *BizRole) *BizDataScope {
	if role == nil || role.Properties == "" {
		return nil
	}
	props, err := ParseBizRoleProperties(role.Properties)
	if err != nil {
		return nil
	}
	ds, typed, err := extractBizDataScope(props)
	if err != nil || !typed || validateBizDataScope(ds, true) != nil {
		return nil
	}
	return ds
}

type scopeAcc struct {
	rank   int
	values map[string]struct{}
}

func (a *scopeAcc) add(ds BizDataScope) {
	if ds.Type == BizDataScopeCustom {
		if a.values == nil {
			a.values = map[string]struct{}{}
		}
	} else if r := bizDataScopeRank[ds.Type]; r > a.rank {
		a.rank = r
	}
	for _, v := range ds.Values {
		if a.values == nil {
			a.values = map[string]struct{}{}
		}
		a.values[v] = struct{}{}
	}
}

func (a *scopeAcc) result() (string, []string) {
	vals := make([]string, 0, len(a.values))
	for v := range a.values {
		vals = append(vals, v)
	}
	sort.Strings(vals)
	if a.rank == 0 {
		if a.values == nil {
			return BizDataScopeNone, vals
		}
		return BizDataScopeCustom, vals
	}
	for t, r := range bizDataScopeRank {
		if r == a.rank {
			return t, vals
		}
	}
	return BizDataScopeNone, vals
}

// MergeBizDataScopes merges the data scopes of several roles using the
// most-permissive-wins rule documented on BizEffectiveDataScope. Roles with a
// nil scope are skipped; names are recorded in Sources in input order.
func MergeBizDataScopes(names []string, scopes []*BizDataScope) BizEffectiveDataScope {
	out := BizEffectiveDataScope{Type: BizDataScopeNone, Values: []string{}, Sources: []string{}}
	def := &scopeAcc{}
	resNames := map[string]struct{}{}
	for i, ds := range scopes {
		if ds == nil {
			continue
		}
		out.Sources = append(out.Sources, names[i])
		def.add(*ds)
		for r := range ds.Resources {
			resNames[r] = struct{}{}
		}
	}
	if len(out.Sources) == 0 {
		return out
	}
	out.Type, out.Values = def.result()
	if len(resNames) > 0 {
		out.Resources = map[string]BizEffectiveDataScope{}
		for r := range resNames {
			acc := &scopeAcc{}
			var src []string
			for i, ds := range scopes {
				if ds == nil {
					continue
				}
				// A role without an override for this resource contributes
				// its default scope.
				eff := *ds
				if sub, ok := ds.Resources[r]; ok {
					eff = sub
				}
				acc.add(eff)
				src = append(src, names[i])
			}
			t, v := acc.result()
			out.Resources[r] = BizEffectiveDataScope{Type: t, Values: v, Sources: src}
		}
	}
	return out
}

// bizGetUserRoleObjects resolves the user's role names in an app to BizRole rows.
func bizGetUserRoleObjects(owner, appName, userId string) ([]*BizRole, error) {
	names, err := BizGetUserRoles(owner, appName, userId)
	if err != nil {
		return nil, err
	}
	allRoles, err := GetBizRoles(owner, appName)
	if err != nil {
		return nil, err
	}
	byName := make(map[string]*BizRole, len(allRoles))
	for _, r := range allRoles {
		byName[r.Name] = r
	}
	out := make([]*BizRole, 0, len(names))
	for _, n := range names {
		role := byName[n]
		if role == nil {
			// Enforcer role names may be "owner/name" qualified.
			for i := len(n) - 1; i >= 0; i-- {
				if n[i] == '/' {
					role = byName[n[i+1:]]
					break
				}
			}
		}
		if role != nil && role.IsEnabled {
			out = append(out, role)
		}
	}
	return out, nil
}

// BizGetUserEffectiveDataScope resolves the user's roles in an app and merges
// the data scopes declared on them.
func BizGetUserEffectiveDataScope(owner, appName, userId string) (BizEffectiveDataScope, error) {
	roles, err := bizGetUserRoleObjects(owner, appName, userId)
	if err != nil {
		return BizEffectiveDataScope{}, err
	}
	names := make([]string, 0, len(roles))
	scopes := make([]*BizDataScope, 0, len(roles))
	for _, r := range roles {
		names = append(names, r.Name)
		scopes = append(scopes, GetBizRoleDataScope(r))
	}
	return MergeBizDataScopes(names, scopes), nil
}
