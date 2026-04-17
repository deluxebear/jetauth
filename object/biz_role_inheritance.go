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

	// Scope rule: org role cannot inherit from app role
	if parent.IsOrgScope() != child.IsOrgScope() {
		// Child is app-scope, parent is org-scope → ALLOWED (app inherits org)
		// Child is org-scope, parent is app-scope → REJECTED
		if child.IsOrgScope() && !parent.IsOrgScope() {
			return false, fmt.Errorf("org-scope role cannot inherit from app-scope role (would leak permissions across apps)")
		}
	}

	// Cycle detection
	cycle, depth, err := detectInheritanceCycle(parentRoleId, childRoleId)
	if err != nil {
		return false, err
	}
	if cycle {
		return false, fmt.Errorf("adding this inheritance would create a cycle")
	}
	if depth > MaxBizRoleInheritanceDepth {
		return false, fmt.Errorf("inheritance depth would exceed maximum of %d", MaxBizRoleInheritanceDepth)
	}

	link := &BizRoleInheritance{
		ParentRoleId: parentRoleId,
		ChildRoleId:  childRoleId,
		CreatedTime:  util.GetCurrentTime(),
	}
	affected, err := ormer.Engine.Insert(link)
	return affected != 0, err
}

func RemoveBizRoleInheritance(parentRoleId, childRoleId int64) (bool, error) {
	affected, err := ormer.Engine.Where(
		"parent_role_id = ? AND child_role_id = ?",
		parentRoleId, childRoleId,
	).Delete(&BizRoleInheritance{})
	return affected != 0, err
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
