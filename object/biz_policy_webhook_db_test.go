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
	"strings"
	"testing"
	"time"

	"github.com/deluxebear/jetauth/util"
)

func TestSyncFiresBizPolicyChangedWebhook(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)
	hook := &Webhook{
		Owner: "admin", Name: "hook-" + util.GenerateId(), CreatedTime: util.GetCurrentTime(),
		Organization: owner, Url: "http://127.0.0.1:1/never", Method: "POST", ContentType: "application/json",
		Events: []string{BizPolicyChangedEvent}, SingleOrgOnly: true, IsEnabled: true,
	}
	if ok, err := AddWebhook(hook); err != nil || !ok {
		t.Fatalf("AddWebhook: ok=%v err=%v", ok, err)
	}
	t.Cleanup(func() {
		_, _ = ormer.Engine.Where("webhook_name = ?", hook.GetId()).Delete(&WebhookEvent{})
		_, _ = ormer.Engine.Where("owner = ? AND name = ?", hook.Owner, hook.Name).Delete(&Webhook{})
	})

	if _, err := SyncAppPolicies(owner, app); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		events := []*WebhookEvent{}
		if err := ormer.Engine.Where("webhook_name = ?", hook.GetId()).Find(&events); err != nil {
			t.Fatal(err)
		}
		if len(events) > 0 {
			if events[0].EventType != BizPolicyChangedEvent || !strings.Contains(events[0].Payload, owner+"/"+app) {
				t.Fatalf("unexpected webhook event: %+v", events[0])
			}
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("no webhook event queued after sync")
}
