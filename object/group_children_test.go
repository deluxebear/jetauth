// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestGetGroupIdsWithChildren(t *testing.T) {
	initBizRoleTestDb(t)
	org := "grp-test-" + util.GenerateId()
	parent := &Group{Owner: org, Name: "p-" + util.GenerateId(), ParentId: org, IsTopGroup: true}
	leaf := &Group{Owner: org, Name: "l-" + util.GenerateId(), ParentId: org, IsTopGroup: true}
	child := &Group{Owner: org, Name: "c-" + util.GenerateId(), ParentId: parent.Name}
	for _, g := range []*Group{parent, leaf, child} {
		if _, err := ormer.Engine.Insert(g); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { _, _ = ormer.Engine.Where("owner = ?", org).Delete(&Group{}) })

	got, err := GetGroupIdsWithChildren([]*Group{parent, leaf, child})
	if err != nil {
		t.Fatal(err)
	}
	if !got[parent.GetId()] || got[leaf.GetId()] || got[child.GetId()] || len(got) != 1 {
		t.Fatalf("got %v, want only %s", got, parent.GetId())
	}
}
