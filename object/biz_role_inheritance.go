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

	"github.com/deluxebear/casdoor/util"
)

const MaxBizRoleInheritanceDepth = 10

type BizRoleInheritance struct {
	ParentRoleId int64  `xorm:"pk notnull index(ux_parent)" json:"parentRoleId"`
	ChildRoleId  int64  `xorm:"pk notnull index(ux_child)" json:"childRoleId"`
	CreatedTime  string `xorm:"varchar(100)" json:"createdTime"`
}

// AddBizRoleInheritance enforces:
// 1. parent and child exist + same organization
// 2. No self-inheritance
// 3. No cycle (DFS from parent upward; if child appears, reject)
// 4. Depth ≤ MaxBizRoleInheritanceDepth
// 5. Scope rule: child may inherit from parent whose scope is 'org' (app→org OK,
//    org→app BLOCKED to prevent permission leakage to sibling apps)
func AddBizRoleInheritance(parentRoleId, childRoleId int64) (bool, error) {
	if parentRoleId == childRoleId {
		return false, fmt.Errorf("role cannot inherit from itself")
	}

	parent, err := getBizRoleById(parentRoleId)
	if err != nil || parent == nil {
		return false, fmt.Errorf("parent role not found: id=%d", parentRoleId)
	}
	child, err := getBizRoleById(childRoleId)
	if err != nil || child == nil {
		return false, fmt.Errorf("child role not found: id=%d", childRoleId)
	}

	if parent.Organization != child.Organization {
		return false, fmt.Errorf("inheritance must be within the same organization")
	}

	// Idempotent on duplicate PK: if already linked, return (true, nil) before
	// running any topology checks (no new edge → no new topology to validate).
	existing := &BizRoleInheritance{ParentRoleId: parentRoleId, ChildRoleId: childRoleId}
	found, err := ormer.Engine.Get(existing)
	if err != nil {
		return false, err
	}
	if found {
		return true, nil
	}

	// Scope rule: org role cannot inherit from app role
	if parent.IsOrgScope() != child.IsOrgScope() {
		// Child is app-scope, parent is org-scope → ALLOWED (app inherits org)
		// Child is org-scope, parent is app-scope → REJECTED
		if child.IsOrgScope() && !parent.IsOrgScope() {
			return false, fmt.Errorf("org-scope role cannot inherit from app-scope role (would leak permissions across apps)")
		}
	}

	// Scope rule (both app-scope): parent and child must belong to the same app.
	// Cross-app inheritance between sibling apps would flatten the parent's
	// members into the child app's Casbin g-rules (via ExpandRoleAncestors in
	// computeRoleGPolicies), granting parent-app members permission in the
	// child app — the same kind of leakage the org→app check above prevents.
	if !parent.IsOrgScope() && !child.IsOrgScope() && parent.AppName != child.AppName {
		return false, fmt.Errorf("app-scope role cannot inherit from an app-scope role in a different app (would leak permissions across sibling apps)")
	}

	// Cycle detection + ancestor-side depth (edges above parent, inclusive of
	// the starting node at depth=1 → #edges above parent = ancestorDepth - 1).
	cycle, ancestorDepth, err := detectInheritanceCycle(parentRoleId, childRoleId)
	if err != nil {
		return false, err
	}
	if cycle {
		return false, fmt.Errorf("adding this inheritance would create a cycle")
	}

	// Descendant-side depth (edges below child). The proposed new edge adds 1.
	// Total chain edges through new edge = (ancestorDepth - 1) + 1 + descendantDepth
	//                                    = ancestorDepth + descendantDepth.
	descendantDepth, err := maxDescendantDepth(childRoleId)
	if err != nil {
		return false, err
	}
	totalDepth := ancestorDepth + descendantDepth
	if totalDepth > MaxBizRoleInheritanceDepth {
		return false, fmt.Errorf("inheritance depth %d would exceed maximum of %d", totalDepth, MaxBizRoleInheritanceDepth)
	}

	link := &BizRoleInheritance{
		ParentRoleId: parentRoleId,
		ChildRoleId:  childRoleId,
		CreatedTime:  util.GetCurrentTime(),
	}
	affected, err := ormer.Engine.Insert(link)
	if err != nil {
		return false, err
	}
	if affected != 0 {
		SyncAfterInheritanceChanged(child.Organization, child.AppName, childRoleId)
	}
	return affected != 0, nil
}

func RemoveBizRoleInheritance(parentRoleId, childRoleId int64) (bool, error) {
	affected, err := ormer.Engine.Where(
		"parent_role_id = ? AND child_role_id = ?",
		parentRoleId, childRoleId,
	).Delete(&BizRoleInheritance{})
	if err != nil {
		return false, err
	}
	if affected != 0 {
		if child, _ := getBizRoleById(childRoleId); child != nil {
			SyncAfterInheritanceChanged(child.Organization, child.AppName, childRoleId)
		}
	}
	return affected != 0, nil
}

