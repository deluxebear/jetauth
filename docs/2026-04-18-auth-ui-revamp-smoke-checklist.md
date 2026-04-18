# Auth UI Revamp — Operator Smoke Checklist

**Date:** 2026-04-18
**Branch:** `feat/auth-ui-revamp`
**Target duration:** ~30 minutes
**Prereq:** Backend on `:8000`, Vite on `:7001`. At least one org
(`admin` + a second `acme`), each with one application.

Tick each box as you verify. If a step fails, stop and file a bug
against `feat/auth-ui-revamp`.

---

## 1. Signin entry-point routing

- [ ] **1.1** Visit `/login` — OrgChoiceWidget shows (or single-org deployment auto-redirects).
- [ ] **1.2** Visit `/login/admin` — resolves to org `admin`'s default application; branding shows the org logo + display name.
- [ ] **1.3** Visit `/login/admin/app-built-in` (or your chosen app slug) — opens that specific application's signin page.
- [ ] **1.4** Visit `/login/does-not-exist` — graceful error (not a 500).

## 2. Password signin

- [ ] **2.1** Enter a known email → click Continue → Password step appears.
- [ ] **2.2** Enter the correct password → redirected home / to `redirect_uri`.
- [ ] **2.3** Repeat with a wrong password → error banner shows, identifier is preserved, you can re-type.
- [ ] **2.4** From the password step, click Back — returns to identifier step.

## 3. Verification-code signin

- [ ] **3.1** Enable "Verification code" in the app's signin methods (admin UI) if not already.
- [ ] **3.2** Enter the same identifier → at the method step, pick "Verification code".
- [ ] **3.3** Check the email/SMS inbox for the 6-digit code.
- [ ] **3.4** Type the code → signs in.

## 4. WebAuthn passkey (optional — needs a registered authenticator)

- [ ] **4.1** With a user that has an enrolled WebAuthn credential, go through identifier → method → WebAuthn.
- [ ] **4.2** Browser platform authenticator prompt fires → approve.
- [ ] **4.3** Signs in.
- [ ] **4.4** (Enrollment path) In the signed-in user profile, add a new WebAuthn credential; log out; log back in using that credential.

## 5. Forgot-password flow

- [ ] **5.1** On the signin page, click "Forgot password" (must be enabled in `signinItems`).
- [ ] **5.2** At `/forget/:app`, enter the identifier → see "code sent to a***@example.com" confirmation; a code is delivered.
- [ ] **5.3** Type the code → advances to new-password step.
- [ ] **5.4** Type mismatching passwords → mismatch error.
- [ ] **5.5** Type matching new password → success screen with "Back to signin" link.
- [ ] **5.6** Click the link → returns to `/login/:org/:app` and the new password works.

## 6. Signup flow

- [ ] **6.1** On the signin page, click the signup link (must be enabled).
- [ ] **6.2** Fill required fields → agreement checkbox → Submit → success.
- [ ] **6.3** Try submitting with an empty required field — inline error appears, submit blocked.
- [ ] **6.4** For an app with ≥7 required items, verify the form splits into 2+ steps with Next / Back buttons and a step indicator.

## 7. Layout variants (formOffset 1 / 2 / 3 / 4)

For each, change `Application.formOffset` in the admin UI → save → reload `/login/:org/:app`:

- [ ] **7.1** `formOffset = 1` — form centered.
- [ ] **7.2** `formOffset = 2` — form on the right, background / side panel on the left.
- [ ] **7.3** `formOffset = 3` — form on the left, background / side panel on the right.
- [ ] **7.4** `formOffset = 4` — full-width form (no side panel).
- [ ] **7.5** At each variant, confirm mobile width (≤640 px) collapses to centered single column.

## 8. Admin: theme color change

