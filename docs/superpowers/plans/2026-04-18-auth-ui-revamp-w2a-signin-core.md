# W2a Signin Core — Auth UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the W1 placeholder with a working Identifier-First sign-in flow that actually logs users in via username/email/phone + password. Lays the shell + state-machine foundation that W2b (code / WebAuthn / face / providers / classic fallback) extends.

**Architecture:** Frontend state machine with two steps — `IdentifierStep` collects username/email/phone, calls `POST /api/resolve-signin-methods` to get available methods + user hints, then renders `PasswordForm` (W2a only; W2b adds CodeForm / WebAuthnForm / FaceForm / ProvidersRow). The existing `POST /api/login` handler is reused as-is — frontend constructs the same `AuthForm` the old Login.tsx did, just through a better UX surface.

**Tech Stack:** Go 1.25 / Beego v2 / React 19 / Vite 8 / Vitest / TypeScript / Tailwind 4 / framer-motion / lucide-react

**Companion docs:** `docs/2026-04-18-auth-ui-revamp-plan.md`, `docs/superpowers/plans/2026-04-18-auth-ui-revamp-w1-foundation.md`

---

## Task W2a-T01: Preflight — Apply W1 Final-Review Notes

Clean up the two small items the branch reviewer flagged at end of W1 so W2 builds on a clean base.

**Files:**
- Modify: `/Users/xiongyanlin/projects/jetauth/controllers/auth.go`
- Modify: `/Users/xiongyanlin/projects/jetauth/routers/router.go`

- [ ] **Step 1: Add nil-application guard for the `code` loginType branch of GetApplicationLogin**

In `controllers/auth.go` around line 357-362, the `code` login branch does:

```go
if loginType == "code" {
    msg, application, err = object.CheckOAuthLogin(clientId, responseType, redirectUri, scope, state, c.GetAcceptLanguage())
    if err != nil {
        c.ResponseError(err.Error())
        return
    }
}
```

Then later at ~line 397 the handler does `application = object.GetMaskedApplication(application, "")` and at ~line 408 `Data: *application`. If `CheckOAuthLogin` returns `(nil-application, empty-msg, nil-err)` for some edge case, `*application` panics.

Mirror the guard already present in the `cas` branch (~line 368-372):

```go
if loginType == "code" {
    msg, application, err = object.CheckOAuthLogin(clientId, responseType, redirectUri, scope, state, c.GetAcceptLanguage())
    if err != nil {
        c.ResponseError(err.Error())
        return
    }
    if application == nil {
        c.ResponseError(c.T("auth:Application not found for the given client id"))
        return
    }
}
```

Check whether the i18n key `"auth:Application not found for the given client id"` exists elsewhere in the codebase. If not, fall back to a generic `c.T("auth:The application does not exist")` or equivalent.

- [ ] **Step 2: Add route annotation for the anonymous theme endpoint**

In `routers/router.go`, find the `/api/get-resolved-theme` route registration (added in T08). Add a comment immediately above:

```go
// Anonymous endpoint — pre-auth surface consumed by the login/signup pages.
// Intentionally no auth filter; the merged theme contains no secrets.
web.Router("/api/get-resolved-theme", &controllers.ApiController{}, "GET:GetResolvedTheme")
```

- [ ] **Step 3: Build + existing tests still green**

```bash
cd /Users/xiongyanlin/projects/jetauth
go build ./...
go test ./controllers/ -run "TestBuildCSSVariables|TestResolvedThemeResponse|TestSanitizeApplicationForNonGlobalAdmin" -v
```

Both must pass.

- [ ] **Step 4: Commit**

```bash
git add controllers/auth.go routers/router.go
git commit -m "chore(auth-revamp/W2): preflight — W1 branch review notes

- Adds nil-application guard to the OAuth code loginType branch of
  GetApplicationLogin. The success path dereferences *application
  at line ~408; without the guard an edge case returning (nil,
  \"\", nil) from CheckOAuthLogin would panic.
- Adds intentional-anonymous comment on the /api/get-resolved-theme
  route to prevent future contributors from accidentally adding an
  auth filter to it."
```

---

## Task W2a-T02: Backend — POST /api/resolve-signin-methods (B6)

Add the endpoint that powers the identifier-first UX: frontend sends the user's entered identifier; backend returns the list of signin methods available for that user in that app, plus a recommended method.

**Files:**
- Create: `/Users/xiongyanlin/projects/jetauth/controllers/resolve_signin.go`
- Create: `/Users/xiongyanlin/projects/jetauth/controllers/resolve_signin_test.go`
- Modify: `/Users/xiongyanlin/projects/jetauth/routers/router.go` (register route)

- [ ] **Step 1: Write failing tests**

Create `/Users/xiongyanlin/projects/jetauth/controllers/resolve_signin_test.go`:

```go
package controllers

import (
    "strings"
    "testing"

    "github.com/deluxebear/jetauth/object"
)

func TestFilterMethodsForUser_FiltersByAppConfig(t *testing.T) {
    app := &object.Application{
        EnablePassword:   true,
        EnableCodeSignin: false,
        EnableWebAuthn:   false,
        SigninMethods: []*object.SigninMethod{
            {Name: "Password", DisplayName: "Password", Rule: "All"},
            {Name: "Verification code", DisplayName: "Code", Rule: "All"},
            {Name: "WebAuthn", DisplayName: "WebAuthn", Rule: ""},
        },
    }
    user := &object.User{Password: "hashed"}
    methods := filterMethodsForUser(app, user)

    if !containsMethod(methods, "Password") {
        t.Errorf("Password should be included; got %v", methodNames(methods))
    }
    if containsMethod(methods, "Verification code") {
        t.Errorf("Code should be filtered out when EnableCodeSignin=false")
    }
    if containsMethod(methods, "WebAuthn") {
        t.Errorf("WebAuthn should be filtered out when EnableWebAuthn=false")
    }
}

func TestFilterMethodsForUser_CodeRequiresContactInfo(t *testing.T) {
    app := &object.Application{
        EnableCodeSignin: true,
        SigninMethods: []*object.SigninMethod{
            {Name: "Verification code", DisplayName: "Code", Rule: "All"},
        },
    }
    userNoContact := &object.User{Name: "alice"} // no email, no phone
    userWithEmail := &object.User{Name: "bob", Email: "bob@example.com"}

    methods := filterMethodsForUser(app, userNoContact)
    if containsMethod(methods, "Verification code") {
        t.Errorf("Code should be hidden when user has no email/phone; got %v", methodNames(methods))
    }

    methods = filterMethodsForUser(app, userWithEmail)
    if !containsMethod(methods, "Verification code") {
        t.Errorf("Code should be offered when user has email; got %v", methodNames(methods))
    }
}

func TestFilterMethodsForUser_NilUserReturnsBasicMethodsOnly(t *testing.T) {
    // When user is nil (identifier not found), we only return password-like
    // methods so the login page doesn't leak "user exists" via method list.
    app := &object.Application{
        EnablePassword:   true,
        EnableCodeSignin: true,
        EnableWebAuthn:   true,
        SigninMethods: []*object.SigninMethod{
            {Name: "Password", Rule: "All"},
            {Name: "Verification code", Rule: "All"},
            {Name: "WebAuthn", Rule: ""},
        },
    }
    methods := filterMethodsForUser(app, nil)
    if !containsMethod(methods, "Password") {
        t.Errorf("Password should always be returned for unknown identifier")
    }
    if containsMethod(methods, "WebAuthn") {
        t.Errorf("WebAuthn needs a registered user; should be excluded for nil user")
    }
}

func TestPickRecommendedMethod_PreferWebAuthnThenCodeThenPassword(t *testing.T) {
    tests := []struct {
        methods []SigninMethodInfo
        want    string
    }{
        {[]SigninMethodInfo{{Name: "Password"}}, "Password"},
        {[]SigninMethodInfo{{Name: "Password"}, {Name: "Verification code"}}, "Verification code"},
        {[]SigninMethodInfo{{Name: "Password"}, {Name: "WebAuthn"}}, "WebAuthn"},
        {[]SigninMethodInfo{{Name: "Password"}, {Name: "Verification code"}, {Name: "WebAuthn"}}, "WebAuthn"},
        {[]SigninMethodInfo{}, ""},
    }
    for _, tc := range tests {
        got := pickRecommendedMethod(tc.methods)
        if got != tc.want {
            t.Errorf("pickRecommendedMethod(%v) = %q, want %q", methodNames(tc.methods), got, tc.want)
        }
    }
}

// helpers
func containsMethod(methods []SigninMethodInfo, name string) bool {
    for _, m := range methods {
        if m.Name == name {
            return true
        }
    }
    return false
}
func methodNames(methods []SigninMethodInfo) []string {
    out := make([]string, len(methods))
    for i, m := range methods {
        out[i] = m.Name
    }
    return out
}
var _ = strings.ToLower // keep import if later used
```

- [ ] **Step 2: Run — expect failure (undefined `filterMethodsForUser`, `pickRecommendedMethod`, `SigninMethodInfo`)**

```bash
cd /Users/xiongyanlin/projects/jetauth
go test ./controllers/ -run "TestFilterMethodsForUser|TestPickRecommendedMethod" -v
```

- [ ] **Step 3: Implement the controller**

Create `/Users/xiongyanlin/projects/jetauth/controllers/resolve_signin.go`:

