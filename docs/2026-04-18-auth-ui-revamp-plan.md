# Auth UI Revamp — Master Spec

**Date:** 2026-04-18
**Branch:** `feat/auth-ui-revamp`
**Owner:** eric
**Status:** Approved, pre-implementation

---

## 1. Goal

Replace the current hardcoded login/signup pages in `web/` with a fully data-driven, brand-customizable auth surface that consumes every `Application` + `Organization` customization field the backend already stores — and extend the backend where the current data model is too thin. Delete the legacy `web/` module once feature parity is reached.

**Success criteria:**
- Every field on the "界面定制" admin tab visibly affects the user-facing login/signup page within 300ms of saving (and live-previews within 200ms during editing).
- A tenant can fully rebrand their login page (color, font, layout, background, copy, providers, custom signup fields) without editor involvement.
- All backend-supported signin methods (Password / Verification Code / WebAuthn / LDAP / Face ID / WeChat) are reachable from the UI.
- Zero old `web/` code in the final cut; 116 legacy npm vulnerabilities eliminated in the process.

---

## 2. Non-goals

- Rewriting OIDC/OAuth2/SAML protocol handling (backend already works).
- Changing database schema for existing fields (only additive schema changes allowed).
- Multi-language content management (i18n keys stay in `locales/`; customers don't translate).
- In-app marketing features (pricing banners, upsells) on login — login stays focused on auth.

---

## 3. Decisions (Q1–Q7, locked)

| # | Decision | Rationale |
|---|---|---|
| Q1 | Default **Identifier-first** signin flow; admin can switch app to **Classic** tabs mode via a single config field | Modern UX + escape hatch for LDAP-only deployments |
| Q2 | `ThemeData` extended in W1 with `ColorCTA`, `ColorSuccess`, `ColorDanger`, `ColorWarning`, `DarkColorPrimary`, `DarkBackground`, `FontFamily`, `FontFamilyMono`, `SpacingScale` | One migration beats five |
| Q3 | Admin live-preview uses **URL-parameter predirectional tokens** (not postMessage) | Real render path = real validation; no dual-runtime drift |
| Q4 | Raw HTML injection fields (`headerHtml` / `footerHtml` / `signinHtml` / `signupHtml`) writable **only by global admins**; org admins get a **visual block editor** covering 90% of cases | Security first; block editor removes the need to "fix it later" |
| Q5 | `Organization.signinMethods` + `Organization.signupItems` added; Application-level values **override** Organization-level where set | Enterprise use case: one org with many apps shouldn't require repeating config |
| Q6 | Ship **one default light theme + one default dark theme** in the first release; curated 5-theme gallery in v1.1 | Quality over quantity; avoid shipping mediocre presets |
| Q7 | Signup page **auto-splits into two steps** when visible+required fields ≥ 6; `type: "step-break"` SignupItem lets admins force a break | Zero user-facing controls, system decides |

---

## 4. Scope — removed from old plan

Because we are going fully new (no parallel old/new):

- No `feature flag` on `Application.useNewAuthUI`.
- No `/login-v2/...` parallel routes. New UI lives at the existing `/login`, `/signup`, `/forget`, `/callback` paths.
- Legacy `web/` module is deleted at the end of W1 (after backend + theme foundation ship).
- Emergency rollback is a **single global env var** `JETAUTH_DISABLE_NEW_AUTH_UI=true` that serves a static "maintenance" page. Not a real feature flag — an ejection seat.

---

## 5. Theme Cascade (core architectural decision)

```
System defaults (code-embedded)
    ↓ (if org.theme.isEnabled, override)
Organization.ThemeData
    ↓ (if application.theme.isEnabled, override)
Application.ThemeData
    ↓ (if preview mode, override)
Preview overrides (admin live-preview only)
    ↓
ResolvedTheme  →  serialized as CSS variables  →  consumed by every UI component
```

Merge is **right-to-left**, per-field: unset fields inherit from the level below. Frontend never merges — it consumes a single already-merged object from `GET /api/get-resolved-theme`.

---

## 6. Backend changes (complete list)

| # | Change | Type | Week |
|---|---|---|---|
| B1 | Extend `ThemeData` struct (9 new optional fields) | Additive | W1 |
| B2 | `GET /api/get-resolved-theme?app=X&mode=light\|dark[&preview=...]` | New endpoint | W1 |
| B3 | `GET /api/get-app-login` response includes `providersResolved[]` (provider + logo URL + displayName + clientId) | Extend response | W1 |
| B4 | `/api/update-application` adds role-gated field validation: HTML fields → global admin only; CSS fields → org admin+ | Modify handler | W1 |
| B5 | Extend `SignupItem` with `type`, `helper`, `group`, `validationMessage`, `step` (new columns, all nullable) | Additive | W3 |
| B6 | `POST /api/resolve-signin-methods` (identifier → {availableMethods[], recommended, userHint}) | New endpoint | W2 |
| B7 | Org-level `signinMethods` + `signupItems` fields + merge logic | Additive + merge | W3 |
| B8 | `POST /api/validate-html` (server-side DOMPurify-equivalent via bluemonday) | New endpoint | W5 |
| B9 | Preview token: new claim `authUIPreview: true` in short-lived admin JWT; `/login?preview=<token>&config=<base64>` honored only when claim present | Middleware | W4 |

**All additive.** Old columns never removed.

---

## 7. Frontend architecture (new)

```
web/src/auth/                        ← new top-level module
├── AuthShell.tsx                        ← layout router (formOffset 1|2|3|4)
├── ThemeProvider.tsx                    ← consumes /api/get-resolved-theme, injects CSS vars
├── shell/
│   ├── BrandingLayer.tsx                ← logo/favicon/title
│   ├── TopBar.tsx                       ← language/theme toggle (always-on slots)
│   ├── BackgroundLayer.tsx              ← formBackgroundUrl with fallback + prefetch
│   └── SideHtml.tsx                     ← formOffset=4 side panel (sanitized HTML)
├── signin/
│   ├── SigninPage.tsx                   ← orchestrator (identifier-first state machine)
│   ├── IdentifierStep.tsx               ← step 1: username/email/phone
│   ├── MethodStep.tsx                   ← step 2: dispatch to PasswordForm/CodeForm/WebAuthnForm
│   ├── PasswordForm.tsx
│   ├── CodeForm.tsx                     ← verification code (email/phone)
│   ├── WebAuthnForm.tsx
│   ├── FaceForm.tsx
│   ├── ProvidersRow.tsx                 ← social login buttons from providersResolved
│   ├── ClassicSigninPage.tsx            ← fallback: classic tabs mode (Q1)
│   └── ForgotPasswordLink.tsx
├── signup/
│   ├── SignupPage.tsx                   ← stepper wrapper (auto-split)
│   ├── SignupStep.tsx
│   ├── fields/
│   │   ├── DynamicField.tsx             ← type-based router
│   │   ├── TextField.tsx / EmailField.tsx / PhoneField.tsx / PasswordField.tsx
│   │   ├── SelectField.tsx / CheckboxField.tsx / DateField.tsx
│   │   ├── AgreementField.tsx
│   │   ├── InvitationCodeField.tsx
│   │   ├── VerificationCodeField.tsx    ← shown conditionally when email/phone filled
│   │   └── CountryPhoneField.tsx
│   └── useSignupSchema.ts               ← derives form schema from signupItems
├── items/                                ← signinItems slot components
│   ├── LogoSlot.tsx / BackButtonSlot.tsx / LanguageSlot.tsx / CaptchaSlot.tsx
│   ├── AutoSigninSlot.tsx / SelectOrgSlot.tsx / AgreementSlot.tsx
│   └── CustomTextSlot.tsx               ← for isCustom=true items
├── html/
│   ├── SafeHtml.tsx                     ← DOMPurify wrapper
│   └── VisualBlockRenderer.tsx          ← renders structured blocks (org admin path)
└── api/
    ├── getResolvedTheme.ts
    ├── getAppLogin.ts
    ├── resolveSigninMethods.ts
    └── types.ts
```

Old files to **delete in W1**:
- `web/src/pages/Login.tsx`
- `web/src/pages/Signup.tsx`
- Entire `web/` directory at root (legacy Casdoor frontend)

---

## 8. Milestones (6 weeks)

| Week | Theme | Deliverable | Demo |
|---|---|---|---|
| W1 | **Foundation** | B1–B4 backend; `web/src/auth/ThemeProvider`; delete old `web/`; new `AuthShell` skeleton that renders placeholders | Admin changes primary color → user login page reflects it |
| W2 | **Signin core** | Identifier-first flow; PasswordForm / CodeForm / WebAuthnForm / FaceForm / ProvidersRow; ClassicSigninPage fallback | Real user can sign in with any backend-supported method |
| W3 | **Signup + layouts** | SignupPage with auto-split; all DynamicField types; formOffset 1/2/3/4; signinItems slots; B5 (SignupItem extensions); B7 (org-level inherit) | Admin configures custom signup fields → user sees them |
| W4 | **Admin live preview** | Three-column admin layout; URL-token preview iframe; drag-sort for methods/items; B9 (preview token) | Admin drags WebAuthn to top → preview updates <200ms |
| W5 | **HTML injection + security** | SafeHtml + DOMPurify; VisualBlockRenderer; B8 (validate-html); CSP headers; field-level audit log | Global admin pastes HTML → sanitized + previewed safely |
| W6 | **Polish + release** | E2E test matrix; visual regression baselines; i18n completeness check; release notes | Ship to production |

Each week's `docs/superpowers/plans/2026-04-18-auth-ui-revamp-w<N>-*.md` will be written at the end of the prior week when scope is freshest.

---

## 9. Test strategy

- **Unit** (Vitest / Go testing): theme merge, dynamic signup schema, identifier-method resolution
- **Integration** (Go testing w/ sqlite): backend endpoints B1–B9
- **E2E** (Playwright): 5 golden paths — password, code, WebAuthn, OAuth round-trip, signup
- **Visual regression** (Playwright + pixelmatch locally): 4 layouts × 2 themes × 3 locales × 3 viewports = 72 baseline snapshots
- **A11y** (Axe-core in Playwright): WCAG AA on every page
- **i18n** (CI lint): no raw strings in `auth/` module — all must use `t(key)`; missing `zh.ts` key fails build

---

## 10. Security posture

- Raw HTML: stored as-is; sanitized on **render** via DOMPurify AND on **save** via bluemonday (belt + suspenders).
- CSP on auth pages: `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` (prevent clickjacking).
- Preview token: 15-minute TTL, single-use nonce, same-origin check.
- Field-level RBAC: enforced in `/api/update-application` handler, not just UI.
- Audit log: every mutation of HTML/CSS fields writes `{who, when, field, diff}` to `audit_log`.

---

## 11. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Provider (OAuth/SAML) callback breakage | Critical | Every PR touching signin runs a mocked provider round-trip test (W2 setup) |
| i18n keys missing → raw `t("xxx")` shown | High | CI check fails build if any key in `en.ts` absent from `zh.ts` (W1) |
| Admins accustomed to old tab layout can't find settings | Medium | Ship 3-min walkthrough video + "What's new" banner in admin on first visit |
| Legacy app relies on specific DOM selectors in login page (e.g. iframe embed with `.login-form` CSS) | Low | W1 audits `Referer` log for embed traffic; notify those tenants before W6 |
| Browser compat: WebAuthn/Face ID varies | Medium | Feature-detect and hide gracefully; never throw |

---

## 12. Out-of-scope explicitly

- Server-sent events / realtime login updates
- Step-up auth (re-auth for sensitive actions) — existing flow kept
- Passwordless magic links — noted as v1.1 candidate
- Device trust / risk scoring — no change
- Admin bulk-import of signup fields — YAGNI
- Mobile native SDKs — this is web only

---

## 13. Rollout

1. W1–W5 work on `feat/auth-ui-revamp` branch
2. W6 merges to `master` in a single PR reviewed by user + codex
3. Deploy to staging; run full E2E suite + manual smoke
4. Production deploy at a low-traffic window; 48h on-call watch
5. Dashboards to monitor: login success rate, signup conversion, provider click-through, error rate, p95 render time

No gradual rollout per-tenant. Full cutover, with `JETAUTH_DISABLE_NEW_AUTH_UI` as the ejection seat.

---

## 14. Open items (NOT blockers)

Captured here so they don't get lost:

- **Dark-mode color derivation**: if admin sets only `ColorPrimary` (light), should dark-mode variant auto-derive (HSL shift) or require explicit `DarkColorPrimary`? → **Decision: auto-derive, with admin override**. Implementation in W1 (B1).
- **Font loading policy**: load Google Fonts on demand vs self-host? → **Decision: self-host the default fonts (Inter + JetBrains Mono) in `web/public/fonts/`; admins referencing Google Fonts by URL load at runtime with `font-display: swap`**.
- **Preview token issuance**: who signs it? → **Decision: existing JWT signing key with a new claim**. Simpler than a dedicated key; the claim scopes the token.

---

## 15. Document conventions

- All dates `YYYY-MM-DD`.
- All file paths absolute from repo root.
- Backend changes prefixed `B<N>`, frontend files listed with full path under `web/src/auth/...`.
- Task IDs in sub-plans follow `W<week>-T<task>` (e.g. `W1-T03`).

---

_End of master spec._
