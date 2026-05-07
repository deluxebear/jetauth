// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"testing"

	"github.com/deluxebear/jetauth/util"
)

func TestBizReBACTupleAudit_RoundTrip(t *testing.T) {
	if ormer == nil {
		t.Skip("ormer not initialised (test needs DB)")
	}
	owner := "rebac-it-" + util.GenerateUUID()[:8]
	if _, err := AddBizReBACTupleAudit(&BizReBACTupleAudit{
		Owner: owner, AppName: "x",
		Op:        "write",
		Object:    "document:d1",
		Relation:  "viewer",
		User:      "user:alice",
		ActorUser: "admin",
	}); err != nil {
		t.Fatal(err)
	}
	list, err := ListTupleAuditForApp(owner, "x", AuditFilterAll, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Op != "write" {
		t.Fatalf("got %+v", list)
	}
}