```go
package controllers

import (
    "encoding/json"
    "fmt"

    "github.com/deluxebear/jetauth/object"
)

// SigninMethodInfo is the display-safe info the frontend needs to render a
// signin method button or tab.
type SigninMethodInfo struct {
    Name        string `json:"name"`        // "Password" | "Verification code" | "WebAuthn" | "Face ID" | "LDAP" | "WeChat"
    DisplayName string `json:"displayName"` // human label from application.SigninMethods
    Rule        string `json:"rule"`        // e.g. "All" | "Email only" | "Phone only" | "Non-LDAP"
}

// ResolveSigninRequest is the payload for POST /api/resolve-signin-methods.
type ResolveSigninRequest struct {
    Application string `json:"application"` // "admin/app-foo" or short name "app-foo"
    Organization string `json:"organization"`
    Identifier  string `json:"identifier"` // username, email, or phone
}

// ResolveSigninPayload is the data envelope returned on success.
type ResolveSigninPayload struct {
    Methods     []SigninMethodInfo `json:"methods"`
    Recommended string             `json:"recommended"` // Name of the suggested method, or "" if none
    UserHint    string             `json:"userHint"`    // masked display (e.g. "a***@example.com") or ""
}

// ResolveSigninResponse is the outer envelope.
type ResolveSigninResponse struct {
    Status string               `json:"status" example:"ok"`
    Msg    string               `json:"msg" example:""`
    Data   ResolveSigninPayload `json:"data"`
}

// ResolveSigninMethods returns the list of signin methods enabled for an
// application, filtered by which ones are actually usable for the given
// identifier (e.g. Code requires the user to have an email/phone; WebAuthn
// requires registered credentials).
//
// Deliberately leaks very little: when the identifier doesn't resolve to a
// user we still return the app's basic methods so an attacker can't probe
// for "user exists" via the method list.
//
// @Summary ResolveSigninMethods
// @Tags Login API
// @Description Identifier-first signin: returns available methods for a given identifier in an app.
// @Param body body ResolveSigninRequest true "Request"
// @Success 200 {object} ResolveSigninResponse "The Response object"
// @Router /resolve-signin-methods [post]
func (c *ApiController) ResolveSigninMethods() {
    var req ResolveSigninRequest
    if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
        c.ResponseError(err.Error())
        return
    }
    if req.Application == "" || req.Identifier == "" {
        c.ResponseError("missing application or identifier")
        return
    }

    appID := req.Application
    if len(appID) > 0 && appID[0] != 'a' { // quick heuristic: real ids start with "admin/"
        appID = "admin/" + appID
    }
    app, err := object.GetApplication(appID)
    if err != nil {
        c.ResponseError(err.Error())
        return
    }
    if app == nil {
        c.ResponseError(fmt.Sprintf(c.T("auth:The application: %s does not exist"), appID))
        return
    }

    org := req.Organization
    if org == "" && app.OrganizationObj != nil {
        org = app.OrganizationObj.Name
    }

    user, _ := object.GetUserByFields(org, req.Identifier)

    methods := filterMethodsForUser(app, user)
    payload := ResolveSigninPayload{
        Methods:     methods,
        Recommended: pickRecommendedMethod(methods),
        UserHint:    maskUserHint(user),
    }

    c.Data["json"] = ResolveSigninResponse{
        Status: "ok",
        Data:   payload,
    }
    c.ServeJSON()
}

// filterMethodsForUser intersects the application's declared SigninMethods
// with what's actually enabled app-side AND usable for this user.
func filterMethodsForUser(app *object.Application, user *object.User) []SigninMethodInfo {
    if app == nil {
        return []SigninMethodInfo{}
    }
    out := make([]SigninMethodInfo, 0, len(app.SigninMethods))
    for _, m := range app.SigninMethods {
        if m == nil {
            continue
        }
        if !isMethodEnabledForApp(app, m.Name) {
            continue
        }
        if !isMethodUsableByUser(m.Name, user) {
            continue
        }
        out = append(out, SigninMethodInfo{
            Name:        m.Name,
            DisplayName: m.DisplayName,
            Rule:        m.Rule,
        })
    }
    return out
}

// isMethodEnabledForApp checks the Application-level feature flags.
func isMethodEnabledForApp(app *object.Application, methodName string) bool {
    switch methodName {
    case "Password":
        return app.EnablePassword
    case "Verification code":
        return app.EnableCodeSignin
    case "WebAuthn":
        return app.EnableWebAuthn
    case "Face ID":
        return app.IsFaceIdEnabled()
    case "LDAP":
        // LDAP is enabled when the org has an LDAP config; handled
        // downstream by the login handler, so we expose it as-is.
        return true
    case "WeChat":
        return true
    default:
        // Unknown methods: pass through; the frontend decides what to render.
        return true
    }
}

// isMethodUsableByUser checks per-user prerequisites (e.g. Code needs
// email/phone; WebAuthn needs registered credentials).
func isMethodUsableByUser(methodName string, user *object.User) bool {
    switch methodName {
    case "Verification code":
        if user == nil {
            return false
        }
        return user.Email != "" || user.Phone != ""
    case "WebAuthn":
        if user == nil {
            return false
        }
        return len(user.WebauthnCredentials) > 0
    case "Face ID":
        if user == nil {
            return false
        }
        return len(user.FaceIds) > 0
    default:
        return true
    }
}

// pickRecommendedMethod chooses the best default method for the identifier-
// first UX. Precedence: WebAuthn (frictionless) > Verification code > Password.
func pickRecommendedMethod(methods []SigninMethodInfo) string {
    priority := map[string]int{
        "WebAuthn":          3,
        "Face ID":           2,
        "Verification code": 1,
        "Password":          0,
    }
    bestScore := -1
    bestName := ""
    for _, m := range methods {
        s, ok := priority[m.Name]
        if !ok {
            continue
        }
        if s > bestScore {
            bestScore = s
            bestName = m.Name
        }
    }
    return bestName
}

// maskUserHint produces a privacy-preserving display (e.g. "a***@example.com"
// or "+1-***-***-1234") so the UX can reassure a returning user without
// leaking full PII to an attacker guessing identifiers.
func maskUserHint(user *object.User) string {
    if user == nil {
        return ""
    }
    if user.Email != "" {
        return maskEmail(user.Email)
    }
    if user.Phone != "" {
        return maskPhone(user.Phone)
    }
    return ""
}

func maskEmail(s string) string {
    at := -1
    for i, r := range s {
        if r == '@' {
            at = i
            break
        }
    }
    if at <= 1 {
        return s
    }
    return string(s[0]) + "***" + s[at:]
}

func maskPhone(s string) string {
    if len(s) < 4 {
        return s
    }
    return "***-***-" + s[len(s)-4:]
}
```

- [ ] **Step 4: Register the route**

In `routers/router.go`, find the `/api/get-resolved-theme` line (added in W1-T08) and add immediately below:

```go
// Anonymous endpoint — identifier-first signin UX asks "who are you"
// before "how do you want to log in". Response is scoped to avoid
// leaking existence of a user via method list.
web.Router("/api/resolve-signin-methods", &controllers.ApiController{}, "POST:ResolveSigninMethods")
```

- [ ] **Step 5: Run tests — expect all 4 pass**

```bash
go test ./controllers/ -run "TestFilterMethodsForUser|TestPickRecommendedMethod" -v
go build ./...
```

- [ ] **Step 6: Commit**

```bash
git add controllers/resolve_signin.go controllers/resolve_signin_test.go routers/router.go
git commit -m "feat(api): POST /api/resolve-signin-methods for identifier-first UX

Given an application + identifier (username/email/phone), returns:
- methods: available signin methods (intersection of app feature
  flags, declared SigninMethods, and per-user prerequisites)
- recommended: best default method for the UX
- userHint: masked email/phone for returning-user recognition

Takes care not to leak 'user exists' via method differences — when
the identifier doesn't resolve, basic methods (Password/LDAP) are
still returned so the client can't probe for existence."
```

## Context

**Repo:** `/Users/xiongyanlin/projects/jetauth`
**Branch:** `feat/auth-ui-revamp` — DO NOT switch.

`object.GetUserByFields(organization, identifier)` is already defined and handles username/email/phone lookup. `user.WebauthnCredentials` and `user.FaceIds` are existing slice fields on the User struct.

`Application.IsFaceIdEnabled()` is a method already defined on `*object.Application`. Check `controllers/auth.go:565` usage.

The error path for unknown identifiers deliberately does NOT return an error — it returns a valid response with the app's basic methods. This prevents timing/existence probing. The frontend's UX then proceeds to Password entry, and the actual Login endpoint gives the correct "invalid credentials" message.

---

## Task W2a-T03: Frontend API Types + Fetcher

Add TypeScript types and a fetcher for the new endpoint.

