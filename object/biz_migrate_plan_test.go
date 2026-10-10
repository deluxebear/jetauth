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
	"testing"
)

func issuesOf(plan *bizMigrationPlan, kind, entity, field string) []BizMigrationIssue {
	var out []BizMigrationIssue
	for _, is := range plan.Issues {
		if is.Kind == kind && is.Entity == entity && (field == "" || is.Field == field) {
			out = append(out, is)
		}
	}
	return out
}

func TestBuildBizMigrationPlanMapsRolesAndPermissions(t *testing.T) {
	plan := buildBizMigrationPlan(bizMigrationInput{
		Organization: "org", AppName: "app", SupportsDeny: false,
		ExistingRoleNames: map[string]bool{"shared": true},
		Roles: []*Role{
			{Owner: "org", Name: "editor", Users: []string{"org/alice", "org/alice", " "}, Groups: []string{"org/eng"}, Roles: []string{"org/viewer"}, IsEnabled: true, Domains: []string{"d1"}},
			{Owner: "org", Name: "viewer", IsEnabled: true},
		},
		Permissions: []*Permission{
			{
				Owner: "org", Name: "p-ok", Resources: []string{"/a", "/a", "/b"}, Actions: []string{"GET"}, Effect: "Allow", IsEnabled: true,
				Users: []string{"org/bob"}, Groups: []string{"org/eng"}, Roles: []string{"org/editor", "org/shared", "other/x", "org/ghost"},
				Domains: []string{"dom"}, Model: "perm-built-in", Adapter: "ad", ResourceType: "Application",
			},
			{Owner: "org", Name: "p-deny", Resources: []string{"/a"}, Actions: []string{"GET"}, Effect: "Deny", IsEnabled: true},
			{Owner: "org", Name: "p-noact", Resources: []string{"/a"}, Effect: "Allow"},
			{Owner: "org", Name: "p-nores", Actions: []string{"GET"}},
			{Owner: "org", Name: "p-state", Resources: []string{"/z"}, Actions: []string{"GET"}, State: "Pending"},
		},
	})

	if len(plan.Roles) != 2 || plan.Roles[0].Name != "editor" {
		t.Fatalf("roles: %+v", plan.Roles)
	}
	// duplicate + blank users removed; one user and one group member
	if got := plan.Roles[0].Members; len(got) != 2 || got[0] != (bizMigrationSubject{Type: "user", Id: "org/alice"}) || got[1].Type != "group" {
		t.Fatalf("members: %+v", got)
	}
	if len(plan.Edges) != 1 || plan.Edges[0] != (bizMigrationEdge{Parent: "editor", Child: "viewer"}) {
		t.Fatalf("edges: %+v", plan.Edges)
	}
	if len(issuesOf(plan, BizMigrationUnmappable, "role", "domains")) != 1 {
		t.Fatalf("expected role domains issue: %+v", plan.Issues)
	}

	byName := map[string]*plannedBizPermission{}
	for _, p := range plan.Permissions {
		byName[p.Perm.Name] = p
	}
	if len(byName) != 2 || byName["p-ok"] == nil || byName["p-state"] == nil {
		t.Fatalf("valid permissions: %v", byName)
	}
	ok := byName["p-ok"]
	if fmt.Sprint(ok.Perm.Resources) != "[/a /b]" || ok.Perm.Effect != EffectAllow || ok.Perm.State != StateApproved {
		t.Fatalf("p-ok mapped wrong: %+v", ok.Perm)
	}
	// user, group, role editor, role shared; other-org and ghost roles dropped
	gotG := map[string]bool{}
	for _, g := range ok.Grantees {
		gotG[g.Type+":"+g.Id] = true
	}
	for _, want := range []string{"user:org/bob", "group:org/eng", "role:editor", "role:shared"} {
		if !gotG[want] {
			t.Errorf("missing grantee %s in %v", want, gotG)
		}
	}
	if len(ok.Grantees) != 4 {
		t.Errorf("grantees: %+v", ok.Grantees)
	}
	if byName["p-state"].Perm.State != StatePending {
		t.Errorf("state not preserved")
	}
	for _, f := range []string{"domains", "model", "adapter", "resourceType", "roles"} {
		if len(issuesOf(plan, BizMigrationUnmappable, "permission", f)) == 0 {
			t.Errorf("expected unmappable issue for %s", f)
		}
	}
	// deny on allow-only model, no actions, no resources -> invalid
	if n := len(issuesOf(plan, BizMigrationInvalid, "permission", "")); n != 3 {
		t.Errorf("expected 3 invalid permissions, got %d: %+v", n, plan.Issues)
	}
}

func TestBuildBizMigrationPlanDenyAllowedWhenModelSupportsIt(t *testing.T) {
	plan := buildBizMigrationPlan(bizMigrationInput{
		Organization: "org", AppName: "app", SupportsDeny: true,
		Permissions: []*Permission{{Name: "d", Resources: []string{"/a"}, Actions: []string{"GET"}, Effect: "Deny", Users: []string{"org/u"}}},
	})
	if len(plan.Permissions) != 1 || plan.Permissions[0].Perm.Effect != EffectDeny {
		t.Fatalf("deny permission should migrate: %+v", plan)
	}
}

func TestBuildBizMigrationPlanSubRoleIssues(t *testing.T) {
	plan := buildBizMigrationPlan(bizMigrationInput{
		Organization: "org", AppName: "app",
		Roles: []*Role{{Name: "a", Roles: []string{"other/b", "org/missing"}}},
	})
	if len(plan.Edges) != 0 || len(issuesOf(plan, BizMigrationUnmappable, "inheritance", "")) != 2 {
		t.Fatalf("plan: %+v", plan)
	}
}

func TestAcceptInheritanceEdges(t *testing.T) {
	existing := []bizMigrationEdge{{Parent: "a", Child: "b"}} // b inherits a
	planned := []bizMigrationEdge{
		{Parent: "a", Child: "b"}, // already present -> dropped silently
		{Parent: "b", Child: "c"}, // ok
		{Parent: "c", Child: "a"}, // a -> b -> c -> a would be a cycle
		{Parent: "x", Child: "x"}, // self
	}
	accepted, issues := acceptInheritanceEdges(existing, planned)
	if len(accepted) != 1 || accepted[0] != (bizMigrationEdge{Parent: "b", Child: "c"}) {
		t.Fatalf("accepted: %+v", accepted)
	}
	if len(issues) != 2 {
		t.Fatalf("issues: %+v", issues)
	}
}

func TestAcceptInheritanceEdgesDepthLimit(t *testing.T) {
	var planned []bizMigrationEdge
	// chain of MaxBizRoleInheritanceDepth+1 edges: the last one is rejected
	for i := 0; i < MaxBizRoleInheritanceDepth+1; i++ {
		planned = append(planned, bizMigrationEdge{Parent: fmt.Sprintf("r%d", i), Child: fmt.Sprintf("r%d", i+1)})
	}
	accepted, issues := acceptInheritanceEdges(nil, planned)
	if len(accepted) != MaxBizRoleInheritanceDepth || len(issues) != 1 {
		t.Fatalf("accepted=%d issues=%d", len(accepted), len(issues))
	}
}
