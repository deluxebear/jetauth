# W3 Signup + Layouts — Auth UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the W1 signup placeholder with a fully data-driven `SignupPage` that reads `signupItems` from the Application and renders the right field components. Ship four `formOffset` layouts. Add `signinItems` slot rendering so the login page's Back button / Languages / Captcha / Logo / etc. react to admin config.

**Architecture:** Two parallel tracks — (1) the signup surface (`useSignupSchema` derives runtime shape from backend `signupItems`; `DynamicField` routes to the right input; `SignupPage` orchestrates stepping + submit); (2) the layout system (`AuthShell` dispatches to one of four layout components that wrap its child). Org-level signinMethods/signupItems added as a backend-only merge so apps inherit from org by default.

**Tech Stack:** + `libphonenumber-js` (phone validation)

**Companion docs:** `docs/2026-04-18-auth-ui-revamp-plan.md`, `docs/2026-04-18-auth-ui-revamp-w3-w6-roadmap.md`

---

## Task W3-T01: Extend SignupItem (Backend B5)

Add 5 optional fields to the SignupItem struct so the frontend can render rich validation + grouping.

**Files:**
- Modify: `object/application.go` (SignupItem struct, ~line 32)
- Modify: `object/theme_resolver_test.go` — add backward-compat JSON test

- [ ] Add to `SignupItem`:

```go
type SignupItem struct {
    Name        string   `json:"name"`
    Visible     bool     `json:"visible"`
    Required    bool     `json:"required"`
    Prompted    bool     `json:"prompted"`
    Type        string   `json:"type"`
    CustomCss   string   `json:"customCss"`
    Label       string   `json:"label"`
    Placeholder string   `json:"placeholder"`
    Options     []string `json:"options"`
    Regex       string   `json:"regex"`
    Rule        string   `json:"rule"`

    // W3 additions — all optional, zero-default means "use built-in behavior"
    Helper            string            `json:"helper,omitempty"`
    Group             string            `json:"group,omitempty"`
    ValidationMessage map[string]string `json:"validationMessage,omitempty"`
    Step              int               `json:"step,omitempty"`
}
```

- [ ] Add backward-compat test confirming old JSON (without new fields) still deserializes clean; new fields zero-default.

- [ ] `go build ./...` clean; `go test ./object/` green.

- [ ] Commit:
```
feat(signup): extend SignupItem with helper/group/validationMessage/step

All new fields are optional with omitempty. Old rows deserialize
unchanged. Enables W3 frontend to render helper text, field groups,
multi-language validation messages, and forced step breaks.
```

---

## Task W3-T02: Organization-level SigninMethods + SignupItems (Backend B7)

Add org-level defaults so apps inherit when they leave the field empty.

**Files:**
- Modify: `object/organization.go` — add `SigninMethods []*SigninMethod` and `SignupItems []*SignupItem`
- Create: `object/signin_merge.go` — `MergeOrgAppSigninMethods(org, app)`, `MergeOrgAppSignupItems(org, app)`
- Create: `object/signin_merge_test.go` — cover 4 cases: both empty / only org / only app / both set (app wins)
- Modify: `controllers/resolve_signin.go` + `controllers/application.go` where the effective methods/items are read — use the merge helpers

- [ ] Struct additions:

```go
// in Organization
SigninMethods []*SigninMethod `xorm:"varchar(2000)" json:"signinMethods"`
SignupItems   []*SignupItem   `xorm:"varchar(3000)" json:"signupItems"`
```

- [ ] Merge semantics: app-level non-empty wins over org-level; app with `len() == 0` inherits org. Pointer-comparison not needed — treat empty slice as "not set."

- [ ] Wire into `filterMethodsForUser` (W2a): use `MergeOrgAppSigninMethods(app.OrganizationObj, app)` as the source of truth instead of `app.SigninMethods` directly.

- [ ] Tests green; build clean.

- [ ] Commit:
```
feat(auth): Organization-level SigninMethods + SignupItems inherit

Apps with empty signinMethods/signupItems now inherit from their
organization. MergeOrgAppSigninMethods/MergeOrgAppSignupItems
wrap the lookup; app-level non-empty always wins. Reduces the
pain of configuring 10+ apps in one org.
```

---

## Task W3-T03: useSignupSchema hook + validators

Pure TypeScript — derives runtime form schema from `signupItems[]` including regex validators and step grouping.

**Files:**
- Create: `web-new/src/auth/signup/useSignupSchema.ts`
- Create: `web-new/src/auth/__tests__/useSignupSchema.test.ts`

- [ ] Interface:

```typescript
export interface FieldSchema {
  name: string;
  type: "text" | "email" | "phone" | "password" | "confirm-password"
      | "select" | "checkbox" | "date" | "agreement" | "invitation-code"
      | "providers";
  label: string;
  placeholder: string;
  required: boolean;
  visible: boolean;
  options?: string[];
  regex?: RegExp;
  helperText?: string;
  validationMessage?: { en: string; zh: string };
  group?: string;
  step: number;
}

export interface SignupSchema {
  steps: FieldSchema[][];  // one array of fields per step; length ≥ 1
  hasVisibleStepBreak: boolean;
}

export function buildSignupSchema(
  items: BackendSignupItem[],
  autoSplitThreshold = 6
): SignupSchema;
```

- [ ] Logic:
  1. Filter to `visible`
  2. Map each to FieldSchema — inferring `type` from name (email → email, phone → phone, etc.) unless overridden by backend `type` field
  3. Respect explicit `step` (from backend); if zero, auto-assign based on threshold (required fields accumulate; once count ≥ threshold, start step 2)
  4. Compile regex at schema-build time (cache)

- [ ] Cover ≥ 8 tests: empty items / email-only / auto-split at 6 required / explicit step breaks / regex compilation / invisible filtered / unknown name falls back to text

- [ ] Commit.

---

## Task W3-T04: DynamicField router + 9 field components

Single router + nine thin field components. Each emits `{ value, onChange, error }` pattern; SignupPage collects via a form store.

**Files:**
- Create: `web-new/src/auth/signup/DynamicField.tsx` (router)
- Create: `web-new/src/auth/signup/fields/TextField.tsx`
- Create: `web-new/src/auth/signup/fields/EmailField.tsx`
- Create: `web-new/src/auth/signup/fields/PhoneField.tsx` (uses libphonenumber-js)
- Create: `web-new/src/auth/signup/fields/PasswordField.tsx`
- Create: `web-new/src/auth/signup/fields/ConfirmPasswordField.tsx`
- Create: `web-new/src/auth/signup/fields/SelectField.tsx`
- Create: `web-new/src/auth/signup/fields/CheckboxField.tsx`
- Create: `web-new/src/auth/signup/fields/DateField.tsx`
- Create: `web-new/src/auth/signup/fields/AgreementField.tsx`
- Create: `web-new/src/auth/__tests__/DynamicField.test.tsx` — 6 tests covering the router + each field type's core behavior
- Install: `libphonenumber-js`

- [ ] DynamicField signature:

```typescript
interface DynamicFieldProps {
  schema: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  locale: "en" | "zh";
}
```

Router:

```typescript
switch (schema.type) {
  case "email": return <EmailField ... />;
  case "phone": return <PhoneField ... />;
  case "password": return <PasswordField ... />;
  case "confirm-password": return <ConfirmPasswordField ... />;
  case "select": return <SelectField ... />;
  case "checkbox":
  case "agreement": return <CheckboxField ... />;
  case "date": return <DateField ... />;
  case "invitation-code":
  case "text":
  default: return <TextField ... />;
}
```

- [ ] Each field consumes theme tokens (`--color-primary`, `--accent`) — no hardcoded colors.

- [ ] PhoneField wraps `libphonenumber-js`'s AsYouType formatter and validation.

- [ ] AgreementField renders the label as a link to `application.termsOfUse` when present.

- [ ] Commit.

---

## Task W3-T05: SignupPage orchestrator

Uses the schema + DynamicField to render the full signup flow, including step navigation and final submit.

**Files:**
- Create: `web-new/src/auth/signup/SignupPage.tsx`
- Create: `web-new/src/auth/__tests__/SignupPage.test.tsx`
- Modify: `web-new/src/locales/{en,zh}.ts` — ~8 keys under `auth.signup.*`

- [ ] i18n keys:
```
auth.signup.title          → "Create your account" / "创建账号"
auth.signup.subtitle       → "Takes less than a minute" / "用时不到一分钟"
auth.signup.submitButton   → "Create account" / "创建账号"
auth.signup.stepOf         → "Step {current} of {total}" / "第 {current} 步 / 共 {total} 步"
auth.signup.nextButton     → "Next" / "下一步"
auth.signup.backButton     → "Back" / "上一步"
auth.signup.haveAccount    → "Already have an account?" / "已有账号？"
auth.signup.signinLink     → "Sign in" / "登录"
```

- [ ] Structure:

```typescript
interface SignupPageProps {
  application: AuthApplication;
}

// state:
// - schema = buildSignupSchema(application.signupItems)
// - values: Record<string, unknown>
// - errors: Record<string, string>
// - currentStep: number (0-indexed)

// render:
// - BrandingLayer + TopBar (same as SigninPage)
// - h1 title, subtitle
// - step indicator if schema.steps.length > 1
// - for each field in current step: <DynamicField />
// - bottom: Back (if step > 0) + Next/Submit

// submit:
// POST /api/signup with body matching backend AuthForm:
// { username, password, email, phone, firstName, lastName, ..., application, organization }
// on ok → full-page reload to /
```

- [ ] Validate each step on Next: required check + regex check. Only advance when all current-step fields pass.

- [ ] Cover ≥ 5 tests: renders first-step fields, advances on Next, validation blocks advance, submit posts correct shape, success reloads.

- [ ] Commit.

---

## Task W3-T06: Wire SignupPage into AuthShell

**Files:**
- Modify: `web-new/src/auth/AuthShell.tsx` — replace the `mode === "signup"` placeholder with `<SignupPage application={app} />`

- [ ] Remove the W1 placeholder JSX and its CSS var fallbacks.

- [ ] Verify `npm test`, `npm run build`, manual smoke that `/signup/app-built-in` renders the schema-driven form.

- [ ] Commit.

---

## Task W3-T07: BackgroundLayer component

Renders `formBackgroundUrl` (with mobile variant) behind the auth surface.

**Files:**
- Create: `web-new/src/auth/shell/BackgroundLayer.tsx`
- Create: `web-new/src/auth/__tests__/BackgroundLayer.test.tsx`

- [ ] Props: `{ url?: string; urlMobile?: string; children: ReactNode }`

- [ ] Render a CSS `background-image` wrapper. On desktop breakpoint use `url`; ≤ 768px use `urlMobile` when set, else `url`. Use an `<img>` preloader to avoid flash of unstyled background. On 404 → silent fallback to a gradient.

- [ ] Tests: renders children when no url; uses url when provided; switches to mobile url on narrow viewport (mock matchMedia).

- [ ] Commit.

---

## Task W3-T08: SideHtml component

Renders user-supplied `formSideHtml` in a sanitized iframe-less container for `formOffset=4` layouts.

**Files:**
- Create: `web-new/src/auth/shell/SideHtml.tsx`
- Create: `web-new/src/auth/__tests__/SideHtml.test.tsx`

- [ ] Use `dangerouslySetInnerHTML` with a minimal allowlist scrubber (script / iframe / object stripped). Full DOMPurify integration is W5's job — here we do a quick regex-based scrub (good enough for W3's layout rendering) and leave a TODO(W5) comment.

- [ ] Tests: empty → nothing rendered; script tags are stripped; plain HTML passes through.

- [ ] Commit.

---

## Task W3-T09: Four-layout router (formOffset)

AuthShell wraps its child in one of four layout components based on `application.formOffset`.

**Files:**
- Create: `web-new/src/auth/layouts/LeftForm.tsx` (offset=1)
- Create: `web-new/src/auth/layouts/CenteredCard.tsx` (offset=2, also the default)
- Create: `web-new/src/auth/layouts/RightForm.tsx` (offset=3)
- Create: `web-new/src/auth/layouts/SidePanel.tsx` (offset=4)
- Create: `web-new/src/auth/layouts/LayoutRouter.tsx`
- Modify: `web-new/src/auth/AuthShell.tsx` — wrap inner content with `<LayoutRouter>`

- [ ] LayoutRouter signature:

```typescript
interface LayoutRouterProps {
  application: AuthApplication;
  children: ReactNode; // the auth form surface
}
```

- [ ] LeftForm: 420px form on the left + hero background on the right (uses `formBackgroundUrl`)
- [ ] CenteredCard: `formBackgroundUrl` as full background + centered 400px card
- [ ] RightForm: mirror of LeftForm
- [ ] SidePanel: form on one side + `formSideHtml` (via SideHtml component) on the other

- [ ] Mobile breakpoint (≤ 768px): all four collapse to centered single column. LeftForm/RightForm ignore their branding panel; SidePanel's HTML becomes a collapsible accordion above the form.

- [ ] Tests: each layout renders children; LayoutRouter dispatches based on formOffset value (0/1/2/3/4 + out-of-range fallback to 2).

- [ ] Commit.

---

## Task W3-T10: Mobile viewport polish

Not a new component — an audit + fix pass across the auth module.

**Files:**
- Modify: any existing component that breaks on mobile

- [ ] Use Chrome DevTools mobile emulation (or just shrink the viewport) on:
  - `/login`
  - `/login/jetems`
  - `/login/jetems/ERP`
  - `/signup/app-built-in`
  - `/forget/ERP`
