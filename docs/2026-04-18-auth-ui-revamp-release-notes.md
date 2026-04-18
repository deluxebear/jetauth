# Auth UI Revamp — Release Notes

**Date:** 2026-04-18
**Branch:** `feat/auth-ui-revamp`
**Scope:** W1 – W6 foundation/feature work + P0 – P5 redesign mini-phases
**Commits on branch:** 68+
**Frontend tests:** 144 passing (27 test files)

---

## Summary

The JetAuth auth UI revamp replaces the legacy signin/signup pages with a modular
React 19 + Tailwind 4 `AuthShell`, adds an identifier-first signin flow with five
authentication methods, introduces an admin-side live-preview iframe with
drag-sort and a full-featured ColorPicker, and hardens HTML injection via
`bluemonday` (server) + `DOMPurify` (client). Theming is now cascaded
(Application → Organization → Global) and delivered via a single
`/api/get-resolved-theme` endpoint. No breaking changes to existing
`Organization.ThemeData` or `Application` fields — every legacy value is
preserved and read first before the new overrides apply.

---

## What's new for end users (login / signup)

- **Identifier-first signin.** Users enter an email / username / phone, then
  the backend tells the UI which methods the account supports. No more
  guessing "is this a Password account or a code account?".
- **Five signin methods** in one shell:
  - Password (Argon2id-backed, re-shown on failure with helpful hint)
  - Verification code (email or SMS; 6 digits; autofocus + autocomplete
    `one-time-code`)
  - WebAuthn passkeys (`@simplewebauthn/browser`)
  - Face ID (`face-api.js`; feature-flagged per app)
  - OAuth providers (13 pre-shipped provider logos; rendered as a
    `ProvidersRow` under the primary form)
- **Four signup layouts** driven by `Application.formOffset` (1 centered,
  2 right-card, 3 left-card, 4 full-width). Each honors mobile
  breakpoints and can show a `formSideHtml` illustration panel.
- **Multi-step signup** that auto-splits `signupItems` into screens once
  the required-field count exceeds the threshold.
- **Forgot-password flow** at `/forget/:app` — identifier → code → new
  password → confirmation.
- **OrgChoiceWidget** on `/login` (no org in URL) lets the user pick
  an organization when the deployment hosts multiple.
- **Language + theme picker** in the top bar on every auth screen.
- **Cascaded theming.** Application theme overrides Org theme overrides
  Global theme; derived dark colors computed server-side.
- **Signin items** (rememberMe, forgotPassword, signupLink, providers,
  customText, back-button, divider) are now fully configurable per app
  with visibility rules.
- **Accessibility improvements** (W6): every signup field now has
  properly-associated `<label for>` + `id`; identifier and code inputs
  have `aria-label`; password toggle buttons have `aria-label`.

---

## What's new for admins (UI customization tab)

- **Live preview iframe** renders the actual auth UI for the current
  unsaved form state, via postMessage transport (sandbox attr dropped;
  config sent over postMessage instead of URL to avoid HTTP 431).
- **Preview toolbar** toggles mode (signin / signup / forgot), device
  (desktop / mobile 375 px), and theme (light / dark).
- **Fullscreen preview modal** (P3) — zoom the preview to near-fullscreen
  and still interact with config controls.
- **Drag-sort** for `signinMethods`, `signinItems`, and `signupItems`
  tables, powered by `@dnd-kit/*`. Order persists on save.
- **ColorPicker** (P0–P5 era) — curated palette + hex + HSL sliders +
  WCAG AA contrast badge against the current surface.
- **EditableTable** upgraded to extended DataTable with CSS-Grid column
  alignment (fix in commit `328513f3`).
- **Section navigation + 4 cards** (P1): Branding, Layout, Methods,
  Advanced — each with its own anchor and `data-cfg-section` for
  bidirectional preview↔config linking.
- **FloatingSaveBar** (P4) with per-section "Modified" badges, per-section
  Reset, and global Discard-all.
- **Branding card lifted** (P2) so logo / favicon / display-name edits
  show up in the preview within one frame.
- **Bidirectional inspect** (P5): clicking an element inside the preview
  iframe that carries `data-cfg-section` closes the preview modal (if
  open), scrolls the config card into view, and flashes a highlight ring.
- **CodeMirror CSS editor** (`@uiw/react-codemirror` + `lang-css` + one-dark
  theme) for `formCss` / `formCssMobile` / `customCss` fields.
- **HTML injection fields** (`headerHtml`, `footerHtml`, `signinHtml`,
  `signupHtml`, `formSideHtml`) restricted to global-admin roles and
  sanitized on both write and render.

---

## Breaking changes

**None.** This was an explicit design constraint.

- All existing `Organization.ThemeData` fields are preserved.
- All existing `Application` fields (including `formOffset`,
  `formCss`, `formBackgroundUrl`, `signinMethods`, `signinItems`,
  `signupItems`) are preserved.
- New fields are additive only. Legacy single-form templates continue
  to render (ClassicSigninPage is opt-in via
  `Application.SigninMethodMode = "classic"`).

---

