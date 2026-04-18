# W2b Signin Alt — Auth UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the signin surface beyond Password: verification code, WebAuthn, Face ID, third-party providers, forgot-password, and a classic-tabs fallback mode. After W2b, every signin method the backend supports has a real UI and a real user can use them.

**Architecture:** Extend the W2a SigninPage state machine with a proper `MethodStep` dispatcher that routes to one of 4 form components based on the resolved method. Add `ProvidersRow` as an always-visible surface that short-circuits the identifier flow. Add a classic-mode toggle (`application.signinMethodMode: "identifier-first" | "classic"`) with `ClassicSigninPage` as the alternative.

**Tech Stack:** + `@simplewebauthn/browser` (new) · + `libphonenumber-js` (new) · existing `face-api.js` (pre-installed)

**Companion docs:** `docs/2026-04-18-auth-ui-revamp-plan.md`, `docs/superpowers/plans/2026-04-18-auth-ui-revamp-w1-foundation.md`, `docs/superpowers/plans/2026-04-18-auth-ui-revamp-w2a-signin-core.md`

---

## Task W2b-T01: Preflight cleanup

Three long-standing debts blocking green CI or polluting the branch. Batch them into one commit so W2b itself is on clean ground.

**Files:**
- Modify: `/Users/xiongyanlin/projects/jetauth/web-new/src/pages/*EditPage.tsx` (remove unused imports surfaced by `tsc -b`)
- Modify: `/Users/xiongyanlin/projects/jetauth/.git/hooks/husky.local.sh` OR `package.json` husky block (fix the `cd web/` warning)
- Modify: `/Users/xiongyanlin/projects/jetauth/web-new/src/App.tsx` (org-admin landing page)

- [ ] **Step 1: Fix pre-existing tsc errors**

Run `cd web-new && npx tsc --noEmit 2>&1 | head -50` and address every error. Prioritized by frequency:

1. Unused `Save` import — many pages: delete the import line.
2. Unused `imgPreview` in UserEditPage.tsx:263 — delete the variable.
3. `ProviderEditPage.tsx` duplicate object keys (lines 294 and 349) — keep the second occurrence, delete the first in each object.
4. `unknown` → `string` casts in UserEditPage.tsx:583 and :1197 — narrow with `String(value ?? "")`.
5. Argument `unknown → ReactNode` in ProviderEditPage.tsx:1768 — wrap with `String(...)`.
6. Any remaining error: fix case-by-case; if in doubt, widen the failing type to `as any` with a short comment noting this is a temporary escape hatch.

Run `npx tsc --noEmit` after each fix; goal: zero errors.

- [ ] **Step 2: Fix husky hook**

```bash
cat /Users/xiongyanlin/projects/jetauth/.git/hooks/husky.local.sh
```

If it contains `cd web/`, change to `cd web-new/`. If the command that follows doesn't exist in web-new, remove the hook's body entirely (or comment it out). Test by staging a trivial change and running `git commit --amend --no-edit` — the warning should be gone.

- [ ] **Step 3: Org-admin landing page**

In `web-new/src/App.tsx`, find the authenticated routing branch (around line 632). Currently it shows `<Dashboard />` for any admin. For org admins (not global admin), redirect to their org's user management page:

```tsx
<Route
  path="/"
  element={
    isGlobalAdmin(user) ? (
      <Dashboard />
    ) : user.IsAdmin ? (
      <Navigate to={`/users?organization=${encodeURIComponent(user.owner)}`} replace />
    ) : (
      <UserHomePage userOrg={user.owner} />
    )
  }
/>
```

Or find where `/users` list page is and route org admins there with the right org filter.

- [ ] **Step 4: Verify + commit**

```bash
cd /Users/xiongyanlin/projects/jetauth
go build ./...
cd web-new && npm run build && cd ..
```

`npm run build` must now complete through `tsc -b && vite build` without tsc failures.

```bash
git add -A  # careful — include only intended files
git commit -m "chore(auth-revamp/W2b): preflight cleanup

- Clears ~12 pre-existing tsc errors in web-new/src/pages/*EditPage.tsx
  so npm run build completes the tsc -b step. These errors existed
  before the auth revamp but blocked CI green.
- Fixes husky pre-commit hook that was cd-ing into the deleted web/
  directory on every commit.
- Routes org-admins to their own user management page on login
  instead of the global admin Dashboard (per user request: '组织管理员
  会返回其有权限的组织管理')."
```