**Files:**
- Modify: `/Users/xiongyanlin/projects/jetauth/web/src/auth/api/types.ts`
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/api/resolveSigninMethods.ts`

- [ ] **Step 1: Extend `types.ts`**

Append to `web/src/auth/api/types.ts`:

```typescript
export interface SigninMethodInfo {
  name: string;        // "Password" | "Verification code" | "WebAuthn" | "Face ID" | "LDAP" | "WeChat"
  displayName: string;
  rule: string;
}

export interface ResolveSigninPayload {
  methods: SigninMethodInfo[];
  recommended: string; // method name, or "" when none
  userHint: string;    // e.g. "a***@example.com" or ""
}

export interface ResolveSigninResponse {
  status: "ok" | "error";
  msg?: string;
  data: ResolveSigninPayload;
}

export interface ResolveSigninRequest {
  application: string;
  organization?: string;
  identifier: string;
}
```

- [ ] **Step 2: Create the fetcher**

Create `/Users/xiongyanlin/projects/jetauth/web/src/auth/api/resolveSigninMethods.ts`:

```typescript
import { api } from "../../api/client";
import type { ResolveSigninRequest, ResolveSigninPayload, ResolveSigninResponse } from "./types";

export async function resolveSigninMethods(
  req: ResolveSigninRequest
): Promise<ResolveSigninPayload> {
  const res = await api.post<ResolveSigninResponse>("/api/resolve-signin-methods", req);
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to resolve signin methods");
  }
  return res.data;
}
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd /Users/xiongyanlin/projects/jetauth/web
npx tsc --noEmit 2>&1 | grep "src/auth/" | head
```

Expected: empty (no new errors in `src/auth/`).

- [ ] **Step 4: Commit**

```bash
cd /Users/xiongyanlin/projects/jetauth
git add web/src/auth/api/
git commit -m "feat(auth): API types + fetcher for POST /api/resolve-signin-methods

Typed wrapper for the identifier-first endpoint. Types mirror the
Go structs from controllers/resolve_signin.go."
```

## Context

The `api` client at `web/src/api/client.ts` provides `api.post<T>(url, body)`. If you're unsure of the exact signature, grep for existing uses (e.g., `pages/Signup.tsx` calls `api.post` already).

---

## Task W2a-T04: BrandingLayer Component

Render the org/app branding (logo + name + favicon + document title). Extracted from the W1 placeholder so it can be reused across SigninPage / SignupPage / layout variants in W3.

**Files:**
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/shell/BrandingLayer.tsx`
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/__tests__/BrandingLayer.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `web/src/auth/__tests__/BrandingLayer.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BrandingLayer from "../shell/BrandingLayer";

describe("BrandingLayer", () => {
  it("renders org logo when provided", () => {
    render(
      <BrandingLayer
        logo="/logo.png"
        logoDark="/logo-dark.png"
        displayName="Acme Corp"
      />
    );
    const img = screen.getByAltText("Acme Corp");
    expect(img.getAttribute("src")).toBe("/logo.png");
  });

  it("falls back to display name when logo absent", () => {
    render(<BrandingLayer displayName="JetAuth" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("JetAuth")).toBeInTheDocument();
  });

  it("applies dark logo when theme is dark", () => {
    render(
      <BrandingLayer
        logo="/logo.png"
        logoDark="/logo-dark.png"
        displayName="Acme"
        theme="dark"
      />
    );
    const img = screen.getByAltText("Acme");
    expect(img.getAttribute("src")).toBe("/logo-dark.png");
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd web
npm test -- BrandingLayer
```

- [ ] **Step 3: Implement**

Create `web/src/auth/shell/BrandingLayer.tsx`:

```typescript
import { useEffect } from "react";

interface BrandingLayerProps {
  logo?: string;
  logoDark?: string;
  favicon?: string;
  displayName?: string;
  theme?: "light" | "dark";
  /** Size variant; default = "header" (~36px). "hero" = larger for hero banners. */
  size?: "header" | "hero";
}

/**
 * BrandingLayer renders the logo + display name and sets favicon + document
 * title as a side effect. Used at the top of the auth surface; reusable
 * across signin / signup / forgot-password pages.
 */
export default function BrandingLayer({
  logo,
  logoDark,
  favicon,
  displayName,
  theme = "light",
  size = "header",
}: BrandingLayerProps) {
  useEffect(() => {
    if (favicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = favicon;
    }
    if (displayName) {
      document.title = displayName;
    }
  }, [favicon, displayName]);

  const resolvedLogo = theme === "dark" && logoDark ? logoDark : logo;
  const heightClass = size === "hero" ? "h-16 max-w-[360px]" : "h-9 max-w-[200px]";

  if (resolvedLogo) {
    return (
      <div className="flex items-center gap-3">
        <img
          src={resolvedLogo}
          alt={displayName ?? "Logo"}
          className={`${heightClass} object-contain`}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className={size === "hero" ? "text-3xl font-bold tracking-tight" : "text-base font-bold tracking-tight"}>
        {displayName ?? "JetAuth"}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — 3 pass**

```bash
npm test -- BrandingLayer
```

- [ ] **Step 5: Commit**

```bash
cd /Users/xiongyanlin/projects/jetauth
git add web/src/auth/shell/BrandingLayer.tsx web/src/auth/__tests__/BrandingLayer.test.tsx
git commit -m "feat(auth/shell): BrandingLayer renders logo + title + favicon

Extracted from W1 placeholder so signin / signup / forgot pages
share the same branding treatment. Sets document title + favicon
as a side effect in useEffect."
```

---

## Task W2a-T05: TopBar Component (theme + language toggle)

Always-on controls in the top-right: theme toggle (light/dark) + language picker. Extracted from the old Login.tsx so it's reusable.

**Files:**
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/shell/TopBar.tsx`
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/__tests__/TopBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `web/src/auth/__tests__/TopBar.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TopBar from "../shell/TopBar";

const mockToggleTheme = vi.fn();
const mockSetLocale = vi.fn();

vi.mock("../../theme", () => ({
  useTheme: () => ({ theme: "light", toggle: mockToggleTheme, applyOrgTheme: vi.fn(), clearOrgTheme: vi.fn() }),
}));

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: "en",
    setLocale: mockSetLocale,
    locales: [
      { value: "en", label: "English" },
      { value: "zh", label: "简体中文" },
    ],
  }),
}));

describe("TopBar", () => {
  it("renders theme toggle and language button", () => {
    render(<TopBar />);
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });

  it("calls theme toggle on click", () => {
    render(<TopBar />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // theme toggle is first
    expect(mockToggleTheme).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- TopBar
```

