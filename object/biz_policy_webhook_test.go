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
	"testing"
)

func TestNewBizPolicyChangedRecord(t *testing.T) {
	r := newBizPolicyChangedRecord("acme", "erp", 8, BizChangeFullRebuild, 12, 3)
	if r.Action != "biz-policy-changed" {
		t.Fatalf("unexpected action %q", r.Action)
	}
	if r.Organization != "acme" || r.Owner != "acme" {
		t.Fatalf("record must be scoped to the app owner org, got %q/%q", r.Organization, r.Owner)
	}
	var p BizPolicyChangedPayload
	if err := json.Unmarshal([]byte(r.Object), &p); err != nil {
		t.Fatalf("payload not valid JSON: %v", err)
	}
	if p.AppId != "acme/erp" || p.Version != 8 || p.ChangeType != "full_rebuild" || p.PolicyCount != 12 || p.GroupingPolicies != 3 {
		t.Fatalf("unexpected payload: %+v", p)
	}
}

func TestBizPolicyChangedWebhookMatchesSubscribedEvents(t *testing.T) {
	hooks := []*Webhook{
		{Name: "on", IsEnabled: true, Events: []string{BizPolicyChangedEvent}},
		{Name: "other", IsEnabled: true, Events: []string{"login"}},
		{Name: "off", IsEnabled: false, Events: []string{BizPolicyChangedEvent}},
	}
	got := getFilteredWebhooks(hooks, "acme", BizPolicyChangedEvent)
	if len(got) != 1 || got[0].Name != "on" {
		t.Fatalf("expected only the enabled subscribed webhook, got %v", got)
	}
}
