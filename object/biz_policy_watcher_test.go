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
	"time"

	"github.com/casbin/casbin/v3"
)

func TestHandleBizPolicyMessage(t *testing.T) {
	const self = "inst-self"
	e := &casbin.Enforcer{}

	bizEnforcerCache.Store("org/app", e)
	// own message: ignored
	handleBizPolicyMessage([]byte(`{"instance":"inst-self","owner":"org","appName":"app"}`), self)
	if _, ok := bizEnforcerCache.Load("org/app"); !ok {
		t.Fatal("own message must not invalidate local cache")
	}
	// garbage: ignored
	handleBizPolicyMessage([]byte(`not json`), self)
	if _, ok := bizEnforcerCache.Load("org/app"); !ok {
		t.Fatal("bad payload must not invalidate")
	}

	ch := bizPolicyWaitChan("org", "app")
	// foreign message: local entry dropped, waiters woken
	handleBizPolicyMessage([]byte(`{"instance":"other","owner":"org","appName":"app","version":3}`), self)
	if _, ok := bizEnforcerCache.Load("org/app"); ok {
		t.Fatal("foreign message must invalidate local cache")
	}
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("waiter not notified")
	}
}

func TestPublishWithoutWatcherIsNoop(t *testing.T) {
	publishBizPolicyUpdate("org", "app", 1) // must not panic with nil client
}
