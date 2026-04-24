# Implementation Plan: ReBAC Frontend (CP-7 Full)

**Status:** ⏳ Pending approval
**Spec:** [`docs/rebac-spec.md`](../../rebac-spec.md) §8 Frontend UI (§8.1 wizard, §8.2 AppAuthorizationPage, §8.3 component inventory)
**Plan ancestor:** [`docs/rebac-plan.md`](../../rebac-plan.md) §3 PR4 CP-7
**Branch:** `feature/rebac-cp3` (continues — CP-3/4/5/6 already landed)
**Predecessor:** CP-6 (feature/rebac-cp3 HEAD; 33 commits; consolidated 129/5/0)

---

## Overview

CP-7 ships the complete ReBAC admin UI as required by spec §13 Never OQ-3 — **full-function visual editor**, not an MVP subset. Five React components, one wizard step, ten Backend API wrappers, i18n zh/en. Plan §3 PR4 estimates 5 days; this plan breaks it into 11 tasks so individual commits stay reviewable and a session can stop at any task boundary without leaving a half-built UI.

The central architectural choice is **one source of truth: an in-memory AST per schema**. Tab A (DSL editor) and Tab B (visual editor) are views over the same AST. Any edit flows through AST → notify both tabs → re-render. When DSL has a parse error, Tab B locks the affected relation's editor and shows an error badge; the user must fix DSL before the visual side can re-open.

## Architecture Decisions

- **Single-AST state model** — Zustand store (or `useReducer` + Context; no global state yet for ReBAC, so pick the lightest option — `useReducer` + Context). State shape: `{ rawDSL: string, parsedProto: AuthorizationModel | null, parseError: string | null, dirty: boolean }`. Both Tab A and Tab B subscribe.
- **Parse on blur, not keystroke** — Debounced 500ms server-side parse via `/api/biz-write-authorization-model?dryRun=true`. Keystroke-level parse would flood the backend. Client-side syntax highlight is lezer-driven (static grammar), not a live parse.
- **`dryRun=true`** — New backend flag on `biz-write-authorization-model`: validate + parse + return JSON, but don't INSERT. Needed so the editor can preview without advancing the model. Backend change is ~10 lines.
- **Visual editor is a *controlled* tree** — Each rewrite node is a React component that receives `{ node, onChange(newNode) }`. Parent re-assembles via path-based immer updates. This is the idiomatic React pattern for nested recursive forms and scales to any depth spec §8.2 allows.
- **CodeMirror 6 with custom lezer grammar** — Highlight DSL keywords (`type`, `relations`, `define`, `or`, `and`, `but not`, `from`). Full parsing is server-side; highlighting is best-effort local.
- **DataTable for Tuples** — Follows the pattern documented in `web/docs/list-page-pattern.md` (selectable, client-side sort, column toggle, persistKey, bulk actions). Reuse so admin UX stays consistent.
- **Tester tree = react-flow** — react-flow is already in package.json (used by Site gateway panel). Nodes are Expand tree levels; edges connect parent → children. Custom node types per rewrite kind.
- **i18n via homegrown `web/src/i18n.tsx`** — Add all new keys to `web/src/locales/{zh,en}.ts`. `npm run check:i18n` (runs inside `build`) will fail if any string is untranslated.

## Dependency Graph

```
Task 1 (Backend API wrappers) ──┐
Task 2 (i18n keys scaffolding) ─┤
Task 3 (AppAuthorizationPage tab dispatch) ──┐
                                             │
Task 4 (BizSchemaDslEditor — DSL alone) ─────┤
                                             │
Task 5 (BizSchemaVisualEditor — tree UI) ────┤
                                             │
Task 6 (BizSchemaEditor container + AST sync) ─┤
                                             │
Task 7 (BizTupleManager) ────────────────────┤
                                             │
Task 8 (BizReBACTester) ─────────────────────┤
                                             │
Task 9 (Integration / SDK snippets tab) ─────┤
                                             │
Task 10 (BizAppConfigCreatePage wizard step) ─┤
                                             │
Task 11 (CP-7 docs + e2e + i18n final) ←─────┘
```

Tasks 1-3 are foundational; 4-9 depend on them but can largely interleave. Task 10 modifies an existing page; independent. Task 11 wraps up.

## Task List

### Phase 1 — Foundation

#### Task 1: BizBackend.ts — 10 ReBAC API wrappers
**Description:** Extend `web/src/backend/BizBackend.ts` with TypeScript functions that POST/GET the 10 ReBAC endpoints from spec §7.1. Typed request/response via interfaces. TanStack Query hooks wrap each (naming: `useBizCheck`, `useSaveAuthorizationModel`, etc.).

**Acceptance:**
- One exported function per endpoint: `saveAuthorizationModel`, `readAuthorizationModel`, `listAuthorizationModels`, `biz-check`, `biz-batch-check`, `biz-write-tuples`, `biz-read-tuples`, `biz-list-objects`, `biz-list-users`, `biz-expand`
- Request/response types match backend structs (TupleKey, CheckResult, ExpandNode, etc.)
- TanStack Query hooks for the common ones