- [ ] Check: buttons stay finger-friendly (≥ 44px height), text readable, no horizontal scroll, top bar controls visible.

- [ ] Fix any issues inline. Document in `docs/2026-04-18-w3-mobile-audit.md` what was found.

- [ ] Commit.

---

## Task W3-T11: SigninItems slot renderer

Maps the app's `signinItems[]` to actual rendered widgets in SigninPage.

**Files:**
- Create: `web-new/src/auth/items/SigninItemsSlotRenderer.tsx`
- Create: `web-new/src/auth/items/slots/{Logo,BackButton,Languages,Captcha,AutoSignin,SelectOrganization,Agreement,CustomText}.tsx`
- Create: `web-new/src/auth/__tests__/SigninItemsSlotRenderer.test.tsx`
- Modify: `web-new/src/auth/signin/SigninPage.tsx` — insert the renderer

- [ ] SlotRenderer looks up each item by name and dispatches to the corresponding slot component. Built-in slots:
  - Logo → BrandingLayer's logo (already rendered; slot toggles visibility)
  - Back button → history-back navigator
  - Languages → TopBar's language picker (already rendered; slot toggles visibility)
  - Captcha → render captcha widget
  - Auto sign in → checkbox in form
  - Select organization → org picker
  - Agreement → hyperlinked terms text
  - Forgot password? → link to /forget
  - Login button → the submit button (visibility toggle)
  - Signup link → link to /signup
  - Signin methods → the method switcher (already handled)
  - Providers → ProvidersRow (already rendered; slot toggles)

- [ ] `isCustom=true` items render as `<CustomText>` with the item's `label` as HTML (sanitized same way as SideHtml).

- [ ] The visibility of existing rendered elements (Logo, Languages, ProvidersRow) becomes a function of whether the slot is in `signinItems` + has `visible=true`. Default: render all (for backward compat).

- [ ] Tests: given signinItems with `Back button: visible: false`, back button doesn't render; given a custom text item with label "Welcome!", the text renders.

- [ ] Commit.

---

## Task W3-T12: orgChoiceMode (None / Select / Input)

Renders an org picker at the top of SigninPage based on `application.orgChoiceMode`.

**Files:**
- Create: `web-new/src/auth/shell/OrgChoiceWidget.tsx`
- Create: `web-new/src/auth/__tests__/OrgChoiceWidget.test.tsx`
- Modify: `web-new/src/auth/signin/SigninPage.tsx` — mount the widget when applicable
- Modify: `web-new/src/locales/{en,zh}.ts` — 4 new keys

- [ ] i18n keys:
```
auth.org.selectLabel   → "Organization" / "组织"
auth.org.selectPrompt  → "Select your organization" / "请选择组织"
auth.org.inputLabel    → "Enter organization name" / "输入组织名称"
auth.org.rememberLabel → "Remember this organization" / "记住此组织"
```

- [ ] Widget variants:
  - **None**: render nothing
  - **Select**: fetch `/api/get-organizations-for-user` (or similar — confirm from backend) and render a `<SimpleSelect>` with the returned list. On change → reload the page with the new URL (`/login/<org>`).
  - **Input**: text input + "Remember" checkbox. On blur → reload to `/login/<text>`. Persist to `localStorage.lastOrgChoice`.

- [ ] Only renders when the URL doesn't already have `/:organizationName` (i.e. bare `/login`).

- [ ] Tests: renders nothing for "None"; renders dropdown for "Select"; renders input for "Input"; clicking remembered value prefills the input.

- [ ] Commit.

---

## Wrap-up

After W3:
- Signup form is fully data-driven. Admin adds/removes fields; users see them.
- Four `formOffset` layouts work on desktop + gracefully degrade on mobile.
- Signin-item slots let admins toggle visibility / swap labels / inject custom text.
- Org-choice widget surfaces at `/login` for apps that support it.
- Backend has Organization-level SigninMethods + SignupItems for better multi-app configurations.

**W3 demo (end-of-week):**
1. Admin edits app-built-in's signupItems → adds a "Employee ID" required field with regex → saves
2. Visitor on `/signup` sees the field, can't submit without a valid employee ID
3. Admin changes formOffset to 1 → login page re-renders with left-form layout on next visit
4. Admin hides the "Back button" signinItem → the back chip disappears from PasswordForm

**Not in W3 (explicit deferrals):**
- Live preview in admin — that's W4
- DOMPurify proper integration — W5; W3 uses a minimal regex scrub with TODO comments
- Form auto-save / draft persistence — TBD, may go into W6 or a post-launch task

**Test growth target:** W3 should roughly double the frontend test count (52 → ~110+).
