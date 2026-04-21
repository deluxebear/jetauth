# W2b Signin Alt — Smoke Test Log

**Date:** 2026-04-18
**Branch:** `feat/auth-ui-revamp`
**Tested against commit:** `98674d8e` (WebAuthn tsc fix on top of T09 MethodStep)
**Deployment target:** local Go binary + Vite dev server

---

## Summary

W2b delivered every auth method (Password / Verification code / WebAuthn / Face ID / OAuth providers), a forgot-password flow, and a classic-tabs fallback mode. Programmatic checks all green; the remaining 9-scenario browser checklist is for the operator.

No new bugs surfaced during this smoke round that W2b itself introduced. One pre-existing `tsc -b` type error on WebAuthnForm.tsx was caught and fixed before the smoke — kept in the `98674d8e` commit.

---

## Programmatic checks (all ✅)

### Build
```bash
go build ./...                          # clean
go build -tags embed -o /tmp/smoke .    # clean
cd web && npm run build             # tsc -b ✓ → vite build ✓
```

### Tests
```
Frontend: Test Files  12 passed (12)
           Tests       52 passed (52)
Backend:   go test ./controllers/ ./object/ → all relevant suites pass
i18n parity: 2844 keys across en.ts and zh.ts
```

### Live endpoint verification

```bash
# W2a endpoints still work
curl 'http://localhost:8000/api/get-resolved-theme?organization=jetems'
# → { status: "ok", theme.colorPrimary: "#e11d48" }

curl 'http://localhost:8000/api/get-app-login?organization=jetems'
# → { status: "ok", app: ERP, signinMethodMode: null }

# New W2b: resolve for a jetems user
curl -X POST 'http://localhost:8000/api/resolve-signin-methods' \
  -d '{"application":"ERP","organization":"jetems","identifier":"hack"}'
# → { methods: ["Password"], recommended: "Password", userHint: "" }
```

The identifier-first method filter correctly returns only Password because jetems/ERP has `EnableCodeSignin=false` and `EnableWebAuthn=false` (default). Enabling those in admin → frontend will auto-pick them up.

---

## Manual browser checklist (for the operator)

Start:
```bash
cd /Users/xiongyanlin/projects/jetauth && /tmp/jetauth-bin &    # port 8000
cd web && npm run dev                                         # port 7001
```

Open the appropriate URL per scenario:

| # | URL | Scenario | Expected |
|---|---|---|---|
| 1 | `/login` | Password (built-in admin) | Identifier → PasswordForm → login redirects `/` to admin Dashboard |
| 2 | `/login/jetems` | Password (hack — jetems admin) | Shows jetems branding (rose `#e11d48`) + "jetems" title; hack logs in, lands on org-admin user list |
| 3 | `/login/jetems/ERP` | Forgot password link | Click "Forgot password?" → navigates to `/forget/ERP` with 3-phase reset flow |
| 4 | `/forget/ERP` | Full reset | Identifier → code → new password + confirm → success state with "Back to sign in" link |
| 5 | `/login/jetems/ERP` | Provider buttons | Providers (if configured on ERP) render as branded buttons under the identifier input; clicking redirects to OAuth authorize URL |
| 6 | Any login URL | Theme + language toggle | Top-right sun/moon + globe work; locale persists across refresh |
| 7 | Admin → edit ERP → set `signinMethodMode="classic"` → save → `/login/jetems/ERP` | Classic tabs mode | Shows tabs (Password / Code / WebAuthn / Face per enabled methods) instead of identifier-first |
| 8 | Enable `enableCodeSignin` on an app + set user with email → `/login/org/app` | Code signin | After identifier, MethodStep offers Verification code; can send + verify |
| 9 | Register a WebAuthn credential for a user → sign in with that user | Passkey | Method step offers WebAuthn; browser prompts for passkey; on success reloads `/` |

For scenarios 5-9 the app-level configuration must be set up first. Scenarios 1-4 should work with the built-in seed data.

---

## Issues surfaced and fixed in T10

### Issue 1 (fixed in T09 follow-up): tsc -b failure on WebAuthnForm

**Symptom:** `npm run build` fails with
```
WebAuthnForm.tsx(56): error TS2352: Conversion of type 'Record<string, unknown>' to type 'PublicKeyCredentialRequestOptionsJSON' may be a mistake...
```

**Root cause:** stricter type-check during `tsc -b` (project references mode) flagged a direct cast that `tsc --noEmit` accepted silently. The backend's WebAuthn options JSON is opaque from the frontend's type perspective; the existing cast didn't signal the intent.

**Fix:** Route the cast through `unknown` (`as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"]`). No runtime change; just an explicit "yes I know this is an opaque payload" marker.

**Commit:** `98674d8e`.

**Lesson:** `npx tsc --noEmit` is a weaker gate than `tsc -b`. CI should run the latter. This is a W6 item.

---

## W2b Deliverables (all 10 tasks complete)

| Task | Summary | Commit |
|---|---|---|
| T01 | Preflight — 48 pre-existing tsc errors cleared, husky fix, org-admin landing | `1e14612d` |
| T02 | 13 provider SVG logos + manifest | `5907adee` |
| T03 | ProvidersRow component (4 tests) | `55ccc100` |
| T04 | CodeForm (6 tests) | `cb524a7a` |
| T05 | ForgotPasswordLink + ForgotPasswordPage + /forget routes | `d7742d54` |
| T06 | WebAuthnForm + @simplewebauthn/browser (5 tests) | `57523e61` |
| T07 | FaceForm + getUserMedia (5 tests) | `f6d9f633` |
| T08 | ClassicSigninPage + backend SigninMethodMode (8 tests) | `03b8b966` |
| T09 | MethodStep dispatcher; retires the placeholder branch (4 tests) | `4593ab83` |
| T09 fix | WebAuthn cast via `unknown` for tsc -b | `98674d8e` |
| T10 | This smoke log | this commit |

**Test growth over W2b:** 20 → **52** frontend tests, **12** test files (was 6). All green.

**Dependencies added:** `@simplewebauthn/browser` (~60 KB, tree-shaken from the bundle).

**i18n parity:** 2815 → **2844** keys (29 new keys, all in both `en.ts` and `zh.ts`).

---

## Known Limitations Carried into W3

These were noted but deliberately deferred:
- ClassicSigninPage is ~800 lines due to inlined per-method bodies — W3 will extract shared form bodies into `signin/forms/` modules
- Face ID client-side face detection (via face-api.js) is absent — the backend does the match; client-side detection improves UX but is W6 polish
- `/login/<org>` with no `defaultApplication` picks "first org-owned app" alphabetically — W3's Organization-level SigninMethods may change this heuristic
- OAuth provider buttons use a stock URL pattern (`/api/login/oauth/authorize/<provider>?...`) — we haven't verified every provider type works end-to-end; that's W6 regression coverage

---

_End of W2b smoke log._
