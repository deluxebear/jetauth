// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// biz_rebac_bench_test.go measures ReBAC engine hot paths against a
// seeded 10 k-tuple store. SLA targets (spec §SC-5 / §6.3.1):
//
//   Check      p99 < 50ms
//   ListObjects p99 < 300ms
//
// Run with:
//   make rebac-bench
// or:
//   go test -bench 'BenchmarkReBAC' -benchmem -benchtime=10s \
//       -run '^$' -tags skipCi ./object
//
// The file is tagged `skipCi` because it needs a real DB adapter and
// takes 10-30s — far too slow for every PR. It is run on demand by the
// author and the release pipeline when publishing the SLA baseline in
// docs/rebac-sla-baseline.md.

//go:build skipCi

package object

import (
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/deluxebear/jetauth/util"
)

const (
	benchTupleCount     = 10000
	benchObjectTypes    = 3
	benchRelationsPerTy = 5
	benchUsers          = 1000
)

// benchSchema is the DSL seeded for the benchmark — a three-type fan-out
// (group → folder → document) exercising direct grants, computed_userset
// (via `self as X`), and tuple_to_userset (via `parent from`). Small
// enough to be readable, wide enough to hit the engine's interesting
// rewrite branches on every Check.
const benchSchema = `model
  schema 1.1

type user

type group
  relations
    define member: [user]

type folder
  relations
    define owner: [user]
    define viewer: [user, group#member]
    define parent: [folder]

type document
  relations
    define owner: [user]
    define viewer: [user, group#member] or owner or viewer from parent
    define editor: [user] or owner
    define parent: [folder]`

// benchFixture carries everything a benchmark needs to call the engine
// without re-seeding inside the measurement loop.
type benchFixture struct {
	owner   string
	appName string
	storeId string
	objects []string
	users   []string
}

// seedBenchFixture creates a brand-new app + schema + 10 k tuples and
// returns the handles the benches drive. Called once per `go test`
// invocation — not inside the ResetTimer loop. Self-contained: does its
// own InitConfig + BizAppConfig seed because the shared test helpers
// live under `//go:build !skipCi` and are invisible from this file.
func seedBenchFixture(tb testing.TB) *benchFixture {
	tb.Helper()

	// Mirror ensureDBForConsolidated: SQLite rejects MySQL's
	// `CREATE DATABASE IF NOT EXISTS`, flip the global off before
	// InitConfig so local SQLite runs don't blow up.
	if ormer == nil {
		createDatabase = false
		func() {
			defer func() {
				if r := recover(); r != nil {
					tb.Skipf("InitConfig panicked: %v", r)
				}
			}()
			InitConfig()
		}()
	}
	if ormer == nil {
		tb.Skip("ormer not initialised (conf/app.conf missing?)")
	}

	owner := "rebac-bench-" + util.GenerateUUID()[:8]
	appName := "bench"
	config := &BizAppConfig{
		Owner:       owner,
		AppName:     appName,
		DisplayName: "rebac bench",
		Description: "seeded by BenchmarkReBAC_*",
		ModelType:   "rebac",
		PolicyTable: "biz_" + appName + "_policy",
		IsEnabled:   true,
		CreatedTime: util.GetCurrentTime(),
		UpdatedTime: util.GetCurrentTime(),
	}
	if _, err := AddBizAppConfig(config); err != nil {
		tb.Fatalf("seed BizAppConfig: %v", err)
	}
	tb.Cleanup(func() {
		_, _ = DeleteBizTuplesForApp(owner, appName)
		_, _ = DeleteBizAuthorizationModelsForApp(owner, appName)
		_, _ = DeleteBizAppConfig(config)
	})

	if _, err := SaveAuthorizationModel(owner, appName, benchSchema, "bench"); err != nil {
		tb.Fatalf("save schema: %v", err)
	}

	storeId := BuildStoreId(owner, appName)
	users := make([]string, benchUsers)
	for i := range users {
		users[i] = fmt.Sprintf("user:u%04d", i)
	}

	// Generate tuples that lean on every interesting rewrite branch:
	//   - user:uN   member     group:gX
	//   - user:uN   owner      document:dY
	//   - group:gX#member viewer document:dY
	//   - folder:fZ parent     document:dY
	r := rand.New(rand.NewPCG(1, 2))
	tuples := make([]*BizTuple, 0, benchTupleCount)
	objects := make([]string, 0, benchTupleCount/3)
	for i := 0; i < benchTupleCount; i++ {
		uid := users[r.IntN(benchUsers)]
		switch i % 4 {
		case 0:
			tuples = append(tuples, &BizTuple{
				Owner: owner, AppName: appName,
				Object: fmt.Sprintf("group:g%03d", r.IntN(100)),
				Relation: "member", User: uid,
			})
		case 1:
			doc := fmt.Sprintf("document:d%05d", i)
			objects = append(objects, doc)
			tuples = append(tuples, &BizTuple{
				Owner: owner, AppName: appName,
				Object: doc, Relation: "owner", User: uid,
			})
		case 2:
			doc := fmt.Sprintf("document:d%05d", r.IntN(benchTupleCount/3))
			tuples = append(tuples, &BizTuple{
				Owner: owner, AppName: appName,
				Object: doc, Relation: "viewer",
				User: fmt.Sprintf("group:g%03d#member", r.IntN(100)),
			})
		case 3:
			doc := fmt.Sprintf("document:d%05d", r.IntN(benchTupleCount/3))
			tuples = append(tuples, &BizTuple{
				Owner: owner, AppName: appName,
				Object: doc, Relation: "parent",
				User: fmt.Sprintf("folder:f%03d", r.IntN(50)),
			})
		}
	}

	// Batch the insert so we don't spend the benchmark warm-up in
	// one-round-trip-per-row TCP chatter.
	const batch = 500
	for start := 0; start < len(tuples); start += batch {
		end := min(start+batch, len(tuples))
		if _, err := AddBizTuples(tuples[start:end]); err != nil {
			tb.Fatalf("seed tuples [%d:%d]: %v", start, end, err)
		}
	}

	return &benchFixture{
		owner:   owner,
		appName: appName,
		storeId: storeId,
		objects: objects,
		users:   users,
	}
}

// BenchmarkReBAC_Check drives ReBACCheck with random (object, user)
// pairs under the seeded schema. Reports ns/op and allocs; p99 is
// captured externally via the SLA baseline run (see docs/rebac-sla-baseline.md).
func BenchmarkReBAC_Check(b *testing.B) {
	fx := seedBenchFixture(b)
	r := rand.New(rand.NewPCG(42, 42))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := ReBACCheck(&CheckRequest{
			StoreId: fx.storeId,
			TupleKey: TupleKey{
				Object:   fx.objects[r.IntN(len(fx.objects))],
				Relation: "viewer",
				User:     fx.users[r.IntN(len(fx.users))],
			},
		})
		if err != nil {
			b.Fatalf("check: %v", err)
		}
	}
}

// BenchmarkReBAC_ListObjects drives ReBACListObjects for random users.
// pageSize=100 matches spec §6.3.1.
func BenchmarkReBAC_ListObjects(b *testing.B) {
	fx := seedBenchFixture(b)
	r := rand.New(rand.NewPCG(7, 7))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := ReBACListObjects(&ListObjectsRequest{
			StoreId:    fx.storeId,
			ObjectType: "document",
			Relation:   "viewer",
			User:       fx.users[r.IntN(len(fx.users))],
			PageSize:   100,
		})
		if err != nil {
			b.Fatalf("list_objects: %v", err)
		}
	}
}
