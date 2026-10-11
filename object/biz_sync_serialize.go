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
	"sync"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/util"
)

// bizSyncCoalescer serializes policy rebuilds per app (owner/appName) within
// this process and coalesces bursts.
//
// Without it, concurrent rebuilds (fire-and-forget goroutines after each CRUD
// change) race: the last writer may save a set built before a concurrent
// change landed while the changelog records both changes as precise adds, so
// SDK deltas diverge from the server. With it, at most one rebuild runs per
// app; calls arriving meanwhile share ONE follow-up rebuild that starts after
// the running one finishes (so it sees every change made before it started).
//
// A follow-up that serves more than one caller drops the hint (recorded as a
// full_rebuild) because no single hint describes the merged changes. The
// hint-vs-rebuilt-set check in recordBizPolicyChange runs inside the
// serialized section.
//
// Limitation: serialization is in-process only. Multiple JetAuth instances
// writing the same app concurrently are not serialized by this; the rebuild is
// derived from the relational tables, so the last rebuild to finish is always
// complete w.r.t. changes committed before it started, and the next change
// triggers another rebuild. A portable cross-instance DB lock is not
// available (SELECT ... FOR UPDATE is a no-op on SQLite).
var bizSyncCoalescer = &bizSyncCoalescerT{apps: map[string]*bizSyncApp{}}

type bizSyncBatch struct {
	hint    *bizChangeHint
	callers int
	done    chan struct{}
	stats   *SyncStats
	err     error
}

type bizSyncApp struct {
	running bool
	next    *bizSyncBatch
}

type bizSyncCoalescerT struct {
	mu   sync.Mutex
	apps map[string]*bizSyncApp
}

func (c *bizSyncCoalescerT) do(key string, hint *bizChangeHint, run func(*bizChangeHint) (*SyncStats, error)) (*SyncStats, error) {
	c.mu.Lock()
	st := c.apps[key]
	if st == nil {
		st = &bizSyncApp{}
		c.apps[key] = st
	}
	if !st.running {
		st.running = true
		c.mu.Unlock()
		b := &bizSyncBatch{hint: hint, callers: 1, done: make(chan struct{})}
		c.execute(key, st, b, run)
		return b.stats, b.err
	}
	if st.next == nil {
		st.next = &bizSyncBatch{hint: hint, callers: 1, done: make(chan struct{})}
	} else {
		st.next.callers++
		st.next.hint = nil
	}
	b := st.next
	c.mu.Unlock()
	<-b.done
	return b.stats, b.err
}

// execute runs b, publishes its result, then hands any queued follow-up batch
// to a background goroutine so the caller is not held for other callers' work.
func (c *bizSyncCoalescerT) execute(key string, st *bizSyncApp, b *bizSyncBatch, run func(*bizChangeHint) (*SyncStats, error)) {
	func() {
		defer close(b.done)
		defer func() {
			if r := recover(); r != nil {
				b.err = fmt.Errorf("biz policy sync panic: %v", r)
				logs.Error("biz policy sync panic for %s: %v", key, r)
			}
		}()
		b.stats, b.err = run(b.hint)
	}()

	c.mu.Lock()
	next := st.next
	st.next = nil
	if next == nil {
		st.running = false
		delete(c.apps, key)
		c.mu.Unlock()
		return
	}
	c.mu.Unlock()
	util.SafeGoroutine(func() { c.execute(key, st, next, run) })
}
