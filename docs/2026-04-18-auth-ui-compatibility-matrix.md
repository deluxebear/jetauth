# Auth UI Revamp — Compatibility Matrix

**Companion to:** `docs/2026-04-18-auth-ui-revamp-plan.md`
**Generated:** 2026-04-18
**Purpose:** Inventory every backend field and frontend integration point the revamp depends on, so we know exactly what breaks / stays / migrates.

---

## 1. Application struct — UI customization fields

**File:** `object/application.go:76–169`

### Top-level fields consumed by auth UI

| Field | Line | Type | Tag | Current new-FE status | Revamp action |
|---|---|---|---|---|---|
| `Logo` | 85 | string | varchar(200) | consumed (branding) | keep |
| `Title` | 86 | string | varchar(100) | **not consumed** | W2 — page title |
| `Favicon` | 87 | string | varchar(200) | consumed | keep |
| `HomepageUrl` | 89 | string | varchar(100) | not consumed | W2 — post-login redirect |
| `HeaderHtml` | 94 | string | mediumtext | **not consumed** | W5 — DOMPurify + render |
| `EnablePassword` | 95 | bool | — | not consumed (always shown) | W2 — hide Password method |
| `EnableSignUp` | 96 | bool | — | not consumed | W3 — hide signup link |
| `EnableGuestSignin` | 97 | bool | — | not consumed | W2 — guest entry button |
| `DisableSignin` | 98 | bool | — | **not consumed (critical)** | W2 — block all signin |
| `EnableAutoSignin` | 100 | bool | — | not consumed | W2 — skip form if session exists |
| `EnableCodeSignin` | 101 | bool | — | not consumed | W2 — verification code method |
| `EnableWebAuthn` | 109 | bool | — | not consumed | W2 — WebAuthn method |
| `OrgChoiceMode` | 111 | string | — | **not consumed** | W3 — None/Select/Input selector |
| `Providers` | 113 | `[]*ProviderItem` | mediumtext | ❌ UI hardcodes GitHub/Google/SAML | W2 — render from data |
| `SigninMethods` | 114 | `[]*SigninMethod` | varchar(2000) | **not consumed** | W2 — method orchestrator |
| `SignupItems` | 115 | `[]*SignupItem` | varchar(3000) | ❌ declared, never rendered | W3 — dynamic form |
| `SigninItems` | 116 | `[]*SigninItem` | mediumtext | **not consumed** | W3 — slot renderer |
| `SignupHtml` | 144 | string | mediumtext | not consumed | W5 — sanitized render |
| `SigninHtml` | 145 | string | mediumtext | not consumed | W5 — sanitized render |
| `ThemeData` | 146 | `*ThemeData` | json | partial (org fallback only) | W1 — ResolvedTheme merge |
| `FooterHtml` | 147 | string | mediumtext | not consumed | W5 — sanitized render |
| `FormCss` | 148 | string | text | not consumed | W3 — inline style |
| `FormCssMobile` | 149 | string | text | not consumed | W3 — media query |
| `FormOffset` | 150 | int | — | **not consumed** | W3 — layout router (1\|2\|3\|4) |
| `FormSideHtml` | 151 | string | mediumtext | not consumed | W3 — FormOffset=4 sidepanel |
| `FormBackgroundUrl` | 152 | string | varchar(200) | not consumed | W3 — BackgroundLayer |
| `FormBackgroundUrlMobile` | 153 | string | varchar(200) | not consumed | W3 — mobile media query |

### Nested types

**`SigninMethod`** (line 26) — Name, DisplayName, Rule. No changes needed in W1.

**`SignupItem`** (line 32) — Name, Visible, Required, Prompted, Type, CustomCss, Label, Placeholder, Options, Regex, Rule. **W3 extension** (backend B5): add `Helper`, `Group`, `ValidationMessage` (map\[string\]string), `Step` (int).

**`SigninItem`** (line 46) — Name, Visible, Label, CustomCss, Placeholder, Rule, IsCustom. No changes needed.