- [ ] **8.1** In the UI tab, open the Branding card; change `colorPrimary` via the ColorPicker.
- [ ] **8.2** See it reflected in the live-preview iframe immediately (no save required).
- [ ] **8.3** Save. Open a fresh tab at `/login/:org/:app` — primary color reflects the saved value.

## 9. Admin: drag-sort signin methods

- [ ] **9.1** In the Methods card, drag "Password" below "Verification code".
- [ ] **9.2** Save.
- [ ] **9.3** Reload the preview — the method step lists them in the new order.

## 10. Admin: FloatingSaveBar + per-section modification tracking

- [ ] **10.1** Edit a value in the Branding card — floating save bar slides up from the bottom.
- [ ] **10.2** Branding card shows a "Modified" badge.
- [ ] **10.3** Also edit something in the Layout card — that card also gets the badge.
- [ ] **10.4** Click Reset on the Branding card only — Branding reverts; Layout still modified.
- [ ] **10.5** Click "Discard all" on the save bar — both cards revert; save bar disappears.
- [ ] **10.6** Edit again → Save → save bar disappears; all badges cleared.

## 11. Admin: live preview modal + bidirectional inspect

- [ ] **11.1** With unsaved changes, click the "Expand" / fullscreen preview button.
- [ ] **11.2** Preview modal opens at ~95 % viewport; unsaved state is visible.
- [ ] **11.3** Toggle device Desktop ↔ Mobile — iframe resizes to 375 px on mobile with a rounded bezel.
- [ ] **11.4** Toggle mode Signin ↔ Signup ↔ Forgot — iframe navigates.
- [ ] **11.5** Toggle theme Light ↔ Dark.
- [ ] **11.6** **Click the logo inside the preview iframe.** The modal closes, the Branding card scrolls into view, and it flashes a highlight ring. (Requires the element to have `data-cfg-section="branding"`.)

## 12. Admin: HTML sanitization

- [ ] **12.1** As a global-admin, in the `headerHtml` field, paste `<script>alert(1)</script><p>hello</p>`.
- [ ] **12.2** Save. No alert fires on save.
- [ ] **12.3** Reload the page and re-open the app. The persisted value has the `<script>` stripped (server-side bluemonday).
- [ ] **12.4** In the live preview, the `<p>hello</p>` renders; no alert fires (client-side DOMPurify double-strip).
- [ ] **12.5** As a **non**-global-admin role, confirm the HTML fields are read-only / hidden.

## 13. Admin: CodeMirror CSS editor

- [ ] **13.1** Open the `formCss` field — CodeMirror loads with one-dark theme + CSS syntax highlighting.
- [ ] **13.2** Type `body { background: red }` → preview iframe shows red background.
- [ ] **13.3** Click elsewhere; the save bar appears.

## 14. i18n toggle

- [ ] **14.1** On the login page, switch language from the TopBar picker EN → ZH. All text translates; form layout is stable.
- [ ] **14.2** Switch back ZH → EN.
- [ ] **14.3** In the admin UI, repeat — section headings, buttons, and form labels all translate.

## 15. Dark mode

- [ ] **15.1** Toggle theme from TopBar on the login page — colors invert; contrast remains readable.
- [ ] **15.2** In the admin preview, toggle `Theme: Dark` — iframe reloads in dark mode.

## 16. ClassicSigninPage (opt-in)

- [ ] **16.1** In admin, set `Application.SigninMethodMode = "classic"`; save.
- [ ] **16.2** Visit `/login/:org/:app` — see tabs (Password / Code / WebAuthn / Face ID) with a single form.
- [ ] **16.3** Each tab works.
- [ ] **16.4** Revert to `identifier-first` when done.

---

## Smoke completion

- [ ] All boxes above ticked (or skipped with a documented reason).
- [ ] No console errors on any page.
- [ ] No 500s in the backend log.
- [ ] Save a per-section smoke log following the pattern of `docs/2026-04-18-w4-smoke-log.md` and attach to the PR.

_End of smoke checklist._
