# Implementation Plan: ReBAC Check Engine (CP-3)

**Status:** ✅ Approved (2026-04-22)
**Spec:** [`docs/rebac-spec.md`](../../rebac-spec.md) §6 Check algorithm
**Plan:** [`docs/rebac-plan.md`](../../rebac-plan.md) §3 PR2 CP-3
**Branch:** `feature/rebac-cp3`
**Predecessor:** CP-1 + CP-2 merged into `main` via PR #1 (`4718caad`)

---

## Overview

Implement OpenFGA v1.1 `/Check` semantics against the `biz_tuple` + `biz_authorization_model` tables landed in CP-1/CP-2. Five rewrites — `this`, `computed_userset`, `tuple_to_userset`, `union`, `intersection`, `difference` — with request-level memoisation, depth cap (25), and errgroup short-circuit for union/intersection. Conditions / CEL stay in CP-4. Verified against the upstream `openfga/tests/consolidated_1_1_tests.yaml` non-conditional subset.

The CP-3 scope is defined by spec §6.1 + plan §3 PR2. 13 tasks, mostly S and M; end state is a function `ReBACCheck(req *CheckRequest) (*CheckResult, error)` that satisfies OpenFGA's own consolidated conformance tests.

## Architecture Decisions

- **`TupleKey` is a hand-rolled Go struct**, not `openfgav1.TupleKey`. The proto type carries `MessageState` / `sizeCache` internals and forces protobuf JSON shape on HTTP edges. Conversion helpers stay at the API boundary if/when we publish an OpenFGA-wire-compatible endpoint. (Already set in Step 1 skeleton `da6838d3`.)
- **Memo keyed by `"object#relation@user"`**. Spec §6.1 mentions a `|conditionHash` suffix for CP-4; CP-3 omits it because conditions are out of scope. When CP-4 lands, the key grows by one segment without breaking callers.
- **errgroup only in `union` + `intersection`**. `difference` is strictly sequential (`A but not B` — A must be known before we even consider B for short-circuit). Lifting difference into errgroup saves zero latency and complicates cancellation.
- **`tuple_to_userset` is lazy**, not eager. `X from Y` first queries Y-tuples for the object, then recurses into each parent's X relation. Eager pre-fetching would fan out on every folder-with-many-parents schema.
- **Consolidated-test filtering**. `consolidated_1_1_tests.yaml` contains conditional + contextual cases that CP-3 cannot pass. Skip those explicitly with `t.Skip("CP-4 — conditions")` rather than hiding behind a yaml subset — the skip list is searchable and auditable.
- **No controller / route changes in CP-3**. `/api/biz-check` wiring is a CP-4 concern per plan §3 PR2. CP-3 exposes `ReBACCheck` as an object-layer function only; tests hit it directly.

## Dependency graph

```
Task 1 (skeleton, done)
    │
    ▼
Task 2 (model resolution) ──────── Task 3 (rewrite dispatcher)
                                           │
    ┌──────────────────┬───────────────────┼──────────────────┐
    ▼                  ▼                   ▼                  ▼
Task 4 (this)    Task 5 (computed)   Task 6 (tuple_to)   [needs 4]
                      [needs 4]          [needs 4,5]
    │                  │                   │
    └──────────────────┴───────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    ▼                  ▼                  ▼
Task 7 (union)   Task 8 (intersect)  Task 9 (difference)
                                          │
                                          ▼
                                     Task 10 (memo verify)
                                          │
                                          ▼
                                     Task 11 (maxDepth)
                                          │
                                          ▼
                                  Task 12 (consolidated suite)
                                          │
                                          ▼
                                     Task 13 (docs wrap-up)
```

## Task list

### Phase 1 — Foundation

#### ✅ Task 1: Engine skeleton
**Status:** Done (`da6838d3`).
**Delivered:** `CheckRequest` / `CheckResult` / `TupleKey` / `checkContext` / `maxResolutionDepth = 25`, input validation, `ReBACCheck` returns `not implemented`.

#### Task 2: Model resolution helper
**Description:** Add `resolveAuthorizationModel(storeId, modelId)` that parses storeId → (owner, appName), falls back to `BizAppConfig.CurrentAuthorizationModelId` when modelId is empty, loads the `BizAuthorizationModel` row, and parses `SchemaJSON` into `*openfgav1.AuthorizationModel`. Cross-store lookups return "not found" (spec §7.2 no-existence-leak).

**Acceptance:**
- Valid (storeId, modelId) → returns parsed proto, no error
- Empty modelId + app has current model → returns current's parsed proto
- Empty modelId + app has no current model → error contains "no authorization model"
- modelId belongs to a different store → error contains "not found" (not 403)