**`ProviderItem`** (`object/provider_item.go:17`) — Owner, Name, CanSignUp, CanSignIn, CanUnlink, BindingRule, CountryCodes, Prompted, SignupGroup, Rule, Provider (full `Provider` embedded). No changes needed; B3 extends the login response to pre-resolve provider logo URLs.

---

## 2. Organization struct

**File:** `object/organization.go:51–`

Fields the auth UI consumes directly from Organization (as fallback or standalone):

| Field | Line | Notes |
|---|---|---|
| `DisplayName` | 56 | page title fallback |
| `Logo` | 58 | branding fallback |
| `LogoDark` | 59 | dark-mode logo |
| `Favicon` | 60 | favicon |
| `PasswordOptions` | 64 | password strength rules |
| `CountryCodes` | 68 | phone country picker |
| `Languages` | 74 | locale options |
| `ThemeData` | 75 | fallback theme |

**W3 addition (B7):** add `SigninMethods`, `SignupItems` to Organization with same types and same merge semantics.

---

## 3. ThemeData struct

**File:** `object/organization.go:38–44`

Current (5 fields):
```go
type ThemeData struct {
    ThemeType    string  // "default"|"dark"|custom
    ColorPrimary string  // hex
    BorderRadius int
    IsCompact    bool
    IsEnabled    bool
}
```

**W1 extension (B1):** add 9 optional fields — all nullable, zero-value means "inherit":
- `ColorCTA`, `ColorSuccess`, `ColorDanger`, `ColorWarning` (string hex)
- `DarkColorPrimary`, `DarkBackground` (string hex)
- `FontFamily`, `FontFamilyMono` (string)
- `SpacingScale` (float64; 0.0 = inherit)

Zero-value semantics make this **100% backward-compatible** — existing records deserialize with the new fields empty, merge logic treats empty as "fall through to lower layer".

---

## 4. Frontend inventory — what exists vs. what to kill

### Web-new (new frontend) files to **delete**

| File | Lines | Reason |
|---|---|---|
| `web-new/src/pages/Login.tsx` | 305 | Replaced by `auth/signin/SigninPage.tsx` |
| `web-new/src/pages/Signup.tsx` | 644 | Replaced by `auth/signup/SignupPage.tsx` |

### Web-new (new frontend) files that **reference** old Login/Signup

| File | Ref | Action |
|---|---|---|
| `web-new/src/App.tsx:10-11` | imports Login + Signup | Update to import from `auth/` module |

### Web-new files that are **kept and reused**

| File | Role |
|---|---|
| `web-new/src/theme.tsx` | ThemeContext; extend for ResolvedTheme |
| `web-new/src/i18n.tsx` | translation hook; unchanged API |
| `web-new/src/lib/theme-utils.ts` | `deriveThemeVars`; extend for new tokens |
| `web-new/src/components/LoginPreview.tsx` | used in OrganizationEditPage; will be refactored to consume ResolvedTheme |

### Web (legacy) module — **delete entirely in W1**

| Path | Size | Files | Notes |
|---|---|---|---|
| `/web/` | **1.2 GB** (mostly `node_modules/`) | 136,387 files | Legacy Casdoor frontend; zero imports from new code. Kills 116 npm vulnerabilities. |

Before deletion, verify:
- [ ] No CI workflow references `web/` (`.github/workflows/*.yml`)
- [ ] No `go:embed` directive picks up `web/build/**`
- [ ] No nginx config / deploy script serves from `web/build/`
- [ ] No `Dockerfile` COPY from `web/`

---

## 5. Backend handler inventory

**Total references** to `SigninMethod` / `SignupItem` / `SigninItem` / `ThemeData` across backend: **140** (grep count, excluding tests).

### Primary endpoints (auth-UI-related)

