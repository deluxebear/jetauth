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

// permission_enforcer_invalidate.go decides WHEN cached permission enforcers
// are dropped.
//
// Instead of sprinkling invalidation calls over every write path (and missing
// the next one someone adds), the Role, Permission, Model and Adapter beans
// implement xorm's After{Insert,Update,Delete} processors. Xorm runs them for
// every bean-based write, including slice inserts and writes inside a
// transaction (deferred until commit), so any code that goes through the ORM
// invalidates automatically:
//
//	Role       -> owner (org)         roles feed the runtime g rules; the entry
//	                                  records every role owner it consulted
//	Permission -> permission id       entries record the ids they loaded
//	Model      -> model owner         entries record the model owner
//	Adapter    -> adapter owner       entries record the adapter owner
//
// A bean that does not identify a single row (a partial bean used by
// "UPDATE ... WHERE", or the empty bean xorm hands to Delete) flushes the
// whole cache, which is always safe.
//
// Policy rows (permission_rule) are not ORM beans of the objects above, so the
// code that writes them (addPolicies/removePolicies and the Enforcer entity
// policy API) invalidates explicitly.
//
// Group membership does not need a hook: platform enforcers only read
// role.Users and role.Roles; role.Groups and user.Groups are used when
// *selecting* permissions for a user, and that selection is never cached.
// Deleting or renaming a user rewrites role.Users through the ORM, which
// fires the Role hook.

package object

// permissionEnforcerBroadcaster is set by the Redis watcher to forward local
// invalidations to the other instances.
var permissionEnforcerBroadcaster func(scope string, values []string)

const (
	permissionEnforcerScopePermission = "permission"
	permissionEnforcerScopeOwner      = "owner"
	permissionEnforcerScopeAll        = "all"
)

// InvalidatePermissionEnforcers drops the cached enforcers built from any of
// the given permission ids, locally and on peer instances.
func InvalidatePermissionEnforcers(permissionIds ...string) {
	if len(permissionIds) == 0 {
		return
	}
	applyPermissionEnforcerInvalidation(permissionEnforcerScopePermission, permissionIds, "local")
	broadcastPermissionEnforcerInvalidation(permissionEnforcerScopePermission, permissionIds)
}

// InvalidatePermissionEnforcersByOwner drops every cached enforcer that
// depends on the organization (permissions, roles, model or adapter).
func InvalidatePermissionEnforcersByOwner(owner string) {
	if owner == "" {
		InvalidateAllPermissionEnforcers()
		return
	}
	applyPermissionEnforcerInvalidation(permissionEnforcerScopeOwner, []string{owner}, "local")
	broadcastPermissionEnforcerInvalidation(permissionEnforcerScopeOwner, []string{owner})
}

// InvalidateAllPermissionEnforcers flushes every cached enforcer.
func InvalidateAllPermissionEnforcers() {
	applyPermissionEnforcerInvalidation(permissionEnforcerScopeAll, nil, "local")
	broadcastPermissionEnforcerInvalidation(permissionEnforcerScopeAll, nil)
}

// applyPermissionEnforcerInvalidation touches only this process' cache.
func applyPermissionEnforcerInvalidation(scope string, values []string, source string) {
	cache := getPermissionEnforcerCache()
	if cache == nil {
		return
	}
	permissionEnforcerCacheInvalidations.WithLabelValues(scope, source).Inc()
	switch scope {
	case permissionEnforcerScopePermission:
		cache.InvalidatePermissions(values...)
	case permissionEnforcerScopeOwner:
		for _, v := range values {
			cache.InvalidateOwner(v)
		}
	default:
		cache.InvalidateAll()
	}
}

func broadcastPermissionEnforcerInvalidation(scope string, values []string) {
	if b := permissionEnforcerBroadcaster; b != nil {
		b(scope, values)
	}
}

// ---- xorm hooks -----------------------------------------------------------

func (role *Role) invalidatePermissionEnforcers() {
	if role.Owner == "" || role.Name == "" {
		InvalidateAllPermissionEnforcers()
		return
	}
	InvalidatePermissionEnforcersByOwner(role.Owner)
}

func (role *Role) AfterInsert() { role.invalidatePermissionEnforcers() }
func (role *Role) AfterUpdate() { role.invalidatePermissionEnforcers() }
func (role *Role) AfterDelete() { role.invalidatePermissionEnforcers() }

func (p *Permission) invalidatePermissionEnforcers() {
	if p.Owner == "" || p.Name == "" {
		InvalidateAllPermissionEnforcers()
		return
	}
	InvalidatePermissionEnforcers(p.GetId())
}

func (p *Permission) AfterInsert() { p.invalidatePermissionEnforcers() }
func (p *Permission) AfterUpdate() { p.invalidatePermissionEnforcers() }
func (p *Permission) AfterDelete() { p.invalidatePermissionEnforcers() }

func (m *Model) invalidatePermissionEnforcers() {
	if m.Owner == "" || m.Name == "" {
		InvalidateAllPermissionEnforcers()
		return
	}
	InvalidatePermissionEnforcersByOwner(m.Owner)
}

func (m *Model) AfterInsert() { m.invalidatePermissionEnforcers() }
func (m *Model) AfterUpdate() { m.invalidatePermissionEnforcers() }
func (m *Model) AfterDelete() { m.invalidatePermissionEnforcers() }

func (adapter *Adapter) invalidatePermissionEnforcers() {
	if adapter.Owner == "" || adapter.Name == "" {
		InvalidateAllPermissionEnforcers()
		return
	}
	InvalidatePermissionEnforcersByOwner(adapter.Owner)
}

func (adapter *Adapter) AfterInsert() { adapter.invalidatePermissionEnforcers() }
func (adapter *Adapter) AfterUpdate() { adapter.invalidatePermissionEnforcers() }
func (adapter *Adapter) AfterDelete() { adapter.invalidatePermissionEnforcers() }