## Security improvements

- **HTML sanitization** on user-supplied injection fields:
  - Server: `bluemonday` strict policy applied in
    `UpdateApplication`/`UpdateOrganization` (strips `<script>`,
    `onclick=`, `javascript:` URIs, etc.) before persistence.
  - Client: `DOMPurify` re-sanitizes at render time in `SafeHtml`
    and `SideHtml` components as defense-in-depth.
- **Role-gated injection fields**: `headerHtml`, `footerHtml`,
  `signinHtml`, `signupHtml`, and CSS blocks now require
  `role = global-admin` on write.
- **Casbin rules** added for the two new anonymous auth endpoints
  (`/api/resolve-signin-methods`, `/api/get-resolved-theme`).
- **CSP headers** — deferred. Vite HMR requires broad
  `unsafe-inline`/`unsafe-eval` allowances for the dev experience;
  productionization needs separate tuning.

---

## New backend endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/get-resolved-theme?application=&organization=` | Merge Application + Organization + Global `ThemeData`; return the resolved theme plus derived dark colors + CSS variable map. Anonymous. |
| `POST` | `/api/resolve-signin-methods` | Given `{application, organization, identifier}`, return `{methods, recommended, userHint}` — the set of signin methods valid for this account, the recommended default, and a masked email/phone hint. Anonymous. |

Both endpoints are OpenAPI-annotated and picked up by `swag v2` generation.

---

## Schema additions

### `Organization.ThemeData`

Nine new optional fields (all backward-compatible):

- `surfaceBg` (darkest layer)
- `surfaceCard` (surface-1)
- `surfaceElevated` (surface-2)
- `textPrimary`, `textSecondary`, `textMuted`
- `borderColor`
- `accentHover` (derived if unset)
- `contrastOnAccent` (derived if unset)

### `Application.SignupItem`

New optional fields:

- `helper` — helper text shown below the field when no error is present
- `group` — bucket name for grouping related fields in multi-step signup
- `validationMessage` — custom error message that overrides the default
- `step` — explicit step index for manual multi-step layouts

### `Application.SigninMethodMode`

New string field; values:

- `""` or `"identifier-first"` (default) — new W2 flow
- `"classic"` — legacy tabs-style single form (for LDAP-only or legacy
  deployments)

---

## New dependencies

### npm (web-new/)

| Package | Version | Purpose |
|---|---|---|
| `@dnd-kit/core` | ^6.3.1 | Drag-sort kernel |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable preset for tables |
| `@dnd-kit/utilities` | ^3.2.2 | Transform / CSS helpers |
| `dompurify` | ^3.4.0 | Client-side HTML sanitization |
| `@types/dompurify` | ^3.0.5 | Types for above |
| `@uiw/react-codemirror` | ^4.25.9 | CSS field editor |
| `@codemirror/lang-css` | ^6.3.1 | CSS syntax mode |
| `@codemirror/theme-one-dark` | ^6.1.3 | Dark theme for CodeMirror |
| `face-api.js` | ^0.22.2 | Face ID detection |
| `@simplewebauthn/browser` | ^13.3.0 | WebAuthn passkey flows |
| `libphonenumber-js` | ^1.12.41 | Phone formatting in signup |
| `vitest-axe` (dev) | latest | a11y assertions |
| `axe-core` (dev) | latest | a11y engine |

### Go

| Package | Purpose |
|---|---|
| `github.com/microcosm-cc/bluemonday` | Server-side HTML sanitization |

---

## Known limitations / deferred work

| Item | Status | Notes |
|---|---|---|
| Playwright E2E | Deferred | Adopt in follow-up; requires separate infra (browsers, CI cache, servers). |
| Visual regression | Deferred | Needs Playwright + snapshot storage (e.g., Percy / local). |
| Performance baseline / Lighthouse | Deferred | Needs production build + headless Chrome on CI. |
| CSP headers | Deferred | Vite HMR needs `unsafe-inline`/`unsafe-eval`; productionization requires tuning. |
| Visual HTML block editor | Deferred | Current HTML injection fields are textarea + CodeMirror; a drag-and-drop block editor is out of scope. |
| Audit log | Deferred | Who changed which themeData/signinMethods field — not yet surfaced. |
| Color-contrast a11y check | Deferred | Axe color-contrast rule is suppressed in vitest because happy-dom does not resolve CSS custom properties; real check requires a browser. |

---

## W6 session deliverables (2026-04-18)

- a11y audit via `axe-core` (`web-new/src/__tests__/a11y.test.tsx`): 5 surfaces
  asserted violation-free (SigninPage, ClassicSigninPage, SignupPage,
  ForgotPasswordPage, AdminPreviewPane).
- Real a11y fixes: 7 signup field components now associate their label
  with their input via `useId`; `IdentifierStep` and the
  ForgotPassword code input carry `aria-label`.
- i18n parity: green (2895 keys across `en.ts` / `zh.ts`).
- Release notes (this file).
- Operator smoke checklist (`docs/2026-04-18-auth-ui-revamp-smoke-checklist.md`).

---

_End of release notes._
