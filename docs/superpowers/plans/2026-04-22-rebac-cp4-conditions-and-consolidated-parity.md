# Implementation Plan: CEL Conditions + Consolidated Parity (CP-4)

**Status:** ⏳ Pending approval
**Spec:** [`docs/rebac-spec.md`](../../rebac-spec.md) §5.2 conditional type restrictions, §6.1 item 5, §11.1 CEL tests
**Plan ancestor:** [`docs/rebac-plan.md`](../../rebac-plan.md) §3 PR2 CP-4
**Branch:** `feature/rebac-cp3` (continues the same branch — CP-3 and CP-4 ship as a single PR2)
**Predecessor:** CP-3 (this branch, 14 commits, 112/134 consolidated pass)

---

## Overview

CP-4 closes CP-3's remaining 22 skipped consolidated cases, adds OpenFGA-compatible CEL conditions (even though the consolidated yaml doesn't exercise them — spec §11.1 and product fidelity still require the feature), and ships `/api/biz-check` + `/api/biz-batch-check`. The target is the spec §15 "CP-4 全量 consolidated test 通过" hard gate, minus a single CP-5 list-only exemption.

Scope is three semantic additions + one HTTP surface + docs. ~8 tasks, most S/M. `feature/rebac-cp3` is the working branch; PR2 (CP-3 + CP-4) opens against `main` at the end.

## Architecture Decisions