| Endpoint | File | Handler | Revamp need |
|---|---|---|---|
| `GET /api/get-application` | `controllers/application.go` | `GetApplication()` | W1 — returns resolved theme (flag: `?withResolvedTheme=true`) |
| `GET /api/get-app-login` | `controllers/auth.go:344` | `GetApplicationLogin()` | **W1 (B3)** — add `providersResolved[]` field |
| `POST /api/login` | `controllers/auth.go` | `Login()` | W2 — new `method` param |
| `POST /api/signup` | `controllers/auth.go` | `Signup()` | W3 — dynamic field validation |
| `POST /api/send-verification-code` | `controllers/verification.go` | `SendVerificationCode()` | W2 — no change |
| `POST /api/webauthn/…` | `controllers/webauthn.go` | webauthn flow | W2 — reuse as-is |
| `GET /api/get-organizations` | `controllers/organization.go` | — | W3 — for OrgChoiceMode=Select |

### New endpoints (to be added)

| Endpoint | Week | Purpose |
|---|---|---|
| `GET /api/get-resolved-theme` | W1 (B2) | Return merged theme + CSS-var string |
| `POST /api/resolve-signin-methods` | W2 (B6) | Identifier-first: identifier → allowed methods |
| `POST /api/validate-html` | W5 (B8) | Server-side HTML sanitization preview |

---

## 6. Data migration

**Good news:** nothing required. All backend changes are additive (new columns with nullable types + zero-value defaults). Existing rows auto-read with new fields empty; merge logic treats empty as "inherit", which behaves identically to pre-revamp.

**Only exception:** the hard-coded default `FormOffset = 2` in `web-new/src/backend/ApplicationBackend.ts:227` — that's a **frontend** default, not a DB value. Preserves correctly because empty DB → zero value → frontend maps `0` to centered (`formOffset=2` equivalent) in the new layout router. We'll special-case `0 → 2` in the `AuthShell` to avoid touching existing records.

---

## 7. Runtime dependencies to add

| Dep | Where | Why | Phase |
|---|---|---|---|
| `isomorphic-dompurify` | web-new | Client-side HTML sanitization | W5 |
| `@dnd-kit/core` + `@dnd-kit/sortable` | web-new | Drag-sort in admin UI | W4 |
| `@simplewebauthn/browser` | web-new | WebAuthn client | W2 |
| `libphonenumber-js` | web-new | Phone number formatting + validation | W3 |
| `bluemonday` (Go) | backend | Server-side HTML sanitization | W5 |

All pinned to specific versions in the W1 plan.

---

## 8. Routes — current vs. post-revamp

| Path | Current | Post-revamp |
|---|---|---|
| `/login` | `pages/Login.tsx` | `auth/signin/SigninPage.tsx` |
| `/login/:org` | same | same (org-scoped) |
| `/login/:org/:app` | same | same (app-scoped) |
| `/signup/:app` | `pages/Signup.tsx` | `auth/signup/SignupPage.tsx` |
| `/forget/:app` | **doesn't exist** | W2 — new page `auth/signin/ForgotPasswordPage.tsx` |
| `/callback` | `pages/Callback.tsx` (exists?) | kept, consumes ResolvedTheme |

---

## 9. i18n key coverage

Current `web-new/src/locales/` has `en.ts` (1166 keys) and `zh.ts` (1161 keys).

**Discrepancy:** 5 keys present in `en.ts` but missing from `zh.ts` — must be fixed in W1 as a precondition. This is also when we add all new auth-related keys (~80 keys total estimated).

**CI gate to add in W1:** `web-new/scripts/check-i18n.ts` — fails build if any key in `en.ts` absent from `zh.ts`.

---

## 10. Summary — green/yellow/red

| Area | Health | Notes |
|---|---|---|
| Backend data model | 🟢 Green | Schema supports 90% of target; additive changes only |
| Backend endpoints | 🟡 Yellow | 3 new endpoints needed; existing ones extended |
| Old web/ module | 🟢 Green to delete | No cross-dependencies; 1.2 GB recaptured |
| Web-new Login/Signup | 🔴 Red | Complete rewrite; 2 files deleted |
| Admin UI | 🟡 Yellow | ApplicationEditPage 界面定制 tab stays but adds live preview |
| i18n | 🟡 Yellow | 5-key gap + ~80 new keys to add |
| Tests | 🔴 Red | Zero auth-UI tests exist; full suite built fresh in W6 |

---

_End of compatibility matrix._
