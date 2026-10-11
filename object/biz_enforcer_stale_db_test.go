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
	"fmt"
	"sync"
	"testing"
)

// SavePolicy must be atomic: concurrent loaders see either the old or the new
// complete set, never an empty/partial table (M1).
func TestBizSavePolicyIsAtomicForConcurrentLoaders(t *testing.T) {
	owner, app := newBizChangelogTestApp(t)
	cfg, err := getBizAppConfig(owner, app)
	if err != nil || cfg == nil {
		t.Fatalf("config: %v", err)
	}
	const n = 40
	rules := make([][]string, 0, n)
	for i := 0; i < n; i++ {
		rules = append(rules, []string{fmt.Sprintf("u%d", i), "/r", "GET"})
	}

	e, err := buildBizEnforcer(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.AddPolicies(rules); err != nil {
		t.Fatal(err)
	}
	if err := e.SavePolicy(); err != nil {
		t.Fatal(err)
	}

	stop := make(chan struct{})
	var wg sync.WaitGroup
	bad := make(chan string, 1)
	for r := 0; r < 4; r++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				le, err := buildBizEnforcer(cfg)
				if err != nil {
					continue // transient sqlite busy is not what we assert on
				}
				ps, _ := le.GetPolicy()
				if len(ps) != n {
					select {
					case bad <- fmt.Sprintf("loader saw %d rules, want %d", len(ps), n):
					default:
					}
					return
				}
			}
		}()
	}
	for i := 0; i < 15; i++ {
		if err := e.SavePolicy(); err != nil {
			t.Fatalf("SavePolicy: %v", err)
		}
	}
	close(stop)
	wg.Wait()
	select {
	case msg := <-bad:
		t.Fatal(msg)
	default:
	}
}
