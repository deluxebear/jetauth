# W2a Signin Core — Smoke Test Log

**Date:** 2026-04-18
**Branch:** `feat/auth-ui-revamp`
**Tested against HEAD of W2a (before authz patch):** `c83c4793`
**Authz patch:** this commit
**Deployment target:** local Go binary + Vite dev server

---

## Summary

End-to-end verification that the identifier-first signin flow actually works through the new stack. Programmatic checks ran on the backend; manual browser checks are called out separately.

All programmatic checks pass. One issue was surfaced and fixed as part of this task: the two new anonymous endpoints (`/api/get-resolved-theme`, `/api/resolve-signin-methods`) were not in the Casbin anonymous allowlist and returned "Unauthorized operation" until two rules were added to `authz/authz.go`. Without this fix the new login page would fail at the first fetch.

---

## Programmatic checks (all ✅)

### 1. Go build + embed build

```bash
go build ./...           # ✅ clean
go build -tags embed -o /tmp/w2a-smoke .   # ✅ clean
```

### 2. Go unit tests — auth-surface packages

```
ok  github.com/deluxebear/jetauth/controllers   1.520s
```

Pre-existing `TestGetUsers` in `object/` fails (DB-dependent, unchanged since before the branch started — see W1 smoke log). Not in scope for W2a.

### 3. Frontend unit tests

```
Test Files  6 passed (6)
     Tests  20 passed (20)
  Duration  543ms
```

Breakdown: ThemeProvider (3) · BrandingLayer (3) · TopBar (2) · IdentifierStep (4) · PasswordForm (6) · SigninPage (2).

### 4. i18n parity

```
✓ i18n parity: 2815 keys across en and zh
```

13 new keys added across W2a (identifier.*, password.*, signin.*).

### 5. Live backend endpoint verification

With the Casbin policy patch applied:

**`GET /api/get-resolved-theme?app=admin/app-built-in`**

```json
{ "status": "ok", "hasCSS": true, "color": "#2563EB" }
```

CSS variable block generated correctly from the system default theme (merged through the empty org+app cascade).

**`POST /api/resolve-signin-methods` — unknown identifier**

```json
{ "status": "ok", "methods": 1, "recommended": "Password" }
```

Privacy-preserving: returns Password even when the identifier doesn't exist, preventing existence probing.

**`POST /api/resolve-signin-methods` — known user `admin`**

```json
{
  "status": "ok",
  "methods": 1,
  "recommended": "Password",
  "userHint": "a***@example.com"
}
```

Masked email hint surfaces correctly. Method list shows Password only because the built-in app has `EnableCodeSignin=false` and `EnableWebAuthn=false` — correct behavior; the filter drops disabled methods.

---

## Manual browser checks (for the operator)

Run:

```bash
# Terminal 1
cd /Users/xiongyanlin/projects/jetauth
go run .

# Terminal 2
cd web-new
npm run dev
```

Open the Vite URL (likely `http://localhost:5173/login`) and verify:

| # | Scenario | Expected |
|---|---|---|
| 1 | `/login` loads | Branding + empty identifier input + "Continue" (disabled) |
| 2 | Type `admin` → Continue | Advances to PasswordForm with "a***@example.com" hint |
| 3 | Back button | Returns to identifier step (input preserved) |
| 4 | Correct password → Sign in | Redirects to `/` or `redirect_uri?code=...` |
| 5 | Wrong password | Error surface shows backend message, stays on PasswordForm |
| 6 | Nonexistent user + any password | Same generic error (no existence leak) |
| 7 | Theme toggle (top-right) | Light/dark switch persists |
| 8 | Language picker (top-right) | `en` / `zh` swap; text updates on every label |
| 9 | Admin → Application → `app-built-in` → change `themeData.colorPrimary` to `#FF0055` → Save → refresh `/login` | Continue / Sign in buttons recolor to hot pink |

---

## Issues surfaced and fixed in T10

### Issue 1 (fixed): Casbin policy blocked the two new endpoints

**Symptom:** `/api/get-resolved-theme` and `/api/resolve-signin-methods` returned `{"status":"error","msg":"Unauthorized operation"}` for anonymous callers.

**Root cause:** The Casbin policy in `authz/authz.go` explicitly whitelists anonymous GET paths (`/api/get-app-login`, `/api/get-account`, etc.) — there is no "fall through to allow" default. The two new endpoints weren't added to the list during T02 and T08.

**Fix:** Added these two rules alongside `/api/get-app-login`:

```
p, *, *, GET, /api/get-resolved-theme, *, *
p, *, *, POST, /api/resolve-signin-methods, *, *
```

**Lesson for W2b / W3:** when adding any new endpoint intended for anonymous pre-auth use (e.g. `/api/resolve-signup-schema`, `/api/webauthn/begin-login`), add the corresponding Casbin rule in the same commit. Add a preflight check to the W2b plan.

### Issue 2 (pre-existing, not W2a's concern): `npm run build` fails at `tsc -b`

Several pre-existing `*EditPage.tsx` files in `web-new/src/pages/` have unused-import and type errors that predate the auth revamp branch. These prevent the `tsc -b && vite build` chain from completing. Vite itself bundles fine when run directly. W2a does not introduce any new tsc errors — `npx tsc --noEmit 2>&1 | grep "src/auth/"` returns empty.

**Action:** not fixed in W2a; flagged as follow-up. Recommendation: schedule a dedicated cleanup task (likely ½ day) to clear the pre-existing pages errors before W6 merge, so CI can return to green-on-master.

### Issue 3 (minor, deferred): husky pre-commit hook references `web/`

Every commit on the branch shows a warning `cd: web/: No such file or directory` from a pre-commit hook. The hook survives the deleted `web/` module but has nothing to do now. Needs updating to reference `web-new/` or removal. Tracked for W2b preflight.

---

## Definition of Done — W2a

- ✅ `POST /api/resolve-signin-methods` backend: filters by app config + user prerequisites, privacy-preserving for unknown identifiers
- ✅ Frontend `auth/` module extended: types, fetcher, 4 new components (BrandingLayer, TopBar, IdentifierStep, PasswordForm), 1 orchestrator (SigninPage)
- ✅ `AuthShell` routes `mode=signin` to the new `SigninPage`; `mode=signup` still W1 placeholder (W3 replaces)
- ✅ 6 new test files, 20 tests all passing
- ✅ 13 new i18n keys in both `en.ts` and `zh.ts`; parity gate passes
- ✅ Live endpoint smoke (theme + resolve + get-app-login) confirmed via curl
- ⏭ Manual browser smoke: remaining 9-scenario checklist above — to be run by the operator before W2b starts

---

_End of W2a smoke log._
