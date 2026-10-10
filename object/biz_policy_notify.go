// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"sync"

	"github.com/deluxebear/jetauth/util"
)

// In-process wake-up for long-poll waiters (biz-watch-policies). A waiter
// grabs the current channel for its app; notify closes it and installs a
// fresh one. Cross-instance changes reach us through the Redis watcher
// (which calls notify) and the waiter's periodic DB poll as a fallback.
var (
	bizNotifyMu sync.Mutex
	bizNotifyCh = map[string]chan struct{}{}
)

func bizPolicyWaitChan(owner, appName string) <-chan struct{} {
	key := util.GetId(owner, appName)
	bizNotifyMu.Lock()
	defer bizNotifyMu.Unlock()
	ch, ok := bizNotifyCh[key]
	if !ok {
		ch = make(chan struct{})
		bizNotifyCh[key] = ch
	}
	return ch
}

func notifyBizPolicyWatchers(owner, appName string) {
	key := util.GetId(owner, appName)
	bizNotifyMu.Lock()
	defer bizNotifyMu.Unlock()
	if ch, ok := bizNotifyCh[key]; ok {
		close(ch)
		delete(bizNotifyCh, key)
	}
}