**Verification:**
- `go test -run TestResolveAuthorizationModel ./object/` green
- Requires DB → new tests go in `biz_rebac_engine_db_test.go` behind `!skipCi`

**Dependencies:** Task 1
**Files:** `object/biz_rebac_engine.go`, `object/biz_rebac_engine_db_test.go` (new)
**Scope:** S

#### Task 3: Rewrite dispatcher
**Description:** Replace `ReBACCheck`'s "not implemented" path with: resolve model → locate `(object_type, relation)` in `AuthorizationModel.TypeDefinitions` → dispatch the relation's `Userset` to per-type helpers via a single switch on `userset.Userset.(type)`. Helpers themselves return `not implemented` for now; this task only owns the switch, depth increment, and memo check/write. Unknown userset types return an explicit error (not a silent false).

**Acceptance:**
- Unknown object type → error "object type X not in schema"
- Unknown relation → error "relation Y not defined on X"
- Unknown rewrite subtype → error "unsupported rewrite kind"
- Memo sync.Map hit skips re-dispatch (counter in test confirms)
- Depth > 25 → error containing "max resolution depth"

**Verification:**
- `go test -run 'TestCheckDispatcher|TestMemo|TestMaxDepth_Dispatcher' ./object/` green (tests use fake schemas, no DB)
- All existing engine-skeleton tests still green

**Dependencies:** Task 2
**Files:** `object/biz_rebac_engine.go`, `object/biz_rebac_engine_test.go`
**Scope:** S-M

### Checkpoint: Foundation (after Task 3)
- [ ] `go build ./...` clean
- [ ] `go test ./object/... -run 'ReBACCheck|ResolveAuthorizationModel|CheckDispatcher|Memo|MaxDepth'` green
- [ ] `go vet ./...` clean
- [ ] Confirmed dispatcher signature stable before rewrite implementations land

---

### Phase 2 — The five rewrites

Every rewrite task has the same verification shape: a focused `*_test.go` file with true / false / edge-case tests, schema literals kept inline, no DB when avoidable.

#### Task 4: `this` rewrite
**Description:** `define viewer: [user]` — direct tuple match. Implement `checkThis(ctx, key, depth)`: query `biz_tuple` for exact `(store_id, object, relation, user)` match; separately query wildcard rows `(store_id, object, relation, "{userType}:*")` when `userType` is the type of `key.User`; return `true` if either matches.

**Acceptance:**
- Exact match → allowed
- No match → denied
- Wildcard `user:*` tuple → allowed for any `user:<id>` target
- Wildcard does NOT match across userset form `team:eng#member`
- Unknown store → denied (no cross-store leak)

**Verification:**
- `go test -run 'TestCheck_This' ./object/` green (uses DB fixtures; lives in `biz_rebac_engine_db_test.go`)
- End-to-end smoke: save DSL `define viewer: [user]`, write one tuple, Check returns allowed

**Dependencies:** Task 3
**Files:** `object/biz_rebac_engine.go` (new helper), `object/biz_rebac_engine_db_test.go`
**Scope:** M

#### Task 5: `computed_userset` rewrite
**Description:** `define viewer: editor` — recurse into same object's `editor` relation. Implement `checkComputedUserset(ctx, key, targetRelation, depth)`: re-dispatch with `(object, targetRelation, user)` one level deeper.

**Acceptance:**
- `viewer → editor`, user is editor → allowed
- `viewer → editor`, user is neither → denied
- Chain `a → b → c`, user in c → allowed at all three levels

**Verification:**
- `go test -run 'TestCheck_ComputedUserset' ./object/` green
- memo: the inner `editor` query should be memoised if hit from two sibling branches (covered in Task 10)

**Dependencies:** Task 4
**Files:** `object/biz_rebac_engine.go`, `object/biz_rebac_engine_db_test.go`
**Scope:** S

#### Task 6: `tuple_to_userset` rewrite
**Description:** `define viewer: viewer from parent` — find parent-tuples for the object, then recurse into each parent's `viewer`. Implement lazily: query `parent` tuples on the fly; do not pre-fetch.

**Acceptance:**
- Single parent, user is viewer of parent → allowed
- Multiple parents, user is viewer of at least one → allowed
- No parents, no fallback → denied
- Userset parent (`team:eng#member`) is traversed, not just `user:*`

**Verification:**
- `go test -run 'TestCheck_TupleToUserset' ./object/` green
- Parent query is bounded (test asserts no recursive fetch beyond declared parents)

**Dependencies:** Task 4, Task 5
**Files:** `object/biz_rebac_engine.go`, `object/biz_rebac_engine_db_test.go`
**Scope:** M