- [ ] **Step 3: Implement**

Create `web/src/auth/shell/TopBar.tsx`:

```typescript
import { Sun, Moon, Globe } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";

/**
 * TopBar: theme toggle + language picker, fixed to the top-right of the auth
 * surface. Reusable across signin / signup / forgot-password pages.
 */
export default function TopBar() {
  const { theme, toggle } = useTheme();
  const { locale, setLocale, locales } = useTranslation();

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
      <button
        onClick={toggle}
        aria-label="toggle theme"
        className="rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <div className="relative group">
        <button
          aria-label="change language"
          className="flex items-center gap-1 rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
        >
          <Globe size={17} />
          <span className="text-[11px] font-mono font-medium uppercase">{locale}</span>
        </button>
        <div className="invisible group-hover:visible absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-surface-2 py-1 shadow-[var(--shadow-elevated)]">
          {locales.map((l) => (
            <button
              key={l.value}
              onClick={() => setLocale(l.value)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-[13px] transition-colors ${
                locale === l.value
                  ? "text-accent bg-accent-subtle"
                  : "text-text-secondary hover:bg-surface-3"
              }`}
            >
              <span className="font-mono text-[11px] font-bold uppercase w-5">{l.value}</span>
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — pass**

```bash
npm test -- TopBar
```

- [ ] **Step 5: Commit**

```bash
cd /Users/xiongyanlin/projects/jetauth
git add web/src/auth/shell/TopBar.tsx web/src/auth/__tests__/TopBar.test.tsx
git commit -m "feat(auth/shell): TopBar with theme toggle + language picker

Always-on controls in the top-right of the auth surface. Extracted
from the old Login.tsx; reusable across signin / signup / forgot
pages via the new auth/ module."
```

---

## Task W2a-T06: IdentifierStep Component

Step 1 of the identifier-first flow: user enters username/email/phone, hits Continue, triggers `resolveSigninMethods`.

**Files:**
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/signin/IdentifierStep.tsx`
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/__tests__/IdentifierStep.test.tsx`

- [ ] **Step 1: Add i18n keys**

Add to BOTH `web/src/locales/en.ts` and `zh.ts` (parity required):

```
"auth.identifier.placeholder"        → "Email, phone, or username" / "邮箱、手机号或用户名"
"auth.identifier.continueButton"     → "Continue" / "继续"
"auth.identifier.errorRequired"      → "Please enter your email, phone, or username" / "请输入邮箱、手机号或用户名"
```

Run `npm run check:i18n` — must still show parity.

- [ ] **Step 2: Write failing tests**

Create `web/src/auth/__tests__/IdentifierStep.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IdentifierStep from "../signin/IdentifierStep";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en", setLocale: vi.fn(), locales: [] }),
}));

describe("IdentifierStep", () => {
  it("calls onSubmit with the trimmed identifier", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<IdentifierStep onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("auth.identifier.placeholder");
    fireEvent.change(input, { target: { value: "  alice@example.com  " } });

    const button = screen.getByRole("button", { name: "auth.identifier.continueButton" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("alice@example.com");
    });
  });

  it("disables the button when identifier is empty", () => {
    const onSubmit = vi.fn();
    render(<IdentifierStep onSubmit={onSubmit} />);
    const button = screen.getByRole("button", { name: "auth.identifier.continueButton" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("shows loading state during async submit", async () => {
    let resolver: (() => void) | null = null;
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => { resolver = r; }));
    render(<IdentifierStep onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("auth.identifier.placeholder");
    fireEvent.change(input, { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.identifier.continueButton" }));

    await waitFor(() => {
      expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    });
    resolver?.();
  });

  it("displays error prop when provided", () => {
    render(<IdentifierStep onSubmit={vi.fn()} error="user not found" />);
    expect(screen.getByText("user not found")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
npm test -- IdentifierStep
```

- [ ] **Step 4: Implement**

Create `web/src/auth/signin/IdentifierStep.tsx`:

```typescript
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "../../i18n";

interface IdentifierStepProps {
  onSubmit: (identifier: string) => Promise<void>;
  error?: string;
}

/**
 * Step 1 of identifier-first signin. Collects a single identifier
 * (username / email / phone), trims it, and hands off to the parent.
 */
export default function IdentifierStep({ onSubmit, error }: IdentifierStepProps) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmed = identifier.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {error}
        </div>
      )}
      <div>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoFocus
          placeholder={t("auth.identifier.placeholder")}
          className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {t("auth.identifier.continueButton")}
          </>
        ) : (
          <>
            {t("auth.identifier.continueButton")}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Run tests — 4 pass**

```bash
npm test -- IdentifierStep
```

- [ ] **Step 6: Commit**

```bash
git add web/src/auth/signin/IdentifierStep.tsx web/src/auth/__tests__/IdentifierStep.test.tsx web/src/locales/en.ts web/src/locales/zh.ts
git commit -m "feat(auth/signin): IdentifierStep for identifier-first flow