---

## Task W2b-T02: Provider SVG assets + fetch manifest

Drop 12 real provider logos into `web-new/public/providers/` so ProvidersRow (T03) can render them with the URLs the backend already returns. These are the brands the existing `providerLogoMap` references.

**Files:**
- Create: `web-new/public/providers/{github,google,wechat,dingtalk,lark,gitee,gitlab,apple,microsoft,linkedin,saml,oidc,generic}.svg`
- Create: `docs/2026-04-18-provider-logo-manifest.md` (documents source + license for each)

- [ ] **Step 1: Curate SVGs**

For each provider, use the brand's official SVG where available (follow trademark usage guidelines). Preferred sources:

| Provider | Source |
|---|---|
| GitHub | `simple-icons` MIT-licensed |
| Google | `simple-icons` |
| WeChat | `simple-icons` |
| DingTalk | `simple-icons` |
| Lark | `simple-icons` (feishu) |
| Gitee | `simple-icons` |
| GitLab | `simple-icons` |
| Apple | `simple-icons` |
| Microsoft | `simple-icons` |
| LinkedIn | `simple-icons` |
| SAML | custom generic shield — use lucide-react `shield-check` as SVG |
| OIDC | custom generic key — lucide-react `key-round` as SVG |
| generic | lucide-react `plug` as SVG |

All SVGs should be:
- 24×24 viewBox, scalable
- `currentColor` fill (so theme color can paint them)
- Under 2 KB each

- [ ] **Step 2: Document in manifest**

```markdown
# Provider Logo Manifest (web-new/public/providers/)

## Sources
| File | Source | License |
|---|---|---|
| github.svg | simple-icons v17.0.0 | MIT |
| ... |
```

- [ ] **Step 3: Verify paths resolve**

```bash
curl -sI http://localhost:8000/providers/github.svg | head -1
```

Must 200.

- [ ] **Step 4: Commit**

```bash
git add web-new/public/providers/ docs/2026-04-18-provider-logo-manifest.md
git commit -m "assets(auth): 13 provider SVG logos for ProvidersRow

Dropped under web-new/public/providers/ so the backend-returned
logoUrl paths resolve. All icons are 24×24 currentColor SVG so the
theme's --color-primary paints them. License/source tracked in
docs/2026-04-18-provider-logo-manifest.md."
```

---

## Task W2b-T03: ProvidersRow component

Render the providersResolved array as a row of branded buttons that redirect to the OAuth authorize endpoint of the respective provider.

**Files:**
- Create: `web-new/src/auth/signin/ProvidersRow.tsx`
- Create: `web-new/src/auth/__tests__/ProvidersRow.test.tsx`
- Modify: `web-new/src/auth/signin/SigninPage.tsx` (mount ProvidersRow below the divider)
- Modify: `web-new/src/locales/{en,zh}.ts` (3 new keys: divider label, "continue with", more menu label)

- [ ] **Step 1: Add i18n keys**

```
auth.providers.divider         → "Or sign in with" / "或使用以下方式登录"
auth.providers.continueWith    → "Continue with {name}" / "使用 {name} 继续"
auth.providers.moreMenu        → "More options" / "更多选项"
```

Verify parity.

- [ ] **Step 2: Write failing tests**