#### Task 7: `union` rewrite
**Description:** `define viewer: [user] or editor` — evaluate sub-rewrites concurrently via `errgroup.WithContext`; first `true` cancels siblings; first non-cancellation error fails the whole. Any subsequent `context.Canceled` errors are swallowed.

**Acceptance:**
- At least one branch true → allowed
- All branches false → denied
- One branch true and one branch errors (pre-cancellation) → allowed (true wins; error discarded)
- All-error case → error surfaces
- Short-circuit verified: a false-then-blocking-true test passes in bounded time via `context.WithTimeout`

**Verification:**
- `go test -run 'TestCheck_Union|TestCheck_Union_ShortCircuit' ./object/` green
- Concurrency: `-race` run clean

**Dependencies:** Task 4
**Files:** `object/biz_rebac_engine.go`, `object/biz_rebac_engine_db_test.go`
**Scope:** M

#### Task 8: `intersection` rewrite
**Description:** `define viewer: [user] and active` — evaluate sub-rewrites concurrently; first `false` cancels siblings.

**Acceptance:**
- All branches true → allowed
- Any branch false → denied
- Short-circuit: first-false cancels the rest (bounded-time test)

**Verification:**
- `go test -run 'TestCheck_Intersection' ./object/` green, `-race` clean

**Dependencies:** Task 7
**Files:** `object/biz_rebac_engine.go`, `object/biz_rebac_engine_db_test.go`
**Scope:** S-M

#### Task 9: `difference` rewrite
**Description:** `define viewer: [user] but not banned` — evaluate Base; if false, short-circuit to false. If true, evaluate Subtract; return `true && !subtract`. Strictly sequential.

**Acceptance:**
- Base true, Subtract false → allowed
- Base true, Subtract true → denied
- Base false → denied (Subtract not evaluated — assertable via counter)

**Verification:**
- `go test -run 'TestCheck_Difference' ./object/` green

**Dependencies:** Task 4
**Files:** `object/biz_rebac_engine.go`, `object/biz_rebac_engine_db_test.go`
**Scope:** S

### Checkpoint: All five rewrites (after Task 9)
- [ ] `go build ./...` clean
- [ ] `go test -race ./object/... -run 'TestCheck_'` green
- [ ] Manual smoke: spec §5.1 "document / folder / team" schema Check returns correct answers for 5 hand-picked cases (script + fixtures committed)

---

### Phase 3 — Hardening

#### Task 10: Request-level memo end-to-end verification
**Description:** Add tests that construct a schema where sibling branches query the same sub-userset, assert the underlying helper runs exactly once per unique key. Uses a counter wrapper around `ReadBizTuples` in the test (no production change if skeleton memo logic is already wired in Task 3).

**Acceptance:**
- Duplicate-key sibling query: helper invocation count = 1 per unique key, not 2

**Verification:**
- `go test -run 'TestCheck_Memo_Hits' ./object/` green

**Dependencies:** Task 3 (memo wired), Task 4-9 (rewrites to exercise)
**Files:** `object/biz_rebac_engine_db_test.go`
**Scope:** S

#### Task 11: Max-depth overflow path
**Description:** Construct a pathological cyclic schema (e.g. `viewer: editor`, `editor: viewer`) and Check must return an error, NOT false. Confirms the error-over-false invariant.

**Acceptance:**
- Cyclic schema → error contains "max resolution depth"
- Non-cyclic deep-but-bounded schema (depth 24) → normal result, no error

**Verification:**
- `go test -run 'TestCheck_MaxDepth' ./object/` green

**Dependencies:** Task 9
**Files:** `object/biz_rebac_engine_db_test.go`
**Scope:** S

#### Task 12: OpenFGA consolidated test suite port
**Description:** Fetch `consolidated_1_1_tests.yaml` from `openfga/openfga` repo (pin to v1.8.x), place under `object/testdata/openfga/consolidated_1_1_tests.yaml`, commit a Go loader that walks each `.tests[].check_requests[]` entry and runs `ReBACCheck` per tuple. Conditional + contextual-only cases call `t.Skip("CP-4 — conditions")`. Track skipped count explicitly; the count is an assertable guard so CP-4 knows what to enable.

**Acceptance:**
- All non-conditional cases pass
- Skipped count matches a committed constant (changing it must touch the test)
- Loader's yaml unmarshal tolerates unknown fields (upstream evolves)

**Verification:**
- `go test -run 'TestConsolidatedSuite' ./object/` green
- Count of skipped cases printed in test output for future CP-4 reference

**Dependencies:** Task 10, Task 11
**Files:**
- `object/testdata/openfga/consolidated_1_1_tests.yaml` (new, vendored)
- `object/biz_rebac_consolidated_test.go` (new)
**Scope:** M-L — the yaml itself is ~1k lines; loader is ~150 lines Go

