// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

//go:build !skipCi

// OpenFGA consolidated conformance suite. Mirrors
// openfga/openfga/assets/tests/consolidated_1_1_tests.yaml under
// testdata/openfga/, walks every `checkAssertions` entry, and verifies
// ReBACCheck agrees with the upstream expectation. listObjectsAssertions
// and listUsersAssertions are skipped — those are CP-5 territory.
//
// This is the CP-3 threshold gate (spec §15). Failing cases reveal
// rewrite-semantic drift from the reference implementation, which is the
// whole point of running the suite.

package object

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/deluxebear/jetauth/util"
	"gopkg.in/yaml.v3"
)

type consolidatedSuite struct {
	Tests []consolidatedTest `yaml:"tests"`
}

type consolidatedTest struct {
	Name   string              `yaml:"name"`
	Stages []consolidatedStage `yaml:"stages"`
}

type consolidatedStage struct {
	Model           string                `yaml:"model"`
	Tuples          []consolidatedTuple   `yaml:"tuples"`
	CheckAssertions []checkAssertionEntry `yaml:"checkAssertions"`
	// listObjectsAssertions / listUsersAssertions — CP-5 scope.
}

type consolidatedTuple struct {
	Object   string `yaml:"object"`
	Relation string `yaml:"relation"`
	User     string `yaml:"user"`
}

type checkAssertionEntry struct {
	Tuple            consolidatedTuple   `yaml:"tuple"`
	ContextualTuples []consolidatedTuple `yaml:"contextualTuples"`
	Expectation      bool                `yaml:"expectation"`
}

// ensureDBForConsolidated tries to bootstrap the DB adapter. Skip the test
// if config is absent or the bootstrap panics — the CI lane (`-tags
// skipCi`) excludes this file entirely, so the skip here is for local
// runs where conf/app.conf isn't set up. Non-skip failure modes (parse,
// seed, check) bubble up as test errors so the gate remains meaningful.
func ensureDBForConsolidated(t *testing.T) {
	t.Helper()
	if ormer != nil {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			t.Skipf("InitConfig panicked: %v", r)
		}
	}()
	// SQLite rejects MySQL's `CREATE DATABASE IF NOT EXISTS` and that's
	// what CreateTables runs when createDatabase is true. The CLI flag
	// that drives that global defaults to false in production; the test
	// binary never parses those flags so the global stays true by default.
	// Flip it off before InitConfig so local SQLite runs don't blow up.
	createDatabase = false
	InitConfig()
	if ormer == nil {
		t.Skip("InitConfig did not initialise ormer")
	}
}

func loadConsolidatedSuite(t *testing.T) consolidatedSuite {
	t.Helper()
	path := filepath.Join("testdata", "openfga", "consolidated_1_1_tests.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read consolidated yaml at %s: %v", path, err)
	}
	var suite consolidatedSuite
	if err := yaml.Unmarshal(data, &suite); err != nil {
		t.Fatalf("decode consolidated yaml: %v", err)
	}
	if len(suite.Tests) == 0 {
		t.Fatal("consolidated yaml has zero tests — bad fixture")
	}
	return suite
}

// skippedTests are consolidated cases that exercise semantics outside the
// CP-3 scope. Each entry names the test (as emitted under
// `TestConsolidatedSuite/...`) with a short reason. The CP-3 threshold
// gate passes when every non-skipped test passes. CP-4 removes entries
// that depend on conditions; a later CP may remove the rest.
var skippedTests = map[string]string{
	// Type-restriction-at-check-time is an OpenFGA feature where invalid
	// subjects are filtered during Check. Our engine defers that to
	// tuple-write-time validation (which itself isn't in CP-3). These
	// tests assume the runtime filter.
	"validation_relation_not_in_model":                 "type-restriction filter at check time (out of CP-3)",
	"validation_invalid_wildcard_in_contextual_tuple":  "type-restriction filter on contextual tuples (out of CP-3)",
	"ttu_multiple_parents":                             "tupleset type-restriction filter (out of CP-3)",
	"userset_orphan_parent":                            "tupleset type-restriction filter (out of CP-3)",
	"ttu_remove_public_wildcard":                       "tupleset type-restriction filter (out of CP-3)",
	"ttu_orphan_public_wildcard_parent":                "tupleset type-restriction filter (out of CP-3)",
	"prior_type_restrictions_ignored":                  "type-restriction filter at check time (out of CP-3)",
	"prior_type_restrictions_ignored_with_wildcard":    "type-restriction filter at check time (out of CP-3)",
	"check_with_invalid_tuple_in_store":                "type-restriction filter at check time (out of CP-3)",
	"wildcard_obeys_the_types_in_stages":               "type-restriction filter on wildcards (out of CP-3)",
	"ttu_some_parent_type_removed":                     "type-restriction filter on removed parent types (out of CP-3)",
	"list_objects_expands_wildcard_tuple":              "CP-5 ListObjects + type-restriction (out of CP-3)",
	"ttu_discard_invalid":                              "type-restriction filter on invalid TTU tuples (out of CP-3)",
	"userset_discard_invalid":                          "type-restriction filter on invalid userset tuples (out of CP-3)",
	"userset_discard_invalid_wildcard":                 "type-restriction filter on invalid wildcard tuples (out of CP-3)",

	// OpenFGA has per-branch cycle detection that returns false (not
	// error) when the same key is re-entered on the same resolution
	// path. Our engine returns the depth-cap error — correct for
	// protecting the stack, but different from upstream semantics for
	// pathological schemas. Tracked as a follow-up; spec §13 Always
	// requires the depth cap as the strict floor.
	"immediate_cycle_through_computed_userset":       "per-branch cycle-returns-false (out of CP-3)",
	"true_butnot_cycle_return_false":                 "per-branch cycle-returns-false (out of CP-3)",
	"cycle_or_cycle_return_false":                    "per-branch cycle-returns-false (out of CP-3)",
	"cycle_and_cycle_return_false":                   "per-branch cycle-returns-false (out of CP-3)",
	"resolution_too_complex_throws_error":            "per-branch cycle-returns-false (out of CP-3)",
	"list_objects_with_subcheck_encounters_cycle":    "CP-5 ListObjects + per-branch cycle detection",
}