Test cases:
- Renders one button per provider with correct logo src + displayName
- Button onClick navigates to OAuth URL (we'll use `window.location.assign`)
- When ≥ 4 providers, collapses remaining into a "More" dropdown
- Zero providers → renders nothing

- [ ] **Step 3: Implement**

```typescript
import type { ResolvedProvider, AuthApplication } from "../api/types";
import { useTranslation } from "../../i18n";

interface ProvidersRowProps {
  application: AuthApplication;
  providers: ResolvedProvider[];
  redirectUri?: string;
  state?: string;
}

export default function ProvidersRow({ application, providers, redirectUri, state }: ProvidersRowProps) {
  const { t } = useTranslation();
  if (providers.length === 0) return null;

  const visible = providers.slice(0, 3);
  const overflow = providers.slice(3);

  const buildAuthorizeUrl = (p: ResolvedProvider): string => {
    // Reuse the existing OAuth2 authorize flow; Casdoor exposes /api/login/oauth
    // and /auth/callback for providers — fall through to the same URL shape
    // the legacy Login.tsx used.
    const params = new URLSearchParams({
      client_id: p.clientId,
      response_type: "code",
      redirect_uri: redirectUri ?? `${window.location.origin}/callback`,
      scope: "profile",
      state: state ?? application.name,
    });
    return `/api/login/oauth/authorize/${encodeURIComponent(p.name)}?${params.toString()}`;
  };

  return (
    <>
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-text-muted">{t("auth.providers.divider")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {visible.map((p) => (
          <button
            key={p.name}
            onClick={() => window.location.assign(buildAuthorizeUrl(p))}
            aria-label={t("auth.providers.continueWith").replace("{name}", p.displayName)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-1 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            <img src={p.logoUrl} alt="" className="h-4 w-4" />
            {p.displayName}
          </button>
        ))}
        {overflow.length > 0 && (
          <details className="relative col-span-3 text-[12px]">
            <summary className="cursor-pointer rounded-lg border border-border bg-surface-1 py-2 text-center text-text-secondary hover:bg-surface-2">
              {t("auth.providers.moreMenu")} ({overflow.length})
            </summary>
            <div className="absolute left-0 right-0 mt-1 rounded-lg border border-border bg-surface-1 p-1 shadow-[var(--shadow-elevated)]">
              {overflow.map((p) => (
                <button
                  key={p.name}
                  onClick={() => window.location.assign(buildAuthorizeUrl(p))}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
                >
                  <img src={p.logoUrl} alt="" className="h-4 w-4" />
                  {p.displayName}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Wire into SigninPage**

After the step-1 `<IdentifierStep>`, render `<ProvidersRow application={application} providers={providers} ... />` conditionally when `step === "identifier"` (so providers always show under the identifier input but disappear once you're in password step).

- [ ] **Step 5: Tests pass + build + commit**

---

## Task W2b-T04: CodeForm (verification code)

New method form that sends a 6-digit code to email/phone, then authenticates.

**Files:**
- Create: `web-new/src/auth/signin/CodeForm.tsx`
- Create: `web-new/src/auth/__tests__/CodeForm.test.tsx`
- Modify: `web-new/src/locales/{en,zh}.ts` (~7 keys under `auth.code.*`)

- [ ] **Step 1: i18n keys**

```
auth.code.sendToEmail    → "Send code to {email}" / "发送验证码到 {email}"
auth.code.sendToPhone    → "Send code to {phone}" / "发送验证码到 {phone}"
auth.code.resend         → "Resend ({seconds}s)" / "重新发送 ({seconds}s)"
auth.code.codeLabel      → "Verification code" / "验证码"
auth.code.codePlaceholder → "6-digit code" / "6 位数字"
auth.code.submit         → "Sign in" / "登录"
auth.code.sendError      → "Failed to send code" / "发送验证码失败"
```

- [ ] **Step 2: Tests**

- Renders "Send code" button initially
- On click → calls `/api/send-verification-code` with method = "email" or "phone"
- After send → shows code input + countdown (60s)
- Entering 6-digit code + submit → calls `onSubmit(code)`
- Back button → parent's onBack

- [ ] **Step 3: Implement**

Key logic: props `{ identifier, userHint, destType: "email" | "phone", destValue, onSubmit, onBack }`. Use `api.post("/api/send-verification-code", {...})` with fields matching backend: `organizationId`, `applicationId`, `method: "signup" | "login"`, `dest`, `type`.

The countdown uses `useEffect` + `setTimeout`; prevent resend until 0.

- [ ] **Step 4: Commit**

---

## Task W2b-T05: ForgotPasswordLink + ForgotPasswordPage

Small but critical UX item. Add a "Forgot password?" link on PasswordForm and a standalone page that kicks off the reset flow (email/phone verification → new password).

**Files:**
- Create: `web-new/src/auth/signin/ForgotPasswordPage.tsx`
- Modify: `web-new/src/auth/signin/PasswordForm.tsx` (add the link)
- Modify: `web-new/src/App.tsx` (new route `/forget/:application?`)
- Modify: `web-new/src/locales/{en,zh}.ts` (~6 keys)

- [ ] **Step 1: Add the link in PasswordForm**

Just above the submit button:

```tsx
<div className="text-right">
  <a href={`/forget/${application.name}`} className="text-[12px] text-accent hover:underline">
    {t("auth.password.forgotLink")}
  </a>
</div>
```

- [ ] **Step 2: ForgotPasswordPage — 3 steps**

1. Identifier input (same as IdentifierStep; resolve to find user)
2. Code verification (same UX as CodeForm — reuse the component)
3. New password + confirm — calls `/api/reset-password`

Reuse IdentifierStep and CodeForm; only the final step needs new code.

- [ ] **Step 3: App.tsx route**

```tsx
<Route path="/forget" element={<AuthShell mode="forget" />} />
<Route path="/forget/:applicationName" element={<AuthShell mode="forget" />} />
```

Extend AuthShell's `Mode` type to include `"forget"`.

- [ ] **Step 4: Backend Casbin rule**

`/api/reset-password` must be anonymous-accessible. Add to `authz/authz.go`:

```
p, *, *, POST, /api/reset-password, *, *
```

(If already there — skip.)

- [ ] **Step 5: Commit**

---

## Task W2b-T06: WebAuthnForm

Passkey / platform authenticator signin. Uses `@simplewebauthn/browser`.

**Files:**
- Install: `@simplewebauthn/browser` as dependency
- Create: `web-new/src/auth/signin/WebAuthnForm.tsx`
- Create: `web-new/src/auth/__tests__/WebAuthnForm.test.tsx`
- Modify: `web-new/src/locales/{en,zh}.ts` (~5 keys)

- [ ] **Step 1: Install**

```bash
cd web-new
npm install @simplewebauthn/browser
```

- [ ] **Step 2: i18n keys**

```
auth.webauthn.prompt      → "Use your passkey to sign in" / "使用通行密钥登录"
auth.webauthn.button      → "Sign in with passkey" / "通行密钥登录"
auth.webauthn.failed      → "Passkey sign-in failed" / "通行密钥登录失败"
auth.webauthn.unsupported → "This browser does not support passkeys" / "当前浏览器不支持通行密钥"
auth.webauthn.trying      → "Contacting authenticator..." / "正在连接认证器..."
```

- [ ] **Step 3: Implement**

Pattern (using existing backend `/api/webauthn/signin/begin` + `/api/webauthn/signin/finish`):

```tsx
import { startAuthentication } from "@simplewebauthn/browser";

async function handleAuthenticate() {
  const options = await api.post("/api/webauthn/signin/begin", { username: identifier });
  const assertion = await startAuthentication(options);
  const result = await api.post("/api/webauthn/signin/finish", assertion);
  // handle result like PasswordForm's onSubmit
}
```

Render a single big button that triggers the flow. Show loading spinner during; inline error on fail. Feature-detect `window.PublicKeyCredential` — if missing, show "unsupported" message and auto-call `onBack`.

- [ ] **Step 4: Commit**

---

## Task W2b-T07: FaceForm

Face ID login using the already-installed `face-api.js`. Camera-based; user captures their face; frame is sent to `/api/login` with `signinMethod: "Face ID"`.

**Files:**
- Create: `web-new/src/auth/signin/FaceForm.tsx`
- Create: `web-new/src/auth/__tests__/FaceForm.test.tsx`
- Modify: `web-new/src/locales/{en,zh}.ts` (~7 keys)

- [ ] **Step 1: i18n keys**

```
auth.face.prompt         → "Position your face in the frame" / "请将人脸对准取景框"
auth.face.button         → "Capture & sign in" / "拍照并登录"
auth.face.retry          → "Retry" / "重试"
auth.face.cameraError    → "Unable to access camera" / "无法访问摄像头"
auth.face.noFace         → "No face detected; try again" / "未检测到人脸，请重试"
auth.face.failed         → "Face recognition failed" / "人脸识别失败"
auth.face.processing     → "Processing..." / "处理中..."
```

- [ ] **Step 2: Component**

1. `getUserMedia({ video: true })` → live preview `<video>`
2. Draw face-api.js bounding box as visual feedback
3. On capture → canvas.toDataURL → base64 frame
4. POST to `/api/login` with `signinMethod: "Face ID"`, `faceIdImage: <base64>`, `organization`, `application`, `username: identifier`
5. On success: full page reload to `/` (same pattern as PasswordForm)

Must request camera permission gracefully; show cameraError when denied.

- [ ] **Step 3: Tests**

Since `getUserMedia` requires a real browser, tests mock `navigator.mediaDevices`. Cover: permission denied, no-face, happy path (mock face-api.js).

- [ ] **Step 4: Commit**

---

## Task W2b-T08: ClassicSigninPage fallback

Alternative mode for admins who want the legacy tabs-style login (Password / Code / WebAuthn tabs side-by-side instead of identifier-first). Flag: `application.signinMethodMode` (new backend field; default `"identifier-first"`).

**Files:**
- Backend: add `SigninMethodMode string` to Application struct (additive, default `""` means `"identifier-first"`)
- Create: `web-new/src/auth/signin/ClassicSigninPage.tsx`
- Modify: `web-new/src/auth/AuthShell.tsx` (if mode set to classic, render ClassicSigninPage)
- Modify: `web-new/src/locales/{en,zh}.ts` (tab labels reuse existing keys)

- [ ] **Step 1: Backend field**

In `object/application.go`:

```go
SigninMethodMode string `xorm:"varchar(30)" json:"signinMethodMode,omitempty"`
```

Add a Go unit test ensuring zero-value serializes absent (omitempty).

- [ ] **Step 2: ClassicSigninPage**

Side-by-side tabs: Password | Code | WebAuthn | Face (shown only for enabled methods). Each tab renders the same PasswordForm / CodeForm / WebAuthnForm / FaceForm as identifier-first — the only difference is UX: user picks method first, THEN enters identifier. The `IdentifierStep` morphs into a username input bundled into each form.

- [ ] **Step 3: AuthShell route**

```tsx
if (mode === "signin") {
  if (app.signinMethodMode === "classic") {
    return <ClassicSigninPage application={app} providers={providers} />;
  }
  return <SigninPage application={app} providers={providers} />;
}
```

- [ ] **Step 4: Commit**

---

## Task W2b-T09: MethodStep dispatcher + SigninPage integration

Finalize SigninPage so `selectedMethod !== "Password"` no longer shows a placeholder. MethodStep dispatches to the right form per recommended method (with a "try a different method" dropdown to switch).

**Files:**
- Create: `web-new/src/auth/signin/MethodStep.tsx`
- Modify: `web-new/src/auth/signin/SigninPage.tsx` (replace the placeholder branch)

- [ ] **Step 1: MethodStep**

Props: `{ identifier, userHint, methods, recommended, onSubmit, onBack, application }`. State: `active = recommended || methods[0].name`. Renders:

- Top: user hint + "Change method" dropdown showing methods.length > 1 options
- Body: `switch (active)` → PasswordForm / CodeForm / WebAuthnForm / FaceForm

Each form's `onSubmit` delegates back to SigninPage's single `handleMethodSubmit` with `{ method, payload }` shape.

- [ ] **Step 2: SigninPage refactor**

Replace the three conditional branches (Password / placeholder / back-link) with:

```tsx
{step === "method" && (
  <MethodStep
    identifier={identifier}
    userHint={userHint}
    methods={methods}
    recommended={recommended}
    application={application}
    onBack={handleBack}
    onSubmit={handleMethodSubmit}
  />
)}
```

`handleMethodSubmit(method, payload)` constructs the right POST /api/login body per method and delegates.

- [ ] **Step 3: Commit**

---

## Task W2b-T10: E2E smoke + log

Same template as W2a-T10. Verify all paths work:

| URL | Method | Expectation |
|---|---|---|
| `/login` | Password | admin can log in |
| `/login/jetems` | Password | hack lands on org admin page |
| `/login/jetems` | Verification code | hack gets code to email, logs in |
| `/login/jetems/ERP` | Provider (GitHub) | Clicking GitHub button redirects to GitHub OAuth |
| `/login/jetems` | Passkey | If registered, passkey works |
| `/forget/app-built-in` | Reset flow | End-to-end password reset |
| `/login/<app-with-classic-mode>` | Classic tabs | Shows tabs, not identifier-first |

Write `docs/2026-04-18-w2b-smoke-log.md`. Commit.

---

## Wrap-up

After W2b:
- Every backend-supported signin method has a working UI
- ProvidersRow replaces the W1 placeholder dummy buttons
- Forgot-password flow works
- Classic mode available as a per-app option
- ~30+ new frontend tests, all green
- Pre-existing tsc errors cleared; CI green-on-branch

**W2b demo:** hack logs into jetems via password; a user with Passkey registered logs in with Face ID/WebAuthn on first visit; a second user clicks "Sign in with GitHub" and OAuths in; a third clicks "Forgot password" and resets via email code.
