// Copyright 2026 The casbin Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package object

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func TestParseSiteRefreshInterval(t *testing.T) {
	cases := map[string]time.Duration{
		"": 5 * time.Second, "abc": 5 * time.Second, "0": 5 * time.Second, "-3": 5 * time.Second,
		"30": 30 * time.Second, " 10 ": 10 * time.Second,
	}
	for in, want := range cases {
		if got := parseSiteRefreshInterval(in); got != want {
			t.Errorf("parseSiteRefreshInterval(%q)=%v want %v", in, got, want)
		}
	}
}

func TestRefreshIfChanged(t *testing.T) {
	var tr refreshTracker
	fp := "1|a"
	calls := 0
	fingerprint := func() (string, error) { return fp, nil }
	refresh := func() error { calls++; return nil }

	run := func() {
		if err := refreshIfChanged(&tr, fingerprint, refresh); err != nil {
			t.Fatal(err)
		}
	}
	run()
	run()
	run()
	if calls != 1 {
		t.Fatalf("expected 1 refresh for unchanged fingerprint, got %d", calls)
	}
	fp = "2|b"
	run()
	if calls != 2 {
		t.Fatalf("expected refresh after change, got %d", calls)
	}
	tr.mu.Lock()
	tr.lastFull = time.Now().Add(-2 * forcedFullRefreshInterval)
	tr.mu.Unlock()
	run()
	if calls != 3 {
		t.Fatalf("expected forced refresh, got %d", calls)
	}
}

func TestRefreshIfChangedFailureDoesNotRecord(t *testing.T) {
	var tr refreshTracker
	fail := true
	calls := 0
	refresh := func() error {
		calls++
		if fail {
			return errors.New("boom")
		}
		return nil
	}
	fingerprint := func() (string, error) { return "x", nil }
	if err := refreshIfChanged(&tr, fingerprint, refresh); err == nil {
		t.Fatal("expected error")
	}
	fail = false
	if err := refreshIfChanged(&tr, fingerprint, refresh); err != nil || calls != 2 {
		t.Fatalf("expected retry after failure, calls=%d err=%v", calls, err)
	}
}

func TestLockSiteCertIsPerSite(t *testing.T) {
	unlockA := lockSiteCert("o/a")
	done := make(chan struct{})
	go func() {
		unlockB := lockSiteCert("o/b") // must not block on o/a
		unlockB()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("lock for another site blocked")
	}
	unlockA()
}

func TestSiteListSnapshotIsCopyAndRaceSafe(t *testing.T) {
	siteMapMu.Lock()
	siteList = []*Site{{Owner: "o", Name: "s", Challenges: []string{"x"}}}
	siteMapMu.Unlock()

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for _, s := range getSiteListSnapshot() {
				s.Challenges = []string{"mutated"}
			}
		}()
	}
	wg.Wait()
	if siteList[0].Challenges[0] != "x" {
		t.Fatal("snapshot mutation leaked into shared site")
	}
}
