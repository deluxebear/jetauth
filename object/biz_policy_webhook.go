// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/util"
)

// BizPolicyChangedEvent is the webhook event type (Record.Action) fired after
// a Casbin biz app's policies were rebuilt. Subscribe to it in a Webhook's
// `events` list to learn when to refresh a local policy cache.
const BizPolicyChangedEvent = "biz-policy-changed"

// BizPolicyChangedPayload is the JSON carried in the webhook Record.Object.
type BizPolicyChangedPayload struct {
	AppId            string `json:"appId"`
	Owner            string `json:"owner"`
	AppName          string `json:"appName"`
	Version          int64  `json:"version"`
	ChangeType       string `json:"changeType"` // add (incremental delta) | full_rebuild
	PolicyCount      int    `json:"policyCount"`
	GroupingPolicies int    `json:"groupingPolicyCount"`
}

// newBizPolicyChangedRecord builds the webhook Record for a policy change.
// The record is delivered through the regular webhook subsystem (events,
// retries, replay) but is NOT persisted in the audit-record table.
func newBizPolicyChangedRecord(owner, appName string, version int64, changeType string, policyCount, groupingCount int) *Record {
	payload := &BizPolicyChangedPayload{
		AppId:            util.GetId(owner, appName),
		Owner:            owner,
		AppName:          appName,
		Version:          version,
		ChangeType:       changeType,
		PolicyCount:      policyCount,
		GroupingPolicies: groupingCount,
	}
	return &Record{
		Owner:        owner,
		Name:         util.GenerateId(),
		CreatedTime:  util.GetCurrentTime(),
		Organization: owner,
		Method:       "POST",
		RequestUri:   "/api/" + BizPolicyChangedEvent,
		Action:       BizPolicyChangedEvent,
		Object:       util.StructToJson(payload),
		StatusCode:   200,
	}
}

// fireBizPolicyChangedWebhook queues the event asynchronously; delivery
// failures never affect the policy sync that triggered it.
func fireBizPolicyChangedWebhook(owner, appName string, version int64, changeType string, policyCount, groupingCount int) {
	record := newBizPolicyChangedRecord(owner, appName, version, changeType, policyCount, groupingCount)
	util.SafeGoroutine(func() {
		if err := SendWebhooks(record); err != nil {
			logs.Warning("biz policy webhook for %s/%s failed: %v", owner, appName, err)
		}
	})
}