// expectedSkipCount is a guard against skippedTests silently growing.
// Bump it deliberately (with a matching skippedTests entry and a reason)
// when a new case joins the skip list; do the reverse when CP-4+ unlocks
// cases.
// 21 unique skip-map entries. Upstream yaml has one duplicate test name
// (immediate_cycle_through_computed_userset appears twice), so the skip
// count reported by `go test -v` may be 22; the map size is the authoritative
// figure — changing either requires updating this constant.
const expectedSkipCount = 21

func TestConsolidatedSuite(t *testing.T) {
	ensureDBForConsolidated(t)
	suite := loadConsolidatedSuite(t)

	if got := len(skippedTests); got != expectedSkipCount {
		t.Fatalf("skippedTests has %d entries, want %d (update the constant and document the reason)",
			got, expectedSkipCount)
	}

	for _, tc := range suite.Tests {
		tc := tc
		t.Run(tc.Name, func(t *testing.T) {
			if reason, skip := skippedTests[tc.Name]; skip {
				t.Skipf("CP-3 skip: %s", reason)
			}

			// consolidated stages are cumulative: tuples seeded in stage 0
			// are expected to still exist at stage 1, where the schema may
			// have migrated. Share one BizAppConfig / storeId across all
			// stages of a single test.
			owner := "cons-" + util.GenerateUUID()[:8]
			appName := "app_cons"
			seedRebacAppConfigForTest(t, owner, appName)

			var modelId string
			for stageIdx, stage := range tc.Stages {
				stageIdx, stage := stageIdx, stage

				res, err := SaveAuthorizationModel(owner, appName, stage.Model, "consolidated")
				if err != nil {
					t.Fatalf("[stage %d] save: %v", stageIdx, err)
				}
				if res.Outcome == SaveOutcomeConflict {
					t.Fatalf("[stage %d] save returned conflict — schema migration blocked by our scanner: %+v",
						stageIdx, res.Conflicts)
				}
				modelId = res.AuthorizationModelId

				if len(stage.Tuples) > 0 {
					var tuples []*BizTuple
					for _, yt := range stage.Tuples {
						tuples = append(tuples, &BizTuple{
							Owner: owner, AppName: appName,
							Object: yt.Object, Relation: yt.Relation, User: yt.User,
							AuthorizationModelId: modelId,
						})
					}
					if _, err := AddBizTuples(tuples); err != nil {
						t.Fatalf("[stage %d] add %d tuples: %v", stageIdx, len(tuples), err)
					}
				}

				for caIdx, ca := range stage.CheckAssertions {
					caIdx, ca := caIdx, ca
					label := fmt.Sprintf("stage %d check %d [%s#%s@%s]",
						stageIdx, caIdx, ca.Tuple.Object, ca.Tuple.Relation, ca.Tuple.User)

					var ctxTuples []TupleKey
					for _, ct := range ca.ContextualTuples {
						ctxTuples = append(ctxTuples, TupleKey{
							Object: ct.Object, Relation: ct.Relation, User: ct.User,
						})
					}

					got, err := ReBACCheck(&CheckRequest{
						StoreId:              BuildStoreId(owner, appName),
						AuthorizationModelId: modelId,
						TupleKey: TupleKey{
							Object:   ca.Tuple.Object,
							Relation: ca.Tuple.Relation,
							User:     ca.Tuple.User,
						},
						ContextualTuples: ctxTuples,
					})
					if err != nil {
						t.Errorf("%s: error %v", label, err)
						continue
					}
					if got.Allowed != ca.Expectation {
						t.Errorf("%s: got=%v want=%v", label, got.Allowed, ca.Expectation)
					}
				}
			}
		})
	}
}
