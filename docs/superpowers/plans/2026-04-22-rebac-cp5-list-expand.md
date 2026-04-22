# Implementation Plan: ListObjects / ListUsers / Expand (CP-5)

**Status:** ⏳ Pending approval
**Spec:** [`docs/rebac-spec.md`](../../rebac-spec.md) §6.2 (Expand), §6.3 (ListObjects), §6.4 (ListUsers), §6.5 (Read tuples), §7.1 (routes)
**Plan ancestor:** [`docs/rebac-plan.md`](../../rebac-plan.md) §3 PR3 CP-5
**Branch:** `feature/rebac-cp3` (continues — CP-3 + CP-4 + CP-5 ship as PR2 if bundled, or CP-5 + CP-6 as PR3)
**Predecessor:** CP-4 on the same branch (23 commits, consolidated 129/5/0)

---

## Overview

CP-5 exposes the three "inverse" engine commands — ListObjects, ListUsers, Expand — plus wires the remaining tuple-CRUD HTTP routes. Focus is **functional correctness**: cursor pagination stability, bounded timeout, consistent ordering. SLA, rate limit, L2 cache, Prometheus, and 429-backoff SDK examples all land in **CP-6 / CP-8** (spec §6.3.1 is explicit about the split). Consolidated suite's 2 `list_objects_*` skips should unlock here.

6 tasks, ~2–3 days estimate. Mostly object-layer work with thin controller wrappers — CP-3 and CP-4 already built the reverse-index infrastructure (`idx_reverse` on `biz_tuple`, `ReBACCheck` for per-candidate evaluation).

## Architecture Decisions

- **Reverse-index candidate generation**. ListObjects starts from the `user` end: query `biz_tuple` via `idx_reverse` (store_id, user, user_type, object_type) to collect candidate object_ids in deterministic order, then per-candidate dispatch `ReBACCheck`. Minimises the candidate set vs scanning all objects of a type.
- **Per-candidate Check = existing engine**. We do NOT build a separate "list-specific" resolver. Every candidate flows through `ReBACCheck` — a 10k-tuple store is the functional target (SLA under this size is CP-8). Bounds we already enforce (memo, depth cap, cycle detection) carry over.
- **Cursor = opaque base64-encoded JSON**. Simplest shape: `{"lastObjectId": "document:d42"}`. Opaqueness lets us grow the state (e.g. intersection-branch exhaustion flags) without breaking clients. base64-encoded to discourage clients parsing it.
- **Hard 10s timeout via `context.WithTimeout`**. Spec §6.3 item 3: "context 10s timeout". On expiry, return what's collected + the next cursor so a client can resume. The timeout is internal to the handler; the engine's ReBACCheck doesn't know about it — we check `ctx.Err()` between candidates.
- **`biz-write-tuples` accepts `{writes, deletes}`** (spec §6.5). Type-restriction validation applies at write time (uses the schema already loaded for this app) — invalid-subject tuples are rejected with a structured error rather than silently ignored.
- **No HTTP auth surprises**. All routes accept `?appId=` query param; PR1's authz_filter I1 fix already maps that to the right tenant. Body-field `appId` also accepted for SDK ergonomics.

## Dependency graph

```
Task 1 (ListObjects engine) ─┐
Task 2 (ListUsers engine)  ──┤
Task 3 (Expand engine)     ──┤
                             │
                             ▼
                    Task 4 (biz-write-tuples + biz-read-tuples routes)
                             │
                             ▼
                    Task 5 (list/expand HTTP routes)
                             │
                             ▼
                    Task 6 (CP-5 docs wrap-up)
```

Tasks 1-3 are independent (can go in parallel if multi-agent). Everything else is sequential.

## Task list

### Phase 1 — Engine commands

#### Task 1: ReBACListObjects with cursor + timeout
**Description:** New file `object/biz_rebac_list.go` or extension of engine. Implements `ReBACListObjects(req)` with reverse-index candidate generation, per-candidate ReBACCheck, cursor-based pagination, 10s context timeout.

**Acceptance:**
- Empty tuples → empty result, empty cursor
- 1 allowed object → result = [that object], empty cursor
- PageSize=5, 10 allowed → two pages, cursor roundtrip
- ContinuationToken opaque (base64) — client never parses
- Invalid token → 400-style error
- Timeout → returns what's collected + cursor for resume
- Contextual tuples honored (their object_ids show up in results)

**Verification:**
- `go test -run 'TestListObjects_' ./object/ -timeout 120s` green
- Consolidated `list_objects_expands_wildcard_tuple` un-skippable if semantics align

**Scope:** M (1 new file ~200 lines, 1 extension, 5-7 tests)

#### Task 2: ReBACListUsers with cursor
**Description:** Symmetric to ListObjects but inverted — given `(object, relation)`, enumerate users who have that relation. Same cursor shape, same timeout.