### Checkpoint: CP-3 threshold gate (after Task 12)
- [ ] Consolidated non-conditional suite 100% pass (spec §15 hard gate)
- [ ] `make ut` full green
- [ ] `go test -race ./object/...` clean
- [ ] Skip count documented; CP-4 has a concrete target to unlock

---

### Phase 4 — Wrap-up

#### Task 13: CP-3 docs wrap-up
**Description:** Update `docs/rebac-plan.md` §7 CP progress table (mark CP-3 ✅), `TODO.md` ReBAC section (tick relevant boxes), `CHANGES-FROM-CASDOOR.md` if it references the biz authz engine. Write a `docs(rebac): CP-3 complete` commit with a 3-line demo recipe (minimal DSL + tuple + curl/Go snippet showing Check result).

**Acceptance:**
- `docs/rebac-plan.md` §7: CP-3 row shows ✅ with commit SHA
- `TODO.md` P2 section: "Check" bullets ticked
- Demo recipe reproducible by a fresh reader

**Verification:**
- Manual: reader walks demo recipe end-to-end on a clean checkout, gets expected output

**Dependencies:** Task 12
**Files:** `docs/rebac-plan.md`, `TODO.md`, optionally `CHANGES-FROM-CASDOOR.md`
**Scope:** XS

## Risks and Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | `consolidated_1_1_tests.yaml` contains features we don't implement until CP-4 (conditions, contextual tuples with typed params) → naive port fails | High — would block CP-3 gate | Loader explicitly skips-with-reason; skip-count becomes a tracked constant, CP-4 unlocks them |
| R2 | errgroup short-circuit race: a cancelled goroutine's `ReadBizTuples` returning after context.Cancel may hold DB connection | Medium — perf under load, not correctness | Wrap DB calls with ctx-aware `xorm.Session.Context(ctx)` (confirm available in the current xorm version); unit test asserts goroutines return within a bounded window after cancel |
| R3 | Naive `tuple_to_userset` on a "folder with 10k documents" schema does one query per parent → N+1 | Medium — production Check latency | Scope note: CP-3 correctness-first; perf batching lands in CP-6 (spec §6.6 cache lane). Benchmark here acts as a baseline, not a regression gate yet |
| R4 | Memo key `"object#relation@user"` collides if different conditions change result in CP-4 | Low (CP-3 doesn't see conditions) | Key schema documented in-code with a `// CP-4 TODO: append |conditionHash` comment at the memo write site |
| R5 | openfga/language's proto model field-presence bits cause rewrite switch to miss cases (same bug class as the `RenderSchemaFromProto` JSON round-trip fix in CP-2) | Low-Medium | Dispatch switch tested against a "hand-written proto with every rewrite kind" fixture, not just DSL-parsed protos |
| R6 | Single-plan session ends mid-rewrite; partial engine has 2-of-5 rewrites; callers that hit the unsupported ones get panics | Medium | Every rewrite helper starts life returning `error("rewrite X not implemented")`, not panicking. Incremental landing is safe |

## Parallelization opportunities

**Largely sequential.** The rewrite chain is ordered by dependency (`this` before `computed_userset` before `tuple_to_userset` before `union/intersection/difference`). Genuinely parallelizable:

- **Task 12 loader design** can draft while Task 11 is in review
- **Task 13 doc updates** can draft while Task 12 is running (stable in ~5 min once green)
- Nothing worth spinning up a second agent over; this is 1-developer work

## Open questions

1. **xorm context propagation** — need to confirm `xorm.Session.Context(ctx)` works with the currently vendored xorm version for the errgroup cancellation story in Task 7 / Task 8. If not, unit tests will reveal stale goroutines and we pick a workaround (wrap with `select` on ctx.Done before DB call).
2. **Where does `/api/biz-check` land?** Spec §7.1 says CP-4 wires it; plan §3 PR2 agrees. Confirming nothing in this plan needs to ship HTTP routes — tests hit `object.ReBACCheck` directly. ✅ Confirmed: no route changes in CP-3.
3. **Should Task 12's yaml fixture be vendored or fetched by the test at runtime?** Vendored (committed) is simpler and hermetic; fetching avoids staleness but depends on network during `go test`. Default: **vendor**. Upstream-sync cadence tracked in TODO.md (plan §4 R7).

## Verification (pre-implementation)

- [x] Every task has acceptance criteria
- [x] Every task has a verification step
- [x] Task dependencies are identified and ordered correctly
- [x] No task touches more than ~5 files (Task 12 is the largest: 2 new files + 1 yaml)
- [x] Checkpoints exist between phases
- [x] Human reviewed and approved the plan (2026-04-22)