// ListParentRoles: all direct parents of a role (one level up)
func ListParentRoles(childRoleId int64) ([]*BizRole, error) {
	roles := []*BizRole{}
	err := ormer.Engine.
		Join("INNER", "biz_role_inheritance", "biz_role.id = biz_role_inheritance.parent_role_id").
		Where("biz_role_inheritance.child_role_id = ?", childRoleId).
		Find(&roles)
	return roles, err
}

// ListChildRoles: all direct children (one level down) — for deletion protection
func ListChildRoles(parentRoleId int64) ([]*BizRole, error) {
	roles := []*BizRole{}
	err := ormer.Engine.
		Join("INNER", "biz_role_inheritance", "biz_role.id = biz_role_inheritance.child_role_id").
		Where("biz_role_inheritance.parent_role_id = ?", parentRoleId).
		Find(&roles)
	return roles, err
}

func HasChildrenOfRole(roleId int64) (bool, error) {
	count, err := ormer.Engine.Where("parent_role_id = ?", roleId).Count(&BizRoleInheritance{})
	return count > 0, err
}

// detectInheritanceCycle walks upward from the proposed parent. If it ever sees
// the proposed child, a cycle would form. Also returns max depth reached so
// caller can enforce MaxBizRoleInheritanceDepth.
func detectInheritanceCycle(parentRoleId, childRoleId int64) (cycle bool, maxDepth int, err error) {
	visited := map[int64]bool{parentRoleId: true}
	var walk func(roleId int64, depth int) error
	walk = func(roleId int64, depth int) error {
		if depth > MaxBizRoleInheritanceDepth+1 {
			// Soft cap to prevent pathological runaways; real check in caller
			return nil
		}
		if depth > maxDepth {
			maxDepth = depth
		}
		links := []*BizRoleInheritance{}
		if err := ormer.Engine.Where("child_role_id = ?", roleId).Find(&links); err != nil {
			return err
		}
		for _, link := range links {
			if link.ParentRoleId == childRoleId {
				cycle = true
				return nil
			}
			if visited[link.ParentRoleId] {
				continue
			}
			visited[link.ParentRoleId] = true
			if err := walk(link.ParentRoleId, depth+1); err != nil {
				return err
			}
			if cycle {
				return nil
			}
		}
		return nil
	}
	err = walk(parentRoleId, 1)
	return
}

// maxDescendantDepth walks downward from the given role and returns the longest
// chain of descendants in edges (0 if the role has no descendants).
func maxDescendantDepth(roleId int64) (int, error) {
	visited := map[int64]bool{roleId: true}
	max := 0
	var walk func(id int64, depth int) error
	walk = func(id int64, depth int) error {
		if depth > MaxBizRoleInheritanceDepth+2 {
			return nil // safety cap against pathological data
		}
		if depth > max {
			max = depth
		}
		links := []*BizRoleInheritance{}
		if err := ormer.Engine.Where("parent_role_id = ?", id).Find(&links); err != nil {
			return err
		}
		for _, link := range links {
			if visited[link.ChildRoleId] {
				continue
			}
			visited[link.ChildRoleId] = true
			if err := walk(link.ChildRoleId, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(roleId, 0); err != nil {
		return 0, err
	}
	return max, nil
}

// ExpandRoleDescendants: all descendants of a role (transitive closure
// downward). Used when a group's users change and we need to find every role
// that transitively has that group as a member (the descendants inherit the
// group via ancestry expansion in computeRoleGPolicies).
func ExpandRoleDescendants(roleId int64) ([]int64, error) {
	descendants := []int64{}
	visited := map[int64]bool{}
	var walk func(id int64, depth int) error
	walk = func(id int64, depth int) error {
		if depth > MaxBizRoleInheritanceDepth {
			return nil
		}
		links := []*BizRoleInheritance{}
		if err := ormer.Engine.Where("parent_role_id = ?", id).Find(&links); err != nil {
			return err
		}
		for _, link := range links {
			if visited[link.ChildRoleId] {
				continue
			}
			visited[link.ChildRoleId] = true
			descendants = append(descendants, link.ChildRoleId)
			if err := walk(link.ChildRoleId, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(roleId, 1); err != nil {
		return nil, err
	}
	return descendants, nil
}

// ExpandRoleAncestors: all ancestors of a role (transitive closure upward).
// Used by sync engine to flatten inheritance into Casbin g-rules.
func ExpandRoleAncestors(roleId int64) ([]int64, error) {
	ancestors := []int64{}
	visited := map[int64]bool{}
	var walk func(id int64, depth int) error
	walk = func(id int64, depth int) error {
		if depth > MaxBizRoleInheritanceDepth {
			return nil
		}
		links := []*BizRoleInheritance{}
		if err := ormer.Engine.Where("child_role_id = ?", id).Find(&links); err != nil {
			return err
		}
		for _, link := range links {
			if visited[link.ParentRoleId] {
				continue
			}
			visited[link.ParentRoleId] = true
			ancestors = append(ancestors, link.ParentRoleId)
			if err := walk(link.ParentRoleId, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(roleId, 1); err != nil {
		return nil, err
	}
	return ancestors, nil
}