Step 1 — single input (username / email / phone), trims + submits.
Loading state, error surface, disabled-when-empty. Pure component;
the parent SigninPage orchestrator decides what to do with the
identifier (W2a-T08)."
```

---

## Task W2a-T07: PasswordForm Component

Step 2 (for the Password method): password entry + submit. Calls the existing `/api/login` endpoint.

**Files:**
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/signin/PasswordForm.tsx`
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/__tests__/PasswordForm.test.tsx`

- [ ] **Step 1: Add i18n keys**

Add to both `en.ts` and `zh.ts`:

```
"auth.password.label"           → "Password" / "密码"
"auth.password.placeholder"     → "••••••••" (same in both)
"auth.password.submitButton"    → "Sign in" / "登录"
"auth.password.forgotLink"      → "Forgot password?" / "忘记密码？"
"auth.password.backButton"      → "Back" / "返回"
"auth.password.showPassword"    → "Show password" / "显示密码"
"auth.password.hidePassword"    → "Hide password" / "隐藏密码"
```

Run `npm run check:i18n` — parity OK.

- [ ] **Step 2: Write failing tests**

Create `web/src/auth/__tests__/PasswordForm.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PasswordForm from "../signin/PasswordForm";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("PasswordForm", () => {
  it("calls onSubmit with the password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PasswordForm identifier="alice@example.com" userHint="a***@example.com" onSubmit={onSubmit} onBack={vi.fn()} />);

    const pwInput = screen.getByPlaceholderText("auth.password.placeholder");
    fireEvent.change(pwInput, { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.password.submitButton" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("secret123"));
  });

  it("shows user hint when provided", () => {
    render(<PasswordForm identifier="alice" userHint="a***@example.com" onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/a\*\*\*@example\.com/)).toBeInTheDocument();
  });

  it("falls back to raw identifier when no hint", () => {
    render(<PasswordForm identifier="charlie" onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("charlie")).toBeInTheDocument();
  });

  it("toggles password visibility on eye click", () => {
    render(<PasswordForm identifier="x" onSubmit={vi.fn()} onBack={vi.fn()} />);
    const pwInput = screen.getByPlaceholderText("auth.password.placeholder") as HTMLInputElement;
    expect(pwInput.type).toBe("password");
    const toggle = screen.getByLabelText("auth.password.showPassword");
    fireEvent.click(toggle);
    expect(pwInput.type).toBe("text");
  });

  it("invokes onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(<PasswordForm identifier="x" onSubmit={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "auth.password.backButton" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("displays error prop", () => {
    render(<PasswordForm identifier="x" onSubmit={vi.fn()} onBack={vi.fn()} error="wrong password" />);
    expect(screen.getByText("wrong password")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
npm test -- PasswordForm
```

- [ ] **Step 4: Implement**

Create `web/src/auth/signin/PasswordForm.tsx`:

```typescript
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "../../i18n";

interface PasswordFormProps {
  identifier: string;
  userHint?: string;
  onSubmit: (password: string) => Promise<void>;
  onBack: () => void;
  error?: string;
}

/**
 * Password-entry step of the identifier-first flow. Shows the resolved
 * identifier (or masked hint), accepts the password, and hands it to the
 * parent for the actual /api/login call.
 */
export default function PasswordForm({
  identifier,
  userHint,
  onSubmit,
  onBack,
  error,
}: PasswordFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const display = userHint && userHint.length > 0 ? userHint : identifier;
  const canSubmit = password.length > 0 && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSubmit(password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("auth.password.backButton")}
          className="flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={14} />
          {t("auth.password.backButton")}
        </button>
        <span className="h-4 w-px bg-border" />
        <span className="truncate text-[13px] text-text-secondary">{display}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {error}
        </div>
      )}

      <div>
        <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
          {t("auth.password.label")}
        </label>
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            placeholder={t("auth.password.placeholder")}
            className="login-input w-full border border-border bg-surface-1 px-3.5 py-2.5 pr-10 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all rounded-lg"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? t("auth.password.hidePassword") : t("auth.password.showPassword")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {t("auth.password.submitButton")}
          </>
        ) : (
          <>
            {t("auth.password.submitButton")}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Run tests — 6 pass**

```bash
npm test -- PasswordForm
```

- [ ] **Step 6: Commit**

```bash
git add web/src/auth/signin/PasswordForm.tsx web/src/auth/__tests__/PasswordForm.test.tsx web/src/locales/en.ts web/src/locales/zh.ts
git commit -m "feat(auth/signin): PasswordForm for identifier-first step 2

Receives the resolved identifier (+ optional hint) and password;
hands password back to the parent orchestrator for /api/login.
Includes show/hide toggle, back navigation, inline error display.
Pure component — no API calls directly."
```

---

## Task W2a-T08: SigninPage Orchestrator

State machine that composes IdentifierStep → resolveSigninMethods → PasswordForm → `/api/login`. This is the actual "page" component for signin.

**Files:**
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/signin/SigninPage.tsx`
- Create: `/Users/xiongyanlin/projects/jetauth/web/src/auth/__tests__/SigninPage.test.tsx`

- [ ] **Step 1: Add i18n keys**

Add to both `en.ts` and `zh.ts`:

```
"auth.signin.brandingSubtitle"  → "Sign in to continue" / "登录以继续"
"auth.signin.noMethodError"     → "No sign-in method is available for this account" / "此账号暂无可用的登录方式"
"auth.signin.methodNotReady"    → "Only password sign-in is available in this preview; other methods arrive in W2b" / "当前预览仅支持密码登录；其他方式将在 W2b 补齐"
```

Run `npm run check:i18n`.

- [ ] **Step 2: Write failing tests**

Create `web/src/auth/__tests__/SigninPage.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SigninPage from "../signin/SigninPage";
import type { AuthApplication, ResolvedProvider } from "../api/types";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en", setLocale: vi.fn(), locales: [] }),
}));
vi.mock("../../theme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn(), applyOrgTheme: vi.fn(), clearOrgTheme: vi.fn() }),
}));

vi.mock("../api/resolveSigninMethods", () => ({
  resolveSigninMethods: vi.fn().mockResolvedValue({
    methods: [{ name: "Password", displayName: "Password", rule: "All" }],
    recommended: "Password",
    userHint: "a***@example.com",
  }),
}));

vi.mock("../../api/client", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ status: "ok" }),
  },
}));

const mockApp: AuthApplication = {
  name: "app-test",
  organization: "admin",
  displayName: "Test App",
  logo: "",
  favicon: "",
  title: "",
  homepageUrl: "",
  enablePassword: true,
  enableSignUp: true,
  enableGuestSignin: false,
  disableSignin: false,
  enableAutoSignin: false,
  enableCodeSignin: false,
  enableWebAuthn: false,
  orgChoiceMode: "None",
  formOffset: 2,
  formBackgroundUrl: "",
  formBackgroundUrlMobile: "",
  formCss: "",
  formCssMobile: "",
  formSideHtml: "",
  headerHtml: "",
  footerHtml: "",
  signinHtml: "",
  signupHtml: "",
  signinMethods: [],
  signupItems: [],
  signinItems: [],
  themeData: null,
  organizationObj: null,
};