**Verification:**
- `cd web && npm run build` clean (tsc + vite build both pass)

**Scope:** M (~200-300 lines)

#### Task 2: i18n keys scaffolding
**Description:** Add every string new-UI uses to `web/src/locales/zh.ts` and `web/src/locales/en.ts` upfront — prevents `npm run check:i18n` failures mid-feature. ~80-100 keys.

**Acceptance:**
- Both locale files extended with a `rebac.*` namespace
- `npm run check:i18n` passes

**Scope:** S

#### Task 3: AppAuthorizationPage — ModelType tab dispatch
**Description:** At top of the existing page, branch on `config.modelType`. For `"casbin"` keep today's Tab set. For `"rebac"` render the new 5 Tabs (概览 / Schema / Tuples / Tester / 集成), each initially pointing at a placeholder `<Coming in Task N>` component. This is the architectural split that unblocks Tasks 4-9 to land incrementally.

**Acceptance:**
- Casbin apps render unchanged (visual regression test / eyeball)
- ReBAC apps render the 5 empty tabs with correct labels
- Tab routing via existing `useParams` / `useSearchParams` mechanism

**Scope:** S-M

### Checkpoint: Foundation (after Task 3)
- [ ] `npm run build` clean (tsc + vite + check:i18n)
- [ ] Browser smoke: ReBAC app shows 5 new tabs; Casbin app unchanged
- [ ] Backend wrappers callable from DevTools console

### Phase 2 — Schema editor (OQ-3 core)

#### Task 4: BizSchemaDslEditor — DSL editor with server validation
**Description:** CodeMirror 6 + custom lezer grammar for OpenFGA DSL. Debounced server-side validation via `/biz-write-authorization-model?dryRun=true` (backend flag added in this task too — `?dryRun=true` or body `dryRun: true`, ~10 line change to `BizWriteAuthorizationModel` handler). Inline error marker at line/column from backend error message.

**Acceptance:**
- Syntax highlighting for DSL keywords
- Blur triggers dry-run validation; error displayed inline
- Save button sends the real write (dryRun=false)
- Cursor + scroll preserved across re-renders

**Scope:** M

#### Task 5: BizSchemaVisualEditor — query-builder tree UI
**Description:** The core OQ-3 deliverable. Renders the parsed `AuthorizationModel` as an editable tree:
- Left rail: type list with add/remove
- Right rail (when a type is selected): relation list with add/remove
- Relation edit pane: recursive `<RewriteNode>` component supporting all 5 rewrite kinds + nesting
- Up/down/delete on every non-root node
- Difference: 2-child layout (base on left, subtract on right)
- Preview DSL sidebar updates live from AST
- If AST has a parse error somewhere, that relation's editor is locked with an error badge

**Acceptance:**
- All 5 rewrite kinds editable: `this` (+ type restrictions + conditions), `computed_userset`, `tuple_to_userset`, `union`, `intersection`, `difference`
- Nested union-in-intersection-in-difference composes correctly
- Any edit immediately refreshes the DSL preview
- Type restriction editor inside `this`: multi-select of allowed user types, wildcard toggle, userset reference (`team#member`), condition-name dropdown

**Scope:** L (this is the week-long task; ~800-1200 lines) — **the only L-sized task in the plan**; may span multiple sessions.

#### Task 6: BizSchemaEditor — Tab container with AST sync
**Description:** A container component with `<Tab>` for DSL and Visual, sharing one reducer-backed AST state. Switching tabs preserves unsaved edits. DSL parse errors surface as locked Visual editor (per spec §8.2). Save button serialises AST → DSL → backend.

**Acceptance:**
- Edit in DSL → switch to Visual → see reflected change
- Edit in Visual → switch to DSL → see updated DSL text
- Unsaved state indicator; save-before-leave warning

**Scope:** M

### Checkpoint: Schema editor (after Task 6)
- [ ] Can save spec §5.1 example schema via either tab
- [ ] Bidirectional sync verified manually
- [ ] `npm run lint` / `npm test` clean

### Phase 3 — Tuples & Tester & Integration

#### Task 7: BizTupleManager — DataTable + CRUD + bulk import
**Description:** Standard `DataTable` from `web/docs/list-page-pattern.md`: `selectable`, `clientSort`, `columnsToggle` with `persistKey`, `bulkActions` for delete. New-tuple form validates against current schema client-side (pulls `directlyRelatedUserTypes` from `authorizationModel`). Bulk import: paste CSV or JSON → preview → validate → apply.

**Acceptance:**
- List all tuples for app with pagination (cursor)
- Filter by object / relation / user
- Add tuple inline; schema-invalid subject rejected with message
- Bulk import CSV/JSON with preview
- Bulk delete selected