**Acceptance:**
- Direct grants surface
- Wildcard `user:*` in store → surfaces as a `user:*` result
- Userset-granted users (`team:eng#member` grants via eng's members) surface flattened as individual `user:<id>`
- Cursor roundtrip
- Contextual tuples honored

**Verification:**
- `go test -run 'TestListUsers_' ./object/ -timeout 120s` green

**Scope:** M

#### Task 3: ReBACExpand — relation tree JSON
**Description:** `ReBACExpand(object, relation)` returns the OpenFGA-format tree: a recursive `{users: [...], computedUserset: {...}, tupleToUserset: {...}, difference: {base, subtract}, union: {child: [...]}, intersection: {child: [...]}}` structure. Primarily a debugging aid for the Tester UI (CP-7); CP-5 just lands the engine function + types.

**Acceptance:**
- `this` rewrite → leaf with `{users: [...]}` (from matching tuples)
- `computed_userset` → `{computedUserset: {object, relation}}`
- `tuple_to_userset` → `{tupleToUserset: {tupleset, computedUserset}}`
- `union / intersection / difference` → recursive children

**Verification:**
- `go test -run 'TestExpand_' ./object/` green (pure tests using hand-built schemas)

**Scope:** S-M

### Checkpoint: Engine ready (after Task 3)
- [ ] Three engine functions callable from object layer
- [ ] Consolidated suite: the 2 `list_objects_*` skips eligible for removal
- [ ] `go test -race` clean

### Phase 2 — HTTP surface

#### Task 4: `/api/biz-write-tuples` + `/api/biz-read-tuples` routes
**Description:** New handlers in `controllers/biz_rebac_api.go`. Write handler accepts `{writes: [...], deletes: [...]}` in one request, runs schema validation per tuple against the current authorization model (type, relation, user type, optional userset), commits in a single xorm transaction. Read handler accepts `{object?, relation?, user?}` filters + cursor.

**Acceptance:**
- Write with valid tuples → success, row count returned
- Write with invalid subject type → whole batch rejected, no partial writes
- Empty writes + non-empty deletes → deletes applied
- Read with no filters → all tuples for the app, paginated
- Cursor stable across writes (caller resumes correctly)

**Verification:**
- `make run` + curl smoke: write a tuple, read it back, delete it
- Consolidated suite unaffected (these are new routes, no existing tests touch them)

**Scope:** M

#### Task 5: `/api/biz-list-objects` + `/api/biz-list-users` + `/api/biz-expand` routes
**Description:** Thin controller wrappers around Task 1-3 engine functions. Same body-first shape as `/api/biz-check`: `{appId, authorizationModelId?, objectType, relation, user, contextualTuples?, context?, pageSize?, continuationToken?}`. Routes registered in `routers/router.go`.

**Acceptance:**
- Request validation (appId, required fields) at handler level before engine call
- 200 response envelope matches spec §7 convention (`{status: "ok", data: ...}`)
- Swagger v2 annotations on all three handlers

**Verification:**
- `make run` smoke: save schema → write tuples → /api/biz-list-objects returns expected set
- `go test -tags skipCi ./controllers/...` still green

**Scope:** S

### Phase 3 — Wrap-up

#### Task 6: CP-5 docs wrap-up
**Description:** Mark CP-5 complete in `docs/rebac-plan.md` §7, tick the ReBAC P2/P3 tuple-and-list boxes in `TODO.md`, write the `docs(rebac): CP-5 complete` commit with a demo recipe (save schema → write tuples → list_objects → paginate).

**Scope:** XS

### Checkpoint: CP-5 complete (after Task 6)
- [ ] ListObjects / ListUsers / Expand callable + documented
- [ ] /api/biz-write-tuples + /biz-read-tuples + /biz-list-objects + /biz-list-users + /biz-expand live
- [ ] Consolidated 131/3/0 or better (unlocking the 2 `list_objects_*` skips)
- [ ] `docs/rebac-plan.md` §7: CP-5 row ✅

## Risks and Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Reverse-index candidate generation over-returns (lots of candidates, each needs a Check, slow) | Medium — functional tests may time-out on rich fixtures | Memo across candidates in one list request; bound candidate set via object_type filter; 10s internal timeout so slow cases return progress |
| R2 | Cursor format changes break clients that peeked at the base64 | Low for CP-5 (no real clients yet), Medium later | Opaque contract documented; any schema change needs a version byte prefix |
| R3 | `biz-write-tuples` partial-commit bug if transaction boundary is wrong | High — data integrity | Use xorm `Session().Begin()` + `Commit/Rollback`; commit a negative test that asserts rollback on invalid tuple in a batch |
| R4 | Expand produces enormous trees for deep schemas | Low-Medium | Cap tree depth at maxResolutionDepth (same 25); terminate with a "_truncated" marker |
| R5 | Unlocking `list_objects_expands_wildcard_tuple` exposes wildcard-userset-expansion gaps | Medium | Ship Task 1 first, un-skip the test, fix whatever surfaces — then Task 2/3 |

## Parallelization Opportunities

- **Tasks 1-3** are independent engine commands — a multi-agent setup could run them concurrently. Single developer: sequential, but each commit can land without waiting for siblings.
- **Task 4** is independent of Tasks 1-3 — it's tuple CRUD, not list/expand. Could go first if preferred.
- **Task 6** (docs) can draft during Task 5.

## Open Questions

1. **Should Task 4 write-tuples also accept `?appId=` via query?** Yes — consistent with every other biz-* write endpoint. Default adopted.
2. **Should ReBACListObjects evaluate candidates concurrently?** Plan §3 mentions "errgroup, 上限 8 并发" for CP-6; CP-5 does sequential for correctness, CP-6 adds concurrency. Default: sequential.
3. **Do we land Expand's full OpenFGA shape or a simplified form?** OpenFGA's Expand tree is complex (9+ rewrite node types). CP-5 ships the simplest form that's isomorphic to the 5 rewrite kinds; CP-7 Tester UI asks for what it actually needs, we extend then.

## Verification (pre-implementation)

- [x] Every task has acceptance criteria
- [x] Every task has a verification step
- [x] Task dependencies are identified and ordered correctly
- [x] No task touches more than ~5 files
- [x] Checkpoints exist between phases
- [ ] **Human has reviewed and approved the plan** ← you