const mockProviders: ResolvedProvider[] = [];

describe("SigninPage", () => {
  it("advances from identifier step to password step after resolve succeeds", async () => {
    render(<SigninPage application={mockApp} providers={mockProviders} />);

    const input = screen.getByPlaceholderText("auth.identifier.placeholder");
    fireEvent.change(input, { target: { value: "alice@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.identifier.continueButton" }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("auth.identifier.placeholder")).toBeNull();
      expect(screen.getByPlaceholderText("auth.password.placeholder")).toBeInTheDocument();
    });
  });

  it("goes back to identifier step when password step back button clicked", async () => {
    render(<SigninPage application={mockApp} providers={mockProviders} />);

    fireEvent.change(screen.getByPlaceholderText("auth.identifier.placeholder"), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.identifier.continueButton" }));

    await waitFor(() => screen.getByPlaceholderText("auth.password.placeholder"));

    fireEvent.click(screen.getByRole("button", { name: "auth.password.backButton" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("auth.identifier.placeholder")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
npm test -- SigninPage
```

- [ ] **Step 4: Implement**

Create `web/src/auth/signin/SigninPage.tsx`:

```typescript
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";
import BrandingLayer from "../shell/BrandingLayer";
import TopBar from "../shell/TopBar";
import IdentifierStep from "./IdentifierStep";
import PasswordForm from "./PasswordForm";
import { resolveSigninMethods } from "../api/resolveSigninMethods";
import type { AuthApplication, ResolvedProvider, SigninMethodInfo } from "../api/types";

type Step = "identifier" | "method";

interface SigninPageProps {
  application: AuthApplication;
  providers: ResolvedProvider[];
}

/**
 * Identifier-first signin orchestrator. Composes BrandingLayer + TopBar
 * with the step components. W2a only wires the Password method; W2b
 * extends the "method" step with CodeForm, WebAuthnForm, FaceForm,
 * ProvidersRow.
 */
export default function SigninPage({ application, providers: _providers }: SigninPageProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [methods, setMethods] = useState<SigninMethodInfo[]>([]);
  const [recommended, setRecommended] = useState<string>("");
  const [userHint, setUserHint] = useState<string>("");
  const [error, setError] = useState<string>("");

  const orgName = application.organizationObj?.name ?? application.organization ?? "built-in";

  const handleIdentifierSubmit = async (v: string) => {
    setError("");
    try {
      const payload = await resolveSigninMethods({
        application: application.name,
        organization: orgName,
        identifier: v,
      });
      setIdentifier(v);
      setMethods(payload.methods);
      setRecommended(payload.recommended);
      setUserHint(payload.userHint);
      setStep("method");
    } catch (e: unknown) {
      setError((e as Error).message ?? t("auth.signin.noMethodError"));
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    setError("");
    // Construct the same AuthForm shape the legacy Login.tsx used — the
    // /api/login handler accepts it unchanged.
    const body = {
      application: application.name,
      organization: orgName,
      username: identifier,
      password,
      type: searchParams.get("type") ?? "login",
      signinMethod: "Password",
      clientId: application.name,
      redirectUri: searchParams.get("redirect_uri") ?? "",
      state: searchParams.get("state") ?? "",
    };
    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>(
        "/api/login",
        body
      );
      if (res.status !== "ok") {
        setError(res.msg ?? t("auth.signin.noMethodError"));
        return;
      }
      // After successful login, redirect to the original URL or home.
      const redirectUri = searchParams.get("redirect_uri");
      if (redirectUri && res.data) {
        window.location.href = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}code=${encodeURIComponent(res.data)}&state=${encodeURIComponent(searchParams.get("state") ?? "")}`;
        return;
      }
      navigate("/", { replace: true });
    } catch (e: unknown) {
      setError((e as Error).message ?? "network error");
    }
  };

  const handleBack = () => {
    setStep("identifier");
    setError("");
  };

  const selectedMethod = recommended || (methods[0]?.name ?? "Password");
  const orgLogo = theme === "dark" && application.organizationObj?.logoDark
    ? application.organizationObj.logoDark
    : application.organizationObj?.logo ?? application.logo;
  const orgDisplay = application.organizationObj?.displayName ?? application.displayName ?? application.name;

  return (
    <div className="min-h-screen flex relative">
      <TopBar />

      <div className="w-full flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <BrandingLayer
              logo={orgLogo}
              logoDark={application.organizationObj?.logoDark}
              favicon={application.organizationObj?.favicon ?? application.favicon}
              displayName={orgDisplay}
              theme={theme}
            />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            {application.displayName || application.name}
          </h1>
          <p className="text-[13px] text-text-muted mb-8">
            {t("auth.signin.brandingSubtitle")}
          </p>

          {step === "identifier" && (
            <IdentifierStep onSubmit={handleIdentifierSubmit} error={error} />
          )}

          {step === "method" && selectedMethod === "Password" && (
            <PasswordForm
              identifier={identifier}
              userHint={userHint}
              onSubmit={handlePasswordSubmit}
              onBack={handleBack}
              error={error}
            />
          )}

          {step === "method" && selectedMethod !== "Password" && (
            <div className="rounded-lg border border-border bg-surface-2 p-4 text-[13px] text-text-secondary">
              <ShieldCheck size={16} className="inline-block mr-1 text-accent" />
              {t("auth.signin.methodNotReady")}
              <button
                onClick={handleBack}
                className="mt-3 block text-[12px] text-accent hover:underline"
              >
                {t("auth.password.backButton")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — 2 pass**

```bash
npm test -- SigninPage
```

- [ ] **Step 6: Commit**

```bash
git add web/src/auth/signin/SigninPage.tsx web/src/auth/__tests__/SigninPage.test.tsx web/src/locales/en.ts web/src/locales/zh.ts
git commit -m "feat(auth/signin): SigninPage state machine

Composes BrandingLayer + TopBar + IdentifierStep + PasswordForm
into the identifier-first login flow. W2a only routes the Password
method to the real /api/login endpoint; other methods display a
'not ready yet' placeholder (W2b fills them in).

POST /api/login body matches the legacy Login.tsx shape so the
existing handler needs no changes — only the UX surface moved."
```

---

## Task W2a-T09: Wire SigninPage into AuthShell

Replace the W1 placeholder body with SigninPage when `mode === "signin"`.

**Files:**
- Modify: `/Users/xiongyanlin/projects/jetauth/web/src/auth/AuthShell.tsx`

- [ ] **Step 1: Edit AuthShell.tsx**

In `AuthShell.tsx`, find the `AuthShellInner` function (currently renders a placeholder for both signin and signup modes). Replace its return statement for `mode === "signin"` to use `SigninPage`:

```typescript
import SigninPage from "./signin/SigninPage";

// ... existing imports ...

function AuthShellInner({ appId, mode }: { appId: string; mode: Mode }) {
  const { t } = useTranslation();
  const [app, setApp] = useState<AuthApplication | null>(null);
  const [providers, setProviders] = useState<ResolvedProvider[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getAppLogin(appId)
      .then(({ application, providers }) => {
        setApp(application);
        setProviders(providers);
      })
      .catch((e: Error) => setError(e.message ?? "failed to load"));
  }, [appId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-[14px] text-text-muted">{error}</p>
      </div>
    );
  }
  if (!app) {
    return <div className="min-h-screen flex items-center justify-center">{t("auth.loading")}</div>;
  }

  if (mode === "signin") {
    return <SigninPage application={app} providers={providers} />;
  }

  // mode === "signup" — W1 placeholder stays for now; W3 replaces with
  // SignupPage.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full p-8 bg-white border border-gray-200 rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--color-primary, #2563EB)" }}>
          {t("auth.signupTitle")}
        </h1>
        <p className="text-sm text-gray-500">
          {app.displayName || app.name} · {t("auth.skeletonNote")}
        </p>
      </div>
    </div>
  );
}
```

Remove any unused imports or variables from the old placeholder body (e.g., `useAuthTheme` is no longer referenced inside `AuthShellInner` — check and remove).

- [ ] **Step 2: TypeScript compile check**

```bash
cd web
npx tsc --noEmit 2>&1 | grep "src/auth/" | head
```

Expected: empty.

- [ ] **Step 3: All existing tests still pass**

```bash
npm test 2>&1 | tail -10
```

Expected: ThemeProvider (3) + BrandingLayer (3) + TopBar (2) + IdentifierStep (4) + PasswordForm (6) + SigninPage (2) = 20 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/xiongyanlin/projects/jetauth
git add web/src/auth/AuthShell.tsx
git commit -m "feat(auth): AuthShell routes signin mode to SigninPage

Replaces the W1 placeholder body for mode='signin' with the new
identifier-first SigninPage. Signup mode still renders the W1
placeholder until W3 adds SignupPage."
```

---

## Task W2a-T10: End-to-End Smoke Test

Manually verify that a real user can sign in with password via the new UI. Not a code change — a checklist of manual verifications + a report in a test-log doc.

**Files:**
- Create: `/Users/xiongyanlin/projects/jetauth/docs/2026-04-18-w2a-smoke-log.md`

- [ ] **Step 1: Start backend + frontend**

```bash
# Terminal 1
cd /Users/xiongyanlin/projects/jetauth
go run .

# Terminal 2
cd /Users/xiongyanlin/projects/jetauth/web
npm run dev
```

- [ ] **Step 2: Test in browser**

Open `http://localhost:5173/login` (or whichever dev-server port Vite prints).

Verify:
- [ ] Page loads with brand name + theme (no console errors)
- [ ] Theme toggle (top-right sun/moon) works
- [ ] Language picker (top-right globe) works
- [ ] IdentifierStep input accepts text, Continue button is disabled when empty
- [ ] Entering "admin" + Continue → advances to PasswordForm showing "admin" at the top
- [ ] "Back" button → returns to IdentifierStep with input preserved
- [ ] Correct password + Sign in → redirects to home (or respects `?redirect_uri=`)
- [ ] Wrong password → error surface shows the backend message
- [ ] Entering a non-existent user + wrong password → still gets a login error (no information leak about existence)

- [ ] **Step 3: Test the theme pipeline end-to-end**

1. In another browser tab, open admin → Applications → edit `app-built-in` → Appearance → change Primary Color to `#FF0055` → Save.
2. Refresh `/login` — the Continue button + "Sign in" button should now show the new accent color.

- [ ] **Step 4: Write the smoke log**

Create `docs/2026-04-18-w2a-smoke-log.md`:

```markdown
# W2a Signin Core — Smoke Test Log

**Date:** 2026-04-18
**Branch:** feat/auth-ui-revamp
**Tested against commit:** <fill SHA>

## Test Plan

1. Initial load + branding
2. Theme + language toggles
3. Identifier → PasswordForm happy path
4. Back button
5. Successful login
6. Wrong password error
7. Theme pipeline end-to-end

## Results

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | ... | ✅ / ❌ | ... |

## Screenshots (optional)

(attach any noteworthy screenshots)

## Issues Found

(list any issues, or "none")
```

- [ ] **Step 5: Commit**

```bash
cd /Users/xiongyanlin/projects/jetauth
git add docs/2026-04-18-w2a-smoke-log.md
git commit -m "docs(auth-revamp/W2a): manual smoke test log

End-to-end verification that the identifier-first signin flow
actually logs users in through /api/login, that theme changes in
admin propagate to the login page, and that error surfaces behave."
```

---

## Wrap-up

After T10:
- `feat/auth-ui-revamp` has a real working password-based signin via identifier-first UX
- ~20 new frontend tests + 4 new backend tests, all green
- W1 placeholder for signin is retired; signup still has the placeholder (W3)
- W2b (Providers / Code / WebAuthn / Face / Classic fallback) will be planned at end of W2a and executed on top of this

**Not in W2a (deferred to W2b):**
- Verification code method
- WebAuthn method
- Face ID method
- Third-party provider buttons (GitHub / Google / etc.)
- Classic (tabs) fallback mode
- Forgot-password link

**Demo:** user visits `/login/admin/app-built-in`, enters "admin" + password → lands on `/` authenticated. Admin changes theme color → next page load reflects it.
