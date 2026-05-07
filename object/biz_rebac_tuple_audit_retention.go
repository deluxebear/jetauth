// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/util"
)

// AuditRetentionDays caps how long tuple-audit rows live. 90 days
// matches the audit-tab subtitle copy and gives admins a quarterly
// window for compliance reviews. Tune via this constant only — there
// is no runtime knob.
const AuditRetentionDays = 90

// startTupleAuditRetentionLoop runs once an hour: anything older than
// AuditRetentionDays gets dropped. Cheap because at_time is indexed,
// so the worst case is one DELETE WHERE at_time < cutoff per hour.
// Errors are logged and the loop continues — a transient DB blip
// shouldn't kill audit retention forever.
//
// The loop sleeps before the first purge so package init() fires while
// ormer is still nil — without the sleep, the first iteration races
// the rest of bootup and dereferences a nil engine.
func startTupleAuditRetentionLoop() {
	util.SafeGoroutine(func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			<-ticker.C
			cutoff := time.Now().AddDate(0, 0, -AuditRetentionDays).Format(time.RFC3339)
			if affected, err := PurgeTupleAuditOlderThan(cutoff); err != nil {
				logs.Error("rebac audit retention purge failed: %v", err)
			} else if affected > 0 {
				logs.Info("rebac audit retention purge: %d rows dropped", affected)
			}
		}
	})
}

// init registers the retention loop. Called automatically on package
// load — the goroutine sleeps until the first tick, so package-load
// stays cheap.
func init() {
	startTupleAuditRetentionLoop()
}