**Scope:** M-L

#### Task 8: BizReBACTester — Check form + Expand tree
**Description:** Top form: user / object / relation, optional contextual tuples (JSON textarea), optional context vars (JSON textarea). Bottom: allow/deny badge + Expand tree using react-flow. History of last 20 Checks in localStorage.

**Acceptance:**
- Simple Check returns ✅/❌
- Contextual tuples override DB (e.g. grant extra viewer in request)
- Condition context flows into CEL eval
- Expand shows rewrite tree; nodes labeled by kind

**Scope:** M

#### Task 9: Integration Tab — SDK code snippets
**Description:** Static Markdown-rendered snippets for Go / TypeScript / Python. Shows basic Check, Write, batched Check, contextual tuples, Condition context, `useAccessibleResources` hook (spec §8.2 calls this out). Copy-to-clipboard buttons.

**Acceptance:**
- 3 language tabs with working snippet templates
- Substitutes actual app id / current user id into examples
- No backend-dependent examples that'd break on schema changes

**Scope:** S-M

### Phase 4 — Wizard & wrap-up

#### Task 10: BizAppConfigCreatePage — Step 2 RBAC/ReBAC card pick
**Description:** On the app-creation wizard's second step, add two large cards side-by-side: **RBAC (Casbin)** and **ReBAC (OpenFGA)**. Each has an icon, a ~60-character positional sentence, and a "When to pick me" Tooltip. Selection flows into `config.modelType`.

**Acceptance:**
- New apps default ModelType based on selection
- Existing wizard tests still pass
- Tooltip copy reviewed

**Scope:** S

#### Task 11: CP-7 docs + e2e + i18n final
**Description:** Update `docs/rebac-plan.md` §7 with CP-7 ✅. Run `npm run check:i18n` for final clean pass. Add a single Playwright e2e: create ReBAC app → save 3-type schema via DSL → write 2 tuples → Tester check returns true → screenshot. Update TODO.md frontend P4/P5 boxes.

**Acceptance:**
- `cd web && npm run e2e -- --grep rebac` green
- Plan and TODO ticked
- Demo recipe in commit message reproducible from a fresh checkout

**Scope:** S-M

## Risks and Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Bidirectional AST sync has subtle bugs (edit in Visual then DSL then Visual drifts) | High — Task 6 | Single source of truth: AST in reducer, both tabs read-only views + dispatch edit actions. No parallel string states. |
| R2 | CodeMirror 6 lezer grammar for OpenFGA DSL has no upstream package; writing from scratch | Medium | Ship Task 4 with plain-text editor (no highlight) if lezer work takes >1 day; add grammar in CP-8 follow-up |
| R3 | react-flow complexity for Expand tree viz | Medium | Fall back to a nested-list JSON view if react-flow integration drags on; spec says "轻量实现即可" |
| R4 | Visual editor Task 5 is 800-1200 lines — likely spans sessions | Medium | Break into sub-tasks (5a: type/relation list; 5b: rewrite tree shell; 5c: per-rewrite editors; 5d: type-restriction form) — each can commit independently |
| R5 | `?dryRun=true` backend change interacts with CP-2 conflict scanner | Low | Dry-run skips the advance but still runs conflict scanner; if scanner returns conflicts, return them as preview data, don't error |
| R6 | Existing AppAuthorizationPage is 2144 lines — tab-dispatch refactor risks regression on Casbin path | High | Task 3 wraps existing Casbin JSX in a `if (modelType !== "rebac")` block, zero line changes to the body. Visual diff review before commit. |

## Parallelization Opportunities

- **Task 5** is the critical-path L-size work. Can be further split into sub-sessions (see R4). Tasks 1-3 + 4 + 7-10 can go before/alongside in different sessions; Task 5 ideally gets one focused session.
- **Task 9 (SDK snippets)** is content work — can happen entirely in parallel with editor implementation.
- **Task 11's docs** — draft during Task 10 or earlier.

## Open Questions

1. **Zustand vs useReducer + Context?** Project doesn't use Zustand yet. `useReducer` + Context is the minimal addition. **Default:** `useReducer` + Context.
2. **Do we auto-render Expand tree on every Check, or only on user request?** Auto-render on successful check; user toggles "hide tree" if noisy. **Default:** auto on.
3. **CodeMirror 6 lezer grammar origin** — write from scratch vs simpler Prism.js? **Default:** CodeMirror 6 plaintext mode first (Task 4 shippable), lezer grammar as CP-8 follow-up.
4. **Wizard integration test** — is there an existing Playwright test for `BizAppConfigCreatePage` to extend? If so use it; else add one. Check during Task 10.

## Verification (pre-implementation)

- [x] Every task has acceptance criteria
- [x] Every task has a verification step
- [x] Dependencies ordered correctly
- [x] Largest task (Task 5) has sub-split guidance in R4
- [x] Checkpoints between phases
- [ ] **Human approved the plan** ← you
