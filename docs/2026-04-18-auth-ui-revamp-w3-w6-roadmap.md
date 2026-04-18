# W3–W6 Roadmap Sketch

**Date:** 2026-04-18
**Companion to:** `docs/2026-04-18-auth-ui-revamp-plan.md` (master spec)

This document sketches the remaining weeks at the task level. Full TDD-grade plans are written just-in-time at the start of each week, once the prior week's lessons are fresh.

---

## W3 · Signup + Layouts (~2 weeks, ~12 tasks)

**Goal:** Signup page is fully data-driven; all four `formOffset` layouts render; `signinItems`/`signupItems` slot system works.

**Demo:** admin configures a brand-new signup field (e.g. "Employee ID" with regex) → end-user sees it on the signup form with live validation.

### Backend (B5, B7)
- **T01** Extend `SignupItem` struct: `Type`, `Helper`, `Group`, `ValidationMessage map[string]string`, `Step int` (all nullable)
- **T02** Extend `Organization` with `SigninMethods []*SigninMethod` + `SignupItems []*SignupItem` + merge helpers `MergeOrgAppSigninMethods()`, `MergeOrgAppSignupItems()`

### Frontend · Signup
- **T03** `useSignupSchema.ts` — derives runtime form schema from `application.signupItems` (+ validation rules from regex/type)
- **T04** `DynamicField.tsx` router + 9 field components (Text / Email / Phone / Password / PasswordConfirm / Select / Checkbox / Date / Agreement)
- **T05** `SignupPage.tsx` — stepper wrapper with auto-split (>= 6 required visible fields)
- **T06** Wire into `AuthShell` for `mode === "signup"` (replaces W1 placeholder)

### Frontend · Layouts
- **T07** `BackgroundLayer.tsx` — `formBackgroundUrl` with mobile variant, lazy preload, 404 fallback
- **T08** `SideHtml.tsx` — sanitized HTML for `formOffset=4`
- **T09** Layout router: `<AuthShell>` picks `<LeftForm>` / `<CenteredCard>` / `<RightForm>` / `<SidePanel>` based on `formOffset`
- **T10** Mobile breakpoint: `formOffset=1/3` → `2`; `formOffset=4` → collapsed accordion or hidden

### Frontend · Signin items
- **T11** Signin-item slot renderer: Logo / Back button / Languages / Captcha / Auto sign in / Select organization / Forgot password / Custom text
- **T12** `orgChoiceMode` (None / Select / Input) — implement all three + localStorage persistence for Input

---

## W4 · Admin Live Preview (~1 week, ~6 tasks)

**Goal:** Admin sees changes to the auth UI in a sidecar iframe within 200ms of edit, without save→refresh.

**Demo:** admin drags WebAuthn above Password in the signin methods list → preview reorders instantly; admin changes primary color → preview recolors.

- **T01** Three-column ApplicationEditPage layout (nav rail · 40% config · 60% preview iframe)
- **T02** Backend B9: preview-mode JWT claim + `/login?previewConfig=<base64>` honored only when claim present
- **T03** Preview serialization — diff admin form state → base64, push into iframe src with debounce
- **T04** PC / Mobile / Dark / Signin / Signup mode toggles above the iframe
- **T05** Drag-sort for `signinMethods`, `signinItems`, `signupItems` using `@dnd-kit/core` + `@dnd-kit/sortable`
- **T06** Theme color picker: palette speedbar (8 curated) + HSL custom + contrast ratio check

---

## W5 · HTML Injection + Security (~1 week, ~8 tasks)

**Goal:** raw-HTML fields render safely; visual block editor replaces 90% of raw-HTML use cases; all HTML mutations audited.

**Demo:** global admin drops a `<script>alert(1)</script>` into HeaderHtml — it's stripped; non-global admin attempting same gets silent revert + audit log entry.

- **T01** Install `isomorphic-dompurify`; add `SafeHtml.tsx` wrapper
- **T02** Wire SafeHtml for `headerHtml`, `footerHtml`, `signinHtml`, `signupHtml`, `formSideHtml` render surfaces
- **T03** Backend: `bluemonday` policy (allow: `p/a/strong/em/ul/ol/li/br/h1..h6/img`; deny: `script/iframe/object/style`); net-sanitize on save
- **T04** `POST /api/validate-html` (B8) for live preview; returns sanitized HTML + warnings list
- **T05** `VisualBlockRenderer.tsx` + block-level admin editor (Logo / Heading / Paragraph / Image / Link / Divider / Spacer)
- **T06** CSP headers on `/login`, `/signup`, `/forget` (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`)
- **T07** Field-level audit log: who/when/field/diff → `audit_log` table (create migration)
- **T08** Test: global-admin can save any HTML; org-admin's mutation gets reverted + audit entry

---

## W6 · Polish + Release (~0.5 week, ~6 tasks)

**Goal:** branch is mergeable; production rollout plan is executable; operators can monitor + roll back.

- **T01** Playwright E2E — 5 golden paths (Password / Code / WebAuthn / OAuth round-trip / Signup)
- **T02** Visual regression baselines (Playwright + pixelmatch): 4 layouts × 2 themes × 3 locales × 3 viewports ≈ 72 snapshots
- **T03** Axe-core a11y audit in the E2E suite; blocking WCAG AA violations
- **T04** Final i18n completeness sweep + native-speaker review pass
- **T05** `JETAUTH_DISABLE_NEW_AUTH_UI` ejection-seat env var + runbook
- **T06** Release notes (`CHANGELOG.md` entry), 3-min demo video, "What's new" banner for admin first-visit, migration PR description

---

## Cross-cutting concerns (handled within each week)

- **Casbin anonymous rules**: any new pre-auth endpoint added (e.g. `/api/reset-password`, `/api/validate-html` when admin-only via cookie) must land its Casbin rule in the same commit as the handler. W2a-T02's miss taught us this.
- **i18n parity**: every new `t(key)` call must add the key to BOTH `en.ts` and `zh.ts`; CI gate from W1-T04 enforces this.
- **Test coverage**: every new component has at least 2 vitest cases; every new backend handler has at least 1 unit test; integration tests accompany every new endpoint.
- **Commit hygiene**: each task → one focused commit; message body explains the why, not just the what; no bundled "WIP" commits.

---

## Estimated timeline

| Week | Calendar | Tasks | Demo |
|---|---|---|---|
| ✅ W1 | completed | 13 | Theme change propagates |
| ✅ W2a | completed | 10 | Password signin works |
| 🟠 W2b | 1 week | ~10 | All signin methods work |
| 🟡 W3 | 2 weeks | ~12 | Signup dynamic; 4 layouts |
| 🟡 W4 | 1 week | ~6 | Admin live preview |
| 🔴 W5 | 1 week | ~8 | HTML injection safe |
| 🟢 W6 | 0.5 week | ~6 | Ship |

**Total remaining:** ~5.5 weeks / ~42 tasks.

---

## When to refine this roadmap into full plans

When starting each week:

1. Re-read the master spec section for that week
2. Re-read the prior week's smoke log + code-review findings
3. Write the week's full TDD plan at `docs/superpowers/plans/2026-04-18-auth-ui-revamp-w<N>-<slug>.md`
4. Execute via `superpowers:subagent-driven-development`

This just-in-time refinement keeps each week's plan fresh with the lessons from the prior.