- **CEL environment per schema**. `cel.NewEnv(cel.Variable(...))` is built once per `AuthorizationModel` and stashed on `checkContext`. Individual expression compilations cache at the **program level** keyed by expression text + env hash, so two conditions referencing the same types share a compiled program.
- **`condition_context` JSON uses `json.Number`** when deserialised. Spec OQ-4 is "strictly aligned with openfga-spec — list/map/number fidelity". Standard `json.Unmarshal` collapses integers to `float64`, which loses precision and confuses CEL's integer comparisons. `json.NewDecoder(r).UseNumber()` preserves the original token.
- **Per-branch cycle detection via visited-path slice**. `ctx.check` grows a `visited []string` parameter. Before the memo lookup we scan `visited` for the current `memoKey`; a hit returns `(false, nil)` — **not** memoised (a cycle-induced false on one path doesn't foreclose a different path reaching the same key legitimately). Concurrent union goroutines fork with a fresh `append(nil, visited...)` so no slice is shared across goroutines.
- **Type-restriction filter at check time**. `TypeDefinition.Metadata.Relations[relation].DirectlyRelatedUserTypes` is read once during `resolveAuthorizationModel` and stashed alongside the rewrite AST. `checkThis` consults it when iterating tuple subjects: subjects whose type/relation shape isn't in the allow-list are treated as if the tuple didn't exist. Wildcard handling mirrors the subject-type gate.
- **`/api/biz-check` body-first shape**. POST with JSON body `{ appId, authorizationModelId?, tupleKey, contextualTuples?, context? }`. `?appId=` query param is also accepted (matches the authz_filter contract from PR1's I1 fix, avoids a second filter carve-out). `/api/biz-batch-check` accepts `{ appId, checks: [...] }` — caller batches at the app layer, server never mixes stores within one call.
- **No cross-tenant `biz-batch-check`**. Every item in a batch inherits the outer `appId`; per-item `appId` overrides are rejected at the handler with a 400. Simpler auth, simpler audit.

## Dependency graph

```
Task 1 (CEL cache + env) ──── Task 2 (condition-context JSON)
                                      │
                                      ▼
                              Task 3 (check-with-CEL)
                                      │
   Task 4 (type-restriction) ─────────┤
                                      │
   Task 5 (per-branch cycle) ─────────┤
                                      ▼
                              Task 6 (un-skip consolidated → 133/134)
                                      │
                                      ▼
                              Task 7 (/biz-check + /biz-batch-check routes)
                                      │
                                      ▼
                              Task 8 (CP-4 docs wrap-up)
```

**Can run in parallel**: Task 4 (type-restriction) and Task 5 (cycle) are both independent of the CEL stack; they can interleave. Task 1/2 gate Task 3.

## Task list

### Phase 1 — CEL conditions

#### Task 1: CEL environment + program cache (`biz_rebac_condition.go`)
**Description:** New file `object/biz_rebac_condition.go`. Exports `newCELEnv(schemaConditions map[string]*openfgav1.Condition) (*cel.Env, error)` that builds a CEL environment with each schema condition's typed parameters declared, and a per-request `(*checkContext).compileCondition(name, expr string) (cel.Program, error)` that caches compiled programs by expression text. Cache lives in `checkContext.celPrograms sync.Map`.

**Acceptance:**
- Two calls to `compileCondition` with the same expression return the same `cel.Program` instance (cache hit)
- Compilation error on malformed expression bubbles up with `%w`-wrapped message
- Schema conditions with parameter types `int`, `string`, `bool`, `list`, `map` all compile

**Verification:**
- `go test -run 'TestCELEnv_BuildsSchemaTypes|TestCELProgramCache_ReusesCompiled|TestCELCompile_MalformedExpr' ./object/` green; pure-function tests, no DB

**Dependencies:** None (builds on CP-3's skeleton)
**Files:**
- `object/biz_rebac_condition.go` (new)
- `object/biz_rebac_condition_test.go` (new)
- `object/biz_rebac_engine.go` (add `celPrograms` field to `checkContext`)

**Scope:** M

#### Task 2: Condition-context JSON roundtrip (OQ-4 fidelity)
**Description:** Add `parseConditionContext(raw string) (map[string]any, error)` that deserialises a `condition_context` JSON string with `json.Number` fidelity — integers stay integers (CEL uses them for `==` comparisons), floats stay floats, lists and maps recurse. A dual `marshalConditionContext` round-trips to JSON via `encoding/json` with numeric preservation.

**Acceptance:**
- Integer literal in JSON `{"age": 42}` → `map["age"]` is `json.Number("42")`, not `float64(42)`
- Float literal `{"rate": 3.14}` stays `json.Number("3.14")`
- Nested list/map preserves element types
- Malformed JSON returns error containing "condition context"
- Empty string → empty map, no error (canonical "no context")

**Verification:**
- `go test -run 'TestConditionContext_NumberFidelity|TestConditionContext_Nested|TestConditionContext_Empty|TestConditionContext_Malformed' ./object/` green

**Dependencies:** None
**Files:**
- `object/biz_rebac_condition.go` (extends Task 1's file)
- `object/biz_rebac_condition_test.go`

**Scope:** S

#### Task 3: `checkThis` honors conditional tuples
**Description:** Update `checkThis` to consult the tuple's `ConditionName` + `ConditionContext` when deciding whether to treat a row as "granting". If `ConditionName` is empty, behaviour is unchanged (CP-3 path). If non-empty, look up the condition in the schema, compile its expression via Task 1's cache, merge the tuple's context with the request's `Context` (spec §6.1 item 5: tuple context first, request context overrides), and `cel.Program.Eval(vars)`. `false` or eval error → tuple doesn't grant; `true` → grants.

**Acceptance:**
- Tuple with empty `ConditionName` matches exactly as before (no regression)
- Tuple with matching condition (expression returns true) grants
- Tuple with matching condition (expression returns false) does not grant
- Tuple referencing unknown condition name → error (schema-conditions mismatch surfaces, not silent false)
- Eval runtime error (e.g. divide by zero) → error bubbles up
- Request-level context override: tuple context `{"x": 1}`, request context `{"x": 2}` → evaluator sees `x==2`

**Verification:**
- `go test -run 'TestCheckThis_Conditional' ./object/` green — DB-backed, runs against seeded tuples with conditions

**Dependencies:** Task 1, Task 2
**Files:**
- `object/biz_rebac_engine.go` (modify `checkThis` + maybe `tuplesetUsers` return struct)
- `object/biz_rebac_engine_db_test.go` (extend)

**Scope:** M — touches the engine's most-called hot path; test count likely 5-7

### Checkpoint: Phase 1 (after Task 3)
- [ ] `go build ./...` clean
- [ ] Self-authored CEL tests pass (unit + integration)
- [ ] Consolidated pass count unchanged (no regression from conditions being a no-op when tuples have no condition)
- [ ] `go vet ./...` clean

---

### Phase 2 — Consolidated semantic parity

#### Task 4: Type-restriction filter at check time
**Description:** Read `TypeDefinition.Metadata.Relations[relation].DirectlyRelatedUserTypes` at model-load time. When `checkThis` iterates tuple subjects, filter out any whose `(type, [relation])` pair isn't listed; same for wildcard subjects. Affects 13 consolidated tests named `validation_*`, `prior_type_restrictions_*`, `check_with_invalid_tuple_in_store`, `wildcard_obeys_the_types_in_stages`, `ttu_discard_invalid`, `userset_discard_invalid`, `userset_discard_invalid_wildcard`, `ttu_multiple_parents`, `userset_orphan_parent`, `ttu_remove_public_wildcard`, `ttu_orphan_public_wildcard_parent`, `ttu_some_parent_type_removed`.

**Acceptance:**
- A tuple whose subject type isn't in `DirectlyRelatedUserTypes` is invisible to `checkThis`
- A wildcard tuple `user:*` where the relation allows `[user:*]` → grants plain-user callers
- A wildcard `user:*` where the relation only allows `[user]` (no wildcard form) → does NOT grant
- A userset subject `team:eng#member` where the relation allows `[team#member]` → traverses
- A userset subject where the relation only allows `[team]` (no `#member` form) → invisible
- The existing 112 passing consolidated cases continue to pass (no regression)

**Verification:**
- `go test -run TestConsolidatedSuite ./object/ -timeout 300s` shows 13 more passes than the CP-3 baseline (121–125 PASS territory)
- `go test -run 'TestCheckThis_TypeRestriction' ./object/` green — dedicated unit tests for the filter

**Dependencies:** None
**Files:**
- `object/biz_rebac_engine.go` (extend `checkContext` with the type restriction map; filter in `checkThis`)
- `object/biz_rebac_engine_db_test.go`
- `object/biz_rebac_consolidated_db_test.go` (shrink skip list)

**Scope:** M — filter logic is ~50 lines; test coverage is the weight

#### Task 5: Per-branch cycle detection
**Description:** Add a `visited []string` parameter to `ctx.check` and pass it through `evaluate` and the six rewrite helpers. Before the memo lookup, test if `memoKey(key)` is in `visited`; hit returns `(false, nil)` without writing memo. Append the current key before dispatching to sub-rewrites. Concurrent union/intersection goroutines receive a fresh copy of the slice so siblings don't share state. Affects 6 consolidated tests: `cycle_or_cycle_return_false`, `cycle_and_cycle_return_false`, `immediate_cycle_through_computed_userset` (×2), `true_butnot_cycle_return_false`, `resolution_too_complex_throws_error`, and enables `list_objects_with_subcheck_encounters_cycle`'s check assertions.

**Acceptance:**
- Two-step mutual cycle `a→b, b→a` returns `(false, nil)` rather than a max-depth error (for union/difference/intersection contexts)
- Genuinely-deep-but-non-cyclic schema still returns the max-depth error (Task 11 guard from CP-3 still fires)
- Sibling union branches don't leak each other's visited-path state (verified via a test with identical sub-keys in two children)

**Verification:**
- `go test -race -run 'TestCheck_Cycle' ./object/` green with no races
- Consolidated suite: 6 more passes than after Task 4 (131 PASS territory)

**Dependencies:** None (independent of Task 4; can run in parallel)
**Files:**
- `object/biz_rebac_engine.go` (signature change on `check`, `evaluate`, 6 helpers; all helpers must forward `visited`)
- `object/biz_rebac_engine_test.go` (new cycle tests, pure)
- `object/biz_rebac_consolidated_db_test.go` (shrink skip list)

**Scope:** M — signature cascade hits every helper

### Checkpoint: Phase 2 (after Task 5)
- [ ] `go build ./...` clean
- [ ] `go test -race ./object/...` green
- [ ] Consolidated: 131/134 PASS (gate for Task 6)

---

### Phase 3 — Consolidated 100%

#### Task 6: Un-skip consolidated + verify 133/134 pass
**Description:** Remove every `skippedTests` entry except the single CP-5 genuine ListObjects dependency (and the duplicate `immediate_cycle_through_computed_userset#01`, which un-skips with its sibling). Update `expectedSkipCount`. Audit any stray failures — if one slips through after Tasks 4 + 5, this task either fixes it locally or files a follow-up + documents exemption per spec §11.2 "如有上游测试因我们不实现的特性而失败,在本 spec 开新章节显式记录豁免项".

**Acceptance:**
- `skippedTests` shrinks to exactly 1 entry (or 0 if CP-5 case also resolves naturally)
- `TestConsolidatedSuite` reports 133/134 pass (or 134/134 with a documented exemption if any remain)
- No test that was passing in CP-3 regresses

**Verification:**
- `go test -run TestConsolidatedSuite ./object/ -timeout 300s` green with only expected skip(s)
- Diff of `skippedTests` from CP-3 shows the 21 unlocked entries

**Dependencies:** Task 3 (CEL not really needed for consolidated but is also landed by then), Task 4, Task 5
**Files:**
- `object/biz_rebac_consolidated_db_test.go`
- If any exemption is documented: `docs/rebac-spec.md` (new "Exemptions" subsection)

**Scope:** S — mostly deletion + verification

### Checkpoint: Phase 3 (after Task 6)
- [ ] Consolidated gate met: 100% pass or documented exemption
- [ ] spec §15 CP-4 threshold checkmark eligible

---

### Phase 4 — HTTP surface

#### Task 7: `/api/biz-check` + `/api/biz-batch-check` handlers + routes
**Description:** Two controller methods in `controllers/biz_rebac_api.go`:
- `BizCheck` — POST with body `{ appId, authorizationModelId?, tupleKey: {object, relation, user}, contextualTuples?, context? }`; wraps `ReBACCheck`; response `{allowed, resolution}`
- `BizBatchCheck` — POST with body `{ appId, authorizationModelId?, checks: [{tupleKey, contextualTuples?, context?}] }`; per-item `appId` is rejected with 400; response `{ results: [{allowed}] }` preserving order

Routes registered in `routers/router.go` alongside PR1's three authorization-model routes. Swagger v2 annotations on both, following the convention commit message `1031f036` locked in.

**Acceptance:**
- Valid request → 200 with `{status:"ok", data:{allowed:true/false, resolution:""}}`
- Missing `appId` → 400 via existing `c.ResponseError`
- Missing tupleKey → 400
- Cross-store modelId → "not found" (spec §7.2 — same behaviour as `biz-read-authorization-model`)
- Batch with 100 items: response preserves order
- Batch with per-item `appId` field: 400

**Verification:**
- `go test -run 'TestBizCheck_Handler|TestBizBatchCheck_Handler' ./controllers/` green — beego's tests run an in-process HTTP stack, so no external process needed
- `make run` smoke: curl with valid session hits `/api/biz-check` and gets a real allow/deny
- Swagger regen: `swagger/openapi.json` includes both endpoints

**Dependencies:** Task 3 (engine fully wired), Task 6 (semantics finalised)
**Files:**
- `controllers/biz_rebac_api.go` (extend)
- `controllers/biz_rebac_api_test.go` (new, controller-level tests)
- `routers/router.go` (2 new route lines)
- `swagger/openapi.json` (regenerated)

**Scope:** M

---

### Phase 5 — Wrap-up

#### Task 8: CP-4 docs wrap-up
**Description:** Mark CP-4 complete in `docs/rebac-plan.md` §7, tick the remaining ReBAC P2/P3 boxes in `TODO.md`, extend `CHANGES-FROM-CASDOOR.md` if the biz-authz API surface now warrants a changelog entry, and commit the `docs(rebac): CP-4 complete` cap.

**Acceptance:**
- `docs/rebac-plan.md` §7 table: CP-3 and CP-4 rows both ✅ with commit SHAs
- `TODO.md` P3 (API) bullets ticked for `biz-check` + `biz-batch-check`
- Optional spec §15 exemption section if Task 6 couldn't close every gap

**Verification:**
- Manual: reader walks the CP-4 demo recipe end-to-end (save conditional schema → write conditioned tuple → Check with context → observe allow/deny flip)
- `go test ./... -timeout 300s` full green

**Dependencies:** Task 7 (HTTP surface done) + any exemption decisions from Task 6
**Files:**
- `docs/rebac-plan.md`
- `TODO.md`
- `CHANGES-FROM-CASDOOR.md` (possibly)

**Scope:** XS

### Checkpoint: CP-4 complete (after Task 8)
- [ ] Consolidated 100% or 1-CP-5-exemption
- [ ] /api/biz-check and /api/biz-batch-check live and documented
- [ ] `make ut` + `go test -race ./...` green
- [ ] PR2 (CP-3 + CP-4) openable against `main`

---

## Risks and Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | `cel-go v0.23.0` public API changed since spec's assumed version | High — CEL compilation/eval syntax | Pin the import behind Task 1's helper; if the API diverged, one file changes. cel-go is stable for 18+ months at v0.23, so low likelihood |
| R2 | Type-restriction filter tanks perf on objects with 1000+ tuples (Task 4 iterates every tuple to apply filter) | Medium | CP-3's `tuplesetUsers` already loads all tuples for `(object, relation)`; filter is in-memory over the same slice. No extra DB round-trips. Defer perf pass to CP-6. |
| R3 | Per-branch `visited` slice append in concurrent goroutines shares underlying array → races | High if missed | Every goroutine spawn performs `append([]string(nil), visited...)` before forking. A `-race` test case covers two siblings with the same sub-key. |
| R4 | `/api/biz-check` auth — PR1 I1 fix taught the filter about `?appId=`, but POST bodies are trickier | Medium | Accept `?appId=` on both routes (query-string-friendly for filter); body carries a matching `appId` the handler asserts against; mismatch → 400 before dispatch |
| R5 | CEL expressions that touch `request.Time` or other non-deterministic values need consistent evaluation across Check + ListObjects | Low for CP-4 (ListObjects is CP-5) | Document as a CP-5 concern; CP-4's `checkContext.requestContext` is already the right container |
| R6 | Task 6 un-skip uncovers a 22nd failure not anticipated by categorisation | Medium | The named skip entries from CP-3 are the target; if an extra fails, apply spec §11.2 exemption (write-up) rather than chasing infinitely |
| R7 | `swag v2` regen produces noisy swagger.json diff — cloud CI reviewer overwhelmed | Low | Regen locally; commit only the two new endpoints' hunks if possible; otherwise a single "regen" commit isolated from feature commits |
| R8 | HTTP handler tests require `ormer` initialised — same bootstrap pattern as Task 12 consolidated | Low | Reuse `ensureDBForConsolidated` pattern; if beego test server doesn't cooperate, fall back to object-layer-only tests and do manual `make run` smoke |

## Parallelization Opportunities

- **Task 4 and Task 5 are independent.** Two sessions could land them separately; but since both are ~half-day for one dev, serial execution is fine.
- **Task 1's CEL env and Task 2's JSON parsing** can proceed in parallel; they meet at Task 3.
- **Task 8 drafting** can start while Task 7 is in flight — demo recipe writes don't need the final code.

Single-developer reality: sequential execution, ~3-4 days including buffer for CEL API surprises and flaky test debugging.

## Open Questions

1. **Batch check per-item `appId`?** Plan says reject cross-store in one batch to keep auth sane. Confirm: is any known upstream OpenFGA API form permissive here? (Short answer from spec §7.1: no, we're consistent — each biz endpoint is app-scoped.) ✅ Keep as-is.
2. **Does `list_objects_with_subcheck_encounters_cycle` un-skip after Task 5?** Its checkAssertions are exercised but listObjectsAssertions remain out of scope. Change the skip map to assertion-granularity, or keep the whole test skipped with rationale "contains CP-5 listObjectsAssertions we can't exercise yet"? **Default:** keep whole-test skip with updated rationale (simpler; avoids introducing a new axis of test granularity).
3. **Should CP-4 also provide a minimal Go SDK example** showing a conditional Check? Spec §8.2 says SDK examples are CP-8 territory. ✅ Defer to CP-8.

## Verification (pre-implementation)

- [x] Every task has acceptance criteria
- [x] Every task has a verification step
- [x] Task dependencies are identified and ordered correctly
- [x] No task touches more than ~5 files (largest is Task 7 with 4 files)
- [x] Checkpoints exist between phases
- [ ] **Human has reviewed and approved the plan** ← you
