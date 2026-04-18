# W1 Foundation — Auth UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the theme foundation (backend resolver + frontend provider) and retire the legacy `web/` module, so every later week can build on a single, theme-aware auth surface.

**Architecture:** Three concurrent tracks — (1) migrate static serving from `web/` to `web-new/` and delete the old module, (2) extend `ThemeData` + add `/api/get-resolved-theme` merge endpoint, (3) introduce the `web-new/src/auth/` module with a `ThemeProvider` that consumes the resolved theme and injects CSS variables. By end of W1, changing `Application.ThemeData.ColorPrimary` in admin visibly recolors the (still-placeholder) login page.

**Tech Stack:** Go 1.25 / Beego v2 / XORM / sqlite+mysql / React 19 / Vite 8 / Vitest / TypeScript / Tailwind 4

**Companion docs:** `docs/2026-04-18-auth-ui-revamp-plan.md`, `docs/2026-04-18-auth-ui-compatibility-matrix.md`

---

## Task W1-T01: Pre-flight Audit

Capture everything that depends on `web/` so Task T02 knows exactly what to touch. Non-code deliverable.

**Files:**
- Create: `docs/2026-04-18-web-deletion-audit.md`

- [ ] **Step 1: Run the audit commands**

```bash
cd /Users/xiongyanlin/projects/jetauth

# All Go code referencing web/build
grep -rn "web/build\|web-new/build" --include="*.go" .

# All CI + Docker references
grep -rn "web/\|web-new/" Dockerfile .github/workflows/ Makefile build.sh docker-entrypoint.sh 2>/dev/null

# Any code importing/running from web/
grep -rn '"web"' --include="*.go" --include="*.sh" --include="*.yml" .
```

- [ ] **Step 2: Write the audit doc**

Create `docs/2026-04-18-web-deletion-audit.md` with the exact output of those commands and a summary. Known hits (baseline — expect no other surprises):

- `embed_static.go:26` — `//go:embed all:web/build`
- `embed_static.go:33` — `fs.Sub(embeddedWebFS, "web/build")`
- `main.go:87` — commented-out reference
- `routers/static_filter.go:43` — `path := "web/build"`
- `routers/static_filter.go:52` — fallback `filepath.Join(frontendBaseDir, "web/build")`
- `routers/static_filter.go:202` — error message mentions `web-new/build`
- `Dockerfile:1–10` — FRONT build stage
- `Dockerfile:49,68` — `COPY --from=FRONT /web/build`
- `.github/workflows/build.yml:54,212` — upload `./web/build`

- [ ] **Step 3: Commit**

```bash
git add docs/2026-04-18-web-deletion-audit.md
git commit -m "docs(auth-revamp): web/ deletion pre-flight audit"
```

---

## Task W1-T02: Migrate Static Serving to web-new/

Rewrite embed, static filter, Dockerfile, and CI to serve `web-new/build` instead of `web/build`. Keep `web/` intact during this task — T03 deletes it only after we confirm the migration works.

**Files:**
- Modify: `embed_static.go`
- Modify: `routers/static_filter.go`
- Modify: `main.go`
- Modify: `Dockerfile`
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Update `embed_static.go`**

```go
// embed_static.go — replace lines 25-33

//go:embed all:web-new/build
var embeddedWebFS embed.FS

//go:embed all:swagger
var embeddedSwaggerFS embed.FS

func init() {
    sub, err := fs.Sub(embeddedWebFS, "web-new/build")
    if err != nil {
        panic(err)
    }
    embedded.WebFS = sub
    // … rest unchanged
}
```

- [ ] **Step 2: Update `routers/static_filter.go`**

Replace `getWebBuildFolder()` (lines 42–54) with:

```go
func getWebBuildFolder() string {
    path := "web-new/build"
    if util.FileExist(filepath.Join(path, "index.html")) || frontendBaseDir == "" {
        return path
    }

    if util.FileExist(filepath.Join(frontendBaseDir, "index.html")) {
        return frontendBaseDir
    }

    path = filepath.Join(frontendBaseDir, "web-new/build")
    return path
}
```

Update the error-message string at `routers/static_filter.go:202` to reflect the new path (the existing message already mentions `web-new/build` — verify it still reads correctly).

- [ ] **Step 3: Remove stale comment in `main.go:87`**

Delete the line `// web.SetStaticPath("/static", "web/build/static")` entirely.

- [ ] **Step 4: Update `Dockerfile` FRONT stage**

Replace lines 1–10 with:

```dockerfile
FROM --platform=$BUILDPLATFORM node:20.20.1 AS FRONT
WORKDIR /web-new

# Copy only dependency files first for better caching
COPY ./web-new/package.json ./web-new/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source files and build
COPY ./web-new .
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

And update lines 49 and 68 — change `/web/build ./web/build` to `/web-new/build ./web-new/build` in both COPY lines.

- [ ] **Step 5: Update CI workflow**

In `.github/workflows/build.yml`, replace every `./web/build` with `./web-new/build` (line 54 and 212 — there may be more; verify via grep after the edit).

Also in the CI workflow: whatever step builds the frontend, change `cd web && yarn build` to `cd web-new && npm ci && npm run build`. Search for it in the file.

- [ ] **Step 6: Build the frontend locally and verify static serving works**

```bash
cd /Users/xiongyanlin/projects/jetauth/web-new
npm ci
npm run build
ls build/index.html  # must exist

cd ..
go build -tags embed -o /tmp/jetauth-test ./
/tmp/jetauth-test --help 2>&1 | head -3  # should not panic at init()
```

Expected: binary builds without embed error; `init()` in `embed_static.go` finds `web-new/build/index.html`.

- [ ] **Step 7: Commit**

```bash
git add embed_static.go main.go routers/static_filter.go Dockerfile .github/workflows/build.yml
git commit -m "build: migrate static serving from web/ to web-new/

The Go binary now embeds web-new/build directly. Dockerfile FRONT stage
builds web-new with npm instead of web with yarn. CI uploads web-new/build
as the frontend artifact. Legacy web/ directory still present — deleted
in next commit."
```

---

## Task W1-T03: Delete Legacy web/ Module

After T02 confirms the migration works, remove the 1.2 GB legacy directory and the 116 npm CVEs it carries.

**Files:**
- Delete: `web/` (entire directory)

- [ ] **Step 1: Remove the directory**

```bash
cd /Users/xiongyanlin/projects/jetauth
git rm -r web/
```

Expected output ends with something like `rm 'web/src/App.less'` — thousands of lines.

- [ ] **Step 2: Verify Go build still works**

```bash
go build -tags embed -o /tmp/jetauth-post-delete ./
go build ./...
```

Expected: both succeed with no output.

- [ ] **Step 3: Verify frontend build still works**

```bash
cd web-new
npm run build
ls build/index.html  # sanity check
cd ..
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete legacy Casdoor web/ module

Removes ~1.2 GB / 136K files and resolves 116 npm dependency CVEs
that were carried solely by web/yarn.lock. All static serving now
routes to web-new/build via the migration in the previous commit."
```

---

## Task W1-T04: i18n Completeness CI Gate

Add a script that fails the build if `web-new/src/locales/en.ts` and `zh.ts` have differing key sets. Prevents the revamp from shipping with half-translated UI.

**Files:**
- Create: `web-new/scripts/check-i18n.ts`
- Modify: `web-new/package.json`

- [ ] **Step 1: Write the check script**

Create `web-new/scripts/check-i18n.ts`:

```typescript
#!/usr/bin/env tsx
// Fails with non-zero exit if en.ts and zh.ts have differing key sets.
import en from "../src/locales/en";
import zh from "../src/locales/zh";

const enKeys = new Set(Object.keys(en));
const zhKeys = new Set(Object.keys(zh));

const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k)).sort();
const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k)).sort();

if (missingInZh.length === 0 && missingInEn.length === 0) {
  console.log(`✓ i18n parity: ${enKeys.size} keys across en and zh`);
  process.exit(0);
}

console.error("✗ i18n key mismatch detected.\n");
if (missingInZh.length) {
  console.error(`Missing in zh.ts (${missingInZh.length}):`);
  for (const k of missingInZh) console.error(`  - ${k}`);
}
if (missingInEn.length) {
  console.error(`\nMissing in en.ts (${missingInEn.length}):`);
  for (const k of missingInEn) console.error(`  - ${k}`);
}
process.exit(1);
```

- [ ] **Step 2: Register in package.json**

In `web-new/package.json` under `"scripts"`, add:

```json
"check:i18n": "tsx scripts/check-i18n.ts",
"build": "npm run check:i18n && tsc -b && vite build",
```

(replace the existing `build` line). Also add `"tsx": "^4.20.0"` to `devDependencies` if not present.

- [ ] **Step 3: Run it**

```bash
cd web-new
npm install  # picks up tsx
npm run check:i18n
```

Expected: script runs and reports the current gap (5 missing keys). Non-zero exit.

- [ ] **Step 4: Commit**

```bash
git add web-new/scripts/check-i18n.ts web-new/package.json web-new/package-lock.json
git commit -m "ci(web-new): add i18n parity check blocking build on mismatch"
```

---

## Task W1-T05: Backfill Missing i18n Keys

Fix the 5-key gap surfaced by T04 so build stays green.

**Files:**
- Modify: `web-new/src/locales/zh.ts` (or `en.ts` if that's the side with extras)

- [ ] **Step 1: Enumerate the gap**

```bash
cd web-new
npm run check:i18n 2>&1 | grep -E "^  - " > /tmp/i18n-gap.txt
cat /tmp/i18n-gap.txt
```

- [ ] **Step 2: Add each missing key to the opposite locale**

For each entry printed (e.g. `- login.submitting`), read its existing value in the source locale, translate, and add to the target locale. Keep alphabetical/grouped ordering consistent with surrounding entries.

- [ ] **Step 3: Re-run the check**

```bash
npm run check:i18n
```

Expected: `✓ i18n parity: N keys across en and zh`.

- [ ] **Step 4: Commit**

```bash
git add web-new/src/locales/
git commit -m "i18n(web-new): backfill missing zh/en keys to pass parity check"
```

---

## Task W1-T06: Extend ThemeData Struct (Backend B1)

Add 9 optional fields to `ThemeData` to support extended theming. Backward-compatible — empty fields deserialize cleanly from old rows.

**Files:**
- Modify: `object/organization.go:38-44`
- Test: `object/theme_resolver_test.go` (new; see next task for first tests — this task adds struct + deserialization test)

- [ ] **Step 1: Write the failing test**

Create `object/theme_resolver_test.go`:

```go
package object

import (
    "encoding/json"
    "testing"
)

func TestThemeData_BackwardCompatibleJSON(t *testing.T) {
    oldJSON := `{"themeType":"default","colorPrimary":"#2563EB","borderRadius":8,"isCompact":false,"isEnabled":true}`
    var td ThemeData
    if err := json.Unmarshal([]byte(oldJSON), &td); err != nil {
        t.Fatalf("unmarshal old JSON: %v", err)
    }
    if td.ColorPrimary != "#2563EB" || td.BorderRadius != 8 {
        t.Fatalf("old fields not preserved: %+v", td)
    }
    if td.ColorCTA != "" || td.FontFamily != "" || td.SpacingScale != 0 {
        t.Fatalf("new fields should zero-default: %+v", td)
    }
}

func TestThemeData_NewFieldsSerialize(t *testing.T) {
    td := ThemeData{
        ColorPrimary:     "#000",
        ColorCTA:         "#F97316",
        DarkColorPrimary: "#60A5FA",
        FontFamily:       "Inter",
        SpacingScale:     0.875,
        IsEnabled:        true,
    }
    b, err := json.Marshal(td)
    if err != nil {
        t.Fatalf("marshal: %v", err)
    }
    out := string(b)
    for _, want := range []string{`"colorCTA":"#F97316"`, `"darkColorPrimary":"#60A5FA"`, `"fontFamily":"Inter"`, `"spacingScale":0.875`} {
        if !contains(out, want) {
            t.Errorf("serialized output missing %s: %s", want, out)
        }
    }
}

func contains(s, sub string) bool { return len(s) >= len(sub) && indexOf(s, sub) >= 0 }
func indexOf(s, sub string) int {
    for i := 0; i+len(sub) <= len(s); i++ {
        if s[i:i+len(sub)] == sub {
            return i
        }
    }
    return -1
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
go test ./object/ -run TestThemeData -v
```

Expected: `ColorCTA` / `DarkColorPrimary` / `FontFamily` / `SpacingScale` do not exist on `ThemeData` — compile error or undefined field.

- [ ] **Step 3: Extend the struct**

Replace `object/organization.go:38-44` with:

```go
type ThemeData struct {
    // Legacy fields (kept for backward compatibility with existing records).
    ThemeType    string `xorm:"varchar(30)" json:"themeType"`
    ColorPrimary string `xorm:"varchar(10)" json:"colorPrimary"`
    BorderRadius int    `xorm:"int" json:"borderRadius"`
    IsCompact    bool   `xorm:"bool" json:"isCompact"`
    IsEnabled    bool   `xorm:"bool" json:"isEnabled"`

    // Extended semantic colors (empty string = inherit from lower layer).
    ColorCTA     string `xorm:"varchar(10)" json:"colorCTA,omitempty"`
    ColorSuccess string `xorm:"varchar(10)" json:"colorSuccess,omitempty"`
    ColorDanger  string `xorm:"varchar(10)" json:"colorDanger,omitempty"`
    ColorWarning string `xorm:"varchar(10)" json:"colorWarning,omitempty"`

    // Dark-mode overrides (empty string = auto-derive from light-mode colors).
    DarkColorPrimary string `xorm:"varchar(10)" json:"darkColorPrimary,omitempty"`
    DarkBackground   string `xorm:"varchar(10)" json:"darkBackground,omitempty"`

    // Typography (empty = inherit).
    FontFamily     string `xorm:"varchar(200)" json:"fontFamily,omitempty"`
    FontFamilyMono string `xorm:"varchar(200)" json:"fontFamilyMono,omitempty"`

    // Spacing multiplier; 0 = inherit, 0.875 = compact, 1.0 = normal, 1.125 = spacious.
    SpacingScale float64 `xorm:"double" json:"spacingScale,omitempty"`
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
go test ./object/ -run TestThemeData -v
```

Expected: both subtests PASS.

- [ ] **Step 5: Run go build ./... to catch any caller breakage**

```bash
go build ./...
```

Expected: no errors. `omitempty` prevents breakage in any code relying on default marshaling.

- [ ] **Step 6: Commit**

```bash
git add object/organization.go object/theme_resolver_test.go
git commit -m "feat(theme): extend ThemeData with 9 optional fields

Adds semantic colors (CTA, success, danger, warning), dark-mode
overrides, font-family pair, and spacingScale multiplier. All new
fields zero-default and use omitempty, so old rows deserialize
unchanged and old API consumers see no new keys unless set."
```

---

## Task W1-T07: Theme Merge Engine (ResolveTheme)

Implement the cascade: System → Org → App → Preview. Each layer overrides non-zero fields of the one above.

**Files:**
- Create: `object/theme_resolver.go`
- Modify: `object/theme_resolver_test.go`

- [ ] **Step 1: Write the failing test**

Append to `object/theme_resolver_test.go`:

```go
func TestResolveTheme_SystemOnly(t *testing.T) {
    got := ResolveTheme(nil, nil, nil)
    if got.ColorPrimary == "" || got.FontFamily == "" {
        t.Fatalf("system defaults should always populate core tokens: %+v", got)
    }
}

func TestResolveTheme_OrgOverridesSystem(t *testing.T) {
    org := &ThemeData{ColorPrimary: "#FF0000", IsEnabled: true}
    got := ResolveTheme(org, nil, nil)
    if got.ColorPrimary != "#FF0000" {
        t.Errorf("org ColorPrimary should win; got %s", got.ColorPrimary)
    }
}

func TestResolveTheme_OrgNotEnabledIsIgnored(t *testing.T) {
    org := &ThemeData{ColorPrimary: "#FF0000", IsEnabled: false}
    got := ResolveTheme(org, nil, nil)
    if got.ColorPrimary == "#FF0000" {
        t.Errorf("org with IsEnabled=false should be ignored")
    }
}

func TestResolveTheme_AppOverridesOrg(t *testing.T) {
    org := &ThemeData{ColorPrimary: "#FF0000", FontFamily: "Roboto", IsEnabled: true}
    app := &ThemeData{ColorPrimary: "#00FF00", IsEnabled: true}
    got := ResolveTheme(org, app, nil)
    if got.ColorPrimary != "#00FF00" {
        t.Errorf("app ColorPrimary should win; got %s", got.ColorPrimary)
    }
    if got.FontFamily != "Roboto" {
        t.Errorf("org FontFamily should fall through when app didn't set it; got %s", got.FontFamily)
    }
}

func TestResolveTheme_PreviewOverridesAll(t *testing.T) {
    org := &ThemeData{ColorPrimary: "#FF0000", IsEnabled: true}
    app := &ThemeData{ColorPrimary: "#00FF00", IsEnabled: true}
    preview := &ThemeData{ColorPrimary: "#0000FF", IsEnabled: true}
    got := ResolveTheme(org, app, preview)
    if got.ColorPrimary != "#0000FF" {
        t.Errorf("preview ColorPrimary should win; got %s", got.ColorPrimary)
    }
}

func TestResolveTheme_DarkDerivedWhenUnset(t *testing.T) {
    org := &ThemeData{ColorPrimary: "#2563EB", IsEnabled: true}
    got := ResolveTheme(org, nil, nil)
    if got.DarkColorPrimary == "" {
        t.Errorf("DarkColorPrimary should be auto-derived when unset")
    }
    if got.DarkColorPrimary == got.ColorPrimary {
        t.Errorf("DarkColorPrimary should differ from light ColorPrimary")
    }
}
```

- [ ] **Step 2: Run the test — expect failure (undefined `ResolveTheme`)**

```bash
go test ./object/ -run TestResolveTheme -v
```

- [ ] **Step 3: Implement `ResolveTheme`**

Create `object/theme_resolver.go`:

```go
package object

// systemDefaultTheme is the baseline every resolved theme starts from.
// Chosen for WCAG AA contrast and professional SaaS aesthetic.
var systemDefaultTheme = ThemeData{
    ThemeType:      "default",
    ColorPrimary:   "#2563EB",
    ColorCTA:       "#F97316",
    ColorSuccess:   "#16A34A",
    ColorDanger:    "#DC2626",
    ColorWarning:   "#D97706",
    BorderRadius:   8,
    IsCompact:      false,
    IsEnabled:      true,
    FontFamily:     "Inter, system-ui, sans-serif",
    FontFamilyMono: "JetBrains Mono, ui-monospace, monospace",
    SpacingScale:   1.0,
}

// ResolveTheme merges (system → org → app → preview) layers, with each layer's
// non-zero fields overriding the one beneath. A layer whose IsEnabled == false
// is skipped entirely (legacy Casdoor semantics). DarkColorPrimary is auto-
// derived from ColorPrimary when unset.
func ResolveTheme(org, app, preview *ThemeData) ThemeData {
    out := systemDefaultTheme
    for _, layer := range []*ThemeData{org, app, preview} {
        if layer == nil || !layer.IsEnabled {
            continue
        }
        out = mergeThemeLayer(out, *layer)
    }
    if out.DarkColorPrimary == "" {
        out.DarkColorPrimary = deriveDarkColor(out.ColorPrimary)
    }
    if out.DarkBackground == "" {
        out.DarkBackground = "#0F1117"
    }
    return out
}

// mergeThemeLayer overlays `over` on `base`, keeping `base` values wherever
// `over` has a zero value. IsEnabled is always taken from `over` (callers are
// expected to have already checked it before calling this).
func mergeThemeLayer(base, over ThemeData) ThemeData {
    out := base
    if over.ThemeType != "" {
        out.ThemeType = over.ThemeType
    }
    if over.ColorPrimary != "" {
        out.ColorPrimary = over.ColorPrimary
    }
    if over.ColorCTA != "" {
        out.ColorCTA = over.ColorCTA
    }
    if over.ColorSuccess != "" {
        out.ColorSuccess = over.ColorSuccess
    }
    if over.ColorDanger != "" {
        out.ColorDanger = over.ColorDanger
    }
    if over.ColorWarning != "" {
        out.ColorWarning = over.ColorWarning
    }
    if over.DarkColorPrimary != "" {
        out.DarkColorPrimary = over.DarkColorPrimary
    }
    if over.DarkBackground != "" {
        out.DarkBackground = over.DarkBackground
    }
    if over.FontFamily != "" {
        out.FontFamily = over.FontFamily
    }
    if over.FontFamilyMono != "" {
        out.FontFamilyMono = over.FontFamilyMono
    }
    if over.BorderRadius != 0 {
        out.BorderRadius = over.BorderRadius
    }
    if over.SpacingScale != 0 {
        out.SpacingScale = over.SpacingScale
    }
    // IsCompact is a bool — any explicit value on `over` wins. There is no way
    // in Go to distinguish false-unset from false-explicit without a pointer,
    // but since IsCompact also affects SpacingScale, callers expressing
    // compactness should set both. Keeping this simple here.
    out.IsCompact = over.IsCompact
    out.IsEnabled = true
    return out
}

// deriveDarkColor shifts a hex color toward the typical dark-mode pairing:
// slightly lighter + lower saturation. Rough HSL transform done in hex.
// This is intentionally approximate — admins can override explicitly via
// DarkColorPrimary when they need exact brand consistency.
func deriveDarkColor(hex string) string {
    if len(hex) != 7 || hex[0] != '#' {
        return "#60A5FA" // safe default (Tailwind blue-400)
    }
    parse := func(s string) int {
        n := 0
        for i := 0; i < len(s); i++ {
            c := s[i]
            n *= 16
            switch {
            case c >= '0' && c <= '9':
                n += int(c - '0')
            case c >= 'a' && c <= 'f':
                n += int(c-'a') + 10
            case c >= 'A' && c <= 'F':
                n += int(c-'A') + 10
            default:
                return -1
            }
        }
        return n
    }
    r := parse(hex[1:3])
    g := parse(hex[3:5])
    b := parse(hex[5:7])
    if r < 0 || g < 0 || b < 0 {
        return "#60A5FA"
    }
    // Lighten by pulling each channel 40% of the way toward 255.
    lighten := func(v int) int { return v + (255-v)*2/5 }
    r, g, b = lighten(r), lighten(g), lighten(b)
    return "#" + toHex(r) + toHex(g) + toHex(b)
}

func toHex(n int) string {
    const d = "0123456789ABCDEF"
    return string([]byte{d[n>>4&0xF], d[n&0xF]})
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
go test ./object/ -run "TestResolveTheme|TestThemeData" -v
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add object/theme_resolver.go object/theme_resolver_test.go
git commit -m "feat(theme): add ResolveTheme merge engine with derived dark colors

System → Organization → Application → Preview cascade. Non-zero
override semantics; IsEnabled=false layers are skipped. Dark colors
auto-derive via HSL shift when unset so admins don't have to
specify both."
```

---

## Task W1-T08: GET /api/get-resolved-theme Endpoint (B2)

Expose the merged theme as JSON + a pre-built CSS-variable string. Callable anonymously (login page is pre-auth); reads `app` query param.

**Files:**
- Create: `controllers/theme.go`
- Modify: `routers/router.go`
- Create: `controllers/theme_test.go`

- [ ] **Step 1: Write the failing test**

Create `controllers/theme_test.go`:

```go
package controllers

import (
    "encoding/json"
    "testing"

    "github.com/deluxebear/jetauth/object"
)

func TestBuildCSSVariables_ContainsCoreTokens(t *testing.T) {
    theme := object.ThemeData{
        ColorPrimary: "#2563EB",
        ColorCTA:     "#F97316",
        BorderRadius: 12,
        FontFamily:   "Inter",
    }
    css := buildCSSVariables(theme)
    for _, want := range []string{
        "--color-primary: #2563EB",
        "--color-cta: #F97316",
        "--radius-md: 12px",
        "--font-sans: Inter",
    } {
        if !stringContains(css, want) {
            t.Errorf("css output missing %q:\n%s", want, css)
        }
    }
}

func TestResolvedThemeResponse_Serialization(t *testing.T) {
    resp := ResolvedThemeResponse{
        Status: "ok",
        Data: ResolvedThemePayload{
            Theme: object.ThemeData{ColorPrimary: "#000"},
            CSS:   "--color-primary: #000;",
        },
    }
    b, err := json.Marshal(resp)
    if err != nil {
        t.Fatal(err)
    }
    s := string(b)
    if !stringContains(s, `"theme":`) || !stringContains(s, `"css":`) {
        t.Errorf("response shape wrong: %s", s)
    }
}

func stringContains(s, sub string) bool {
    for i := 0; i+len(sub) <= len(s); i++ {
        if s[i:i+len(sub)] == sub {
            return true
        }
    }
    return false
}
```

- [ ] **Step 2: Run test — expect failure (undefined types)**

```bash
go test ./controllers/ -run TestBuildCSSVariables -v
```

- [ ] **Step 3: Implement controller**

Create `controllers/theme.go`:

```go
package controllers

import (
    "fmt"

    "github.com/deluxebear/jetauth/object"
)

// ResolvedThemePayload is the inner "data" of the resolved theme response.
type ResolvedThemePayload struct {
    Theme object.ThemeData `json:"theme"`
    CSS   string           `json:"css"`
}

// ResolvedThemeResponse is the outer envelope.
type ResolvedThemeResponse struct {
    Status string               `json:"status" example:"ok"`
    Msg    string               `json:"msg" example:""`
    Data   ResolvedThemePayload `json:"data"`
}

// GetResolvedTheme merges system/org/app theme layers and returns the result
// plus a pre-formatted CSS :root variable block.
// @Summary GetResolvedTheme
// @Tags Theme API
// @Description Return the merged theme for an application (system → org → app cascade).
// @Param   app   query   string  true   "application id (e.g. admin/app-foo)"
// @Param   mode  query   string  false  "light | dark (default: light)"
// @Success 200 {object} ResolvedThemeResponse "The Response object"
// @Router /get-resolved-theme [get]
func (c *ApiController) GetResolvedTheme() {
    appID := c.Ctx.Input.Query("app")
    if appID == "" {
        c.ResponseError("missing required query param: app")
        return
    }

    app, err := object.GetApplication(appID)
    if err != nil {
        c.ResponseError(err.Error())
        return
    }
    if app == nil {
        c.ResponseError(fmt.Sprintf("application %s does not exist", appID))
        return
    }

    var orgTheme *object.ThemeData
    if app.OrganizationObj != nil {
        orgTheme = app.OrganizationObj.ThemeData
    }
    resolved := object.ResolveTheme(orgTheme, app.ThemeData, nil)
    css := buildCSSVariables(resolved)

    c.Data["json"] = ResolvedThemeResponse{
        Status: "ok",
        Data:   ResolvedThemePayload{Theme: resolved, CSS: css},
    }
    c.ServeJSON()
}

// buildCSSVariables serializes a ThemeData into a :root CSS-variable string
// that the frontend can inject directly into a <style> tag.
func buildCSSVariables(t object.ThemeData) string {
    // Each line is "  --token: value;" terminated with a newline.
    lines := []string{
        fmt.Sprintf("--color-primary: %s;", t.ColorPrimary),
        fmt.Sprintf("--color-cta: %s;", nonEmpty(t.ColorCTA, t.ColorPrimary)),
        fmt.Sprintf("--color-success: %s;", t.ColorSuccess),
        fmt.Sprintf("--color-danger: %s;", t.ColorDanger),
        fmt.Sprintf("--color-warning: %s;", t.ColorWarning),
        fmt.Sprintf("--color-primary-dark: %s;", t.DarkColorPrimary),
        fmt.Sprintf("--color-background-dark: %s;", t.DarkBackground),
        fmt.Sprintf("--radius-md: %dpx;", t.BorderRadius),
        fmt.Sprintf("--radius-lg: %dpx;", t.BorderRadius+4),
        fmt.Sprintf("--font-sans: %s;", t.FontFamily),
        fmt.Sprintf("--font-mono: %s;", t.FontFamilyMono),
        fmt.Sprintf("--spacing-scale: %g;", t.SpacingScale),
    }
    out := ":root {\n"
    for _, l := range lines {
        out += "  " + l + "\n"
    }
    out += "}\n"
    return out
}

func nonEmpty(a, b string) string {
    if a != "" {
        return a
    }
    return b
}
```

- [ ] **Step 4: Register the route**

In `routers/router.go`, find the block where `/api/get-app-login` is registered (around line 46) and add immediately below:

```go
web.Router("/api/get-resolved-theme", &controllers.ApiController{}, "GET:GetResolvedTheme")
```

- [ ] **Step 5: Run tests — expect pass**

```bash
go test ./controllers/ -run "TestBuildCSSVariables|TestResolvedThemeResponse" -v
go build ./...
```

Expected: both PASS; build clean.

- [ ] **Step 6: Smoke-test the endpoint**

```bash
# In one terminal, start the backend (sqlite mode)
go run . &
SERVER_PID=$!
sleep 3

# In another, hit the endpoint
curl -s 'http://localhost:8000/api/get-resolved-theme?app=admin/app-built-in' | jq .

kill $SERVER_PID
```

Expected: JSON with `status:"ok"`, `data.theme.colorPrimary` populated, `data.css` containing `:root { ... }`.

- [ ] **Step 7: Commit**

```bash
git add controllers/theme.go controllers/theme_test.go routers/router.go
git commit -m "feat(api): GET /api/get-resolved-theme returns merged theme + CSS vars

Anonymous endpoint (pre-auth surface). Serves as single source of truth
for the frontend ThemeProvider — callers never merge client-side. CSS
string is ready to drop into a <style> tag."
```

---

## Task W1-T09: providersResolved in /api/get-app-login (B3)

Extend the login response with provider logo URLs and display names pre-resolved, so the frontend doesn't have to do a second roundtrip to show branded OAuth buttons.

**Files:**
- Modify: `controllers/auth.go` (ApplicationLoginResponse)
- Modify: `object/application.go` or new `object/application_providers.go` for the resolver
- Test: `object/application_providers_test.go` (new)

- [ ] **Step 1: Write the failing test**

Create `object/application_providers_test.go`:

```go
package object

import "testing"

func TestResolveProviders_IncludesCoreFields(t *testing.T) {
    app := &Application{
        Providers: []*ProviderItem{
            {
                Name:      "github_1",
                CanSignIn: true,
                Provider: &Provider{
                    Name:        "github_1",
                    DisplayName: "GitHub",
                    Type:        "GitHub",
                    ClientId:    "fake_client_id",
                },
            },
            {
                // Should be excluded: CanSignIn=false.
                Name:      "internal_scim",
                CanSignIn: false,
                Provider:  &Provider{Name: "internal_scim", Type: "SCIM"},
            },
        },
    }
    got := ResolveProviders(app)
    if len(got) != 1 {
        t.Fatalf("expected 1 resolved provider, got %d", len(got))
    }
    p := got[0]
    if p.Name != "github_1" || p.DisplayName != "GitHub" || p.Type != "GitHub" {
        t.Errorf("core fields wrong: %+v", p)
    }
    if p.LogoURL == "" {
        t.Errorf("LogoURL should be populated for known type 'GitHub'")
    }
    if p.ClientID != "fake_client_id" {
        t.Errorf("ClientID should pass through")
    }
}

func TestResolveProviders_UnknownTypeFallsBackToNeutralLogo(t *testing.T) {
    app := &Application{
        Providers: []*ProviderItem{
            {Name: "x", CanSignIn: true, Provider: &Provider{Name: "x", Type: "CustomThing", DisplayName: "X"}},
        },
    }
    got := ResolveProviders(app)
    if len(got) != 1 {
        t.Fatalf("want 1, got %d", len(got))
    }
    if got[0].LogoURL == "" {
        t.Errorf("unknown provider type should get a neutral fallback logo")
    }
}
```

- [ ] **Step 2: Run — expect failure**

```bash
go test ./object/ -run TestResolveProviders -v
```

- [ ] **Step 3: Implement the resolver**

Create `object/application_providers.go`:

```go
package object

// ResolvedProvider is the pre-baked provider info the auth UI needs.
// No secrets leak here — only display-safe values.
type ResolvedProvider struct {
    Name        string `json:"name"`
    DisplayName string `json:"displayName"`
    Type        string `json:"type"`
    LogoURL     string `json:"logoUrl"`
    ClientID    string `json:"clientId"`
    Prompted    bool   `json:"prompted"`
    CanSignUp   bool   `json:"canSignUp"`
    Rule        string `json:"rule"`
}

// providerLogoMap is the canonical mapping of built-in provider types to
// static logo URLs. The frontend ships the actual SVGs in web-new/public/
// and the backend just returns the path so responses stay cache-friendly.
var providerLogoMap = map[string]string{
    "GitHub":    "/providers/github.svg",
    "Google":    "/providers/google.svg",
    "WeChat":    "/providers/wechat.svg",
    "DingTalk":  "/providers/dingtalk.svg",
    "Lark":      "/providers/lark.svg",
    "Gitee":     "/providers/gitee.svg",
    "Gitlab":    "/providers/gitlab.svg",
    "Apple":     "/providers/apple.svg",
    "Microsoft": "/providers/microsoft.svg",
    "LinkedIn":  "/providers/linkedin.svg",
    "SAML":      "/providers/saml.svg",
    "OIDC":      "/providers/oidc.svg",
}

const fallbackProviderLogo = "/providers/generic.svg"

// ResolveProviders filters an application's Providers down to sign-in-enabled
// entries and pre-attaches the logo URL + display-safe metadata.
func ResolveProviders(app *Application) []ResolvedProvider {
    if app == nil || len(app.Providers) == 0 {
        return []ResolvedProvider{}
    }
    out := make([]ResolvedProvider, 0, len(app.Providers))
    for _, pi := range app.Providers {
        if pi == nil || pi.Provider == nil || !pi.CanSignIn {
            continue
        }
        p := pi.Provider
        logo, ok := providerLogoMap[p.Type]
        if !ok {
            logo = fallbackProviderLogo
        }
        out = append(out, ResolvedProvider{
            Name:        pi.Name,
            DisplayName: p.DisplayName,
            Type:        p.Type,
            LogoURL:     logo,
            ClientID:    p.ClientId,
            Prompted:    pi.Prompted,
            CanSignUp:   pi.CanSignUp,
            Rule:        pi.Rule,
        })
    }
    return out
}
```

- [ ] **Step 4: Add the field to `ApplicationLoginResponse`**

Modify `controllers/auth.go:43-48`:

```go
// ApplicationLoginResponse is the response for GetApplicationLogin API.
type ApplicationLoginResponse struct {
    Status             string                    `json:"status" example:"ok"`
    Msg                string                    `json:"msg" example:""`
    Data               object.Application        `json:"data"`
    ProvidersResolved  []object.ResolvedProvider `json:"providersResolved,omitempty"`
}
```

- [ ] **Step 5: Populate the field in the handler**

In `controllers/auth.go` find the end of `GetApplicationLogin()` (around line 400). Before the response is written, inject:

```go
// After `application = object.GetMaskedApplication(application, "")`:
resolvedProviders := object.ResolveProviders(application)
```

And change the final `c.ResponseOk(application)` (or equivalent) to use the new envelope shape. Verify by reading the current handler: likely use `c.Data["json"] = ApplicationLoginResponse{...}` — adjust to include `ProvidersResolved: resolvedProviders`.

- [ ] **Step 6: Run tests + build**

```bash
go test ./object/ -run TestResolveProviders -v
go build ./...
```

- [ ] **Step 7: Smoke test**

```bash
go run . &
SERVER_PID=$!
sleep 3
curl -s 'http://localhost:8000/api/get-app-login?id=admin/app-built-in' | jq '.providersResolved'
kill $SERVER_PID
```

Expected: array (possibly empty if built-in has no providers) with logoUrl entries for any active provider.

- [ ] **Step 8: Commit**

```bash
git add object/application_providers.go object/application_providers_test.go controllers/auth.go
git commit -m "feat(api): /api/get-app-login returns providersResolved[]

Frontend no longer needs a second roundtrip to render branded OAuth
buttons — type, displayName, and logoUrl come pre-baked. Logos live
at /providers/*.svg in web-new/public/ (added in a follow-up commit)."
```

---

## Task W1-T10: Field-Level RBAC in UpdateApplication (B4)

Prevent non-global-admins from mutating `HeaderHtml` / `FooterHtml` / `SignupHtml` / `SigninHtml` / `FormSideHtml`. These are the five raw-HTML injection fields — security surface, global admin only per master-spec decision Q4.

**Files:**
- Modify: `controllers/application.go` (UpdateApplication handler)
- Modify: `object/application.go` (helper function — or inline in controller)
- Test: `controllers/application_rbac_test.go` (new)

- [ ] **Step 1: Write the failing test**

Create `controllers/application_rbac_test.go`:

```go
package controllers

import (
    "testing"

    "github.com/deluxebear/jetauth/object"
)

func TestSanitizeApplicationForNonGlobalAdmin_StripsHTML(t *testing.T) {
    incoming := &object.Application{
        Name:         "app-test",
        HeaderHtml:   "<script>evil()</script>",
        FooterHtml:   "<p>footer</p>",
        SignupHtml:   "<div>signup</div>",
        SigninHtml:   "<div>signin</div>",
        FormSideHtml: "<div>side</div>",
        DisplayName:  "Test App",
    }
    existing := &object.Application{
        Name:         "app-test",
        HeaderHtml:   "<p>existing header</p>",
        FooterHtml:   "<p>existing footer</p>",
        SignupHtml:   "",
        SigninHtml:   "<span>existing signin</span>",
        FormSideHtml: "",
        DisplayName:  "Old Name",
    }
    sanitizeApplicationForNonGlobalAdmin(incoming, existing)

    if incoming.HeaderHtml != existing.HeaderHtml {
        t.Errorf("HeaderHtml should be restored from existing; got %q", incoming.HeaderHtml)
    }
    if incoming.SignupHtml != existing.SignupHtml {
        t.Errorf("SignupHtml should be restored")
    }
    if incoming.FormSideHtml != existing.FormSideHtml {
        t.Errorf("FormSideHtml should be restored")
    }
    if incoming.DisplayName != "Test App" {
        t.Errorf("DisplayName must NOT be touched; got %q", incoming.DisplayName)
    }
}

func TestSanitizeApplicationForNonGlobalAdmin_AllowsSameValue(t *testing.T) {
    incoming := &object.Application{HeaderHtml: "<p>same</p>"}
    existing := &object.Application{HeaderHtml: "<p>same</p>"}
    sanitizeApplicationForNonGlobalAdmin(incoming, existing)
    if incoming.HeaderHtml != "<p>same</p>" {
        t.Errorf("no-op mutation should pass through")
    }
}
```

- [ ] **Step 2: Run — expect undefined `sanitizeApplicationForNonGlobalAdmin`**

```bash
go test ./controllers/ -run TestSanitizeApplicationForNonGlobalAdmin -v
```

- [ ] **Step 3: Implement the sanitizer**

Add to `controllers/application.go` (near top of file, below imports):

```go
// sanitizeApplicationForNonGlobalAdmin rejects edits to raw-HTML injection
// fields unless the caller is a global admin. Mutates `incoming` in place,
// restoring each protected field from `existing` when it differs.
// Per W1 master-spec Q4: HTML fields are global-admin-only.
func sanitizeApplicationForNonGlobalAdmin(incoming, existing *object.Application) {
    if incoming == nil || existing == nil {
        return
    }
    incoming.HeaderHtml = existing.HeaderHtml
    incoming.FooterHtml = existing.FooterHtml
    incoming.SignupHtml = existing.SignupHtml
    incoming.SigninHtml = existing.SigninHtml
    incoming.FormSideHtml = existing.FormSideHtml
}
```

Find the `UpdateApplication` handler (grep for `func (c *ApiController) UpdateApplication()`). Inside, **before** the `UpdateApplication` call to the object layer, insert:

```go
if !c.IsGlobalAdmin() {
    existing, err := object.GetApplication(application.GetId())
    if err != nil {
        c.ResponseError(err.Error())
        return
    }
    sanitizeApplicationForNonGlobalAdmin(&application, existing)
}
```

(Adjust variable names to match the existing handler's local names.)

- [ ] **Step 4: Run tests — expect pass**

```bash
go test ./controllers/ -run TestSanitizeApplicationForNonGlobalAdmin -v
go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add controllers/application.go controllers/application_rbac_test.go
git commit -m "feat(security): restrict HTML injection fields to global admins

HeaderHtml, FooterHtml, SignupHtml, SigninHtml, FormSideHtml are
raw-HTML surfaces. Non-global-admins silently have their edits to
these fields reverted to the prior value. Visual block editor will
fill the gap for org admins in W5."
```

---

## Task W1-T11: web-new/src/auth/ Module Scaffold

Create the folder structure + api client that every later task will build on. Zero UI yet — just types and data-fetchers.

**Files:**
- Create: `web-new/src/auth/api/types.ts`
- Create: `web-new/src/auth/api/getResolvedTheme.ts`
- Create: `web-new/src/auth/api/getAppLogin.ts`
- Create: `web-new/src/auth/README.md`

- [ ] **Step 1: Create `types.ts`**

```typescript
// web-new/src/auth/api/types.ts
export interface ResolvedTheme {
  themeType: string;
  colorPrimary: string;
  colorCTA: string;
  colorSuccess: string;
  colorDanger: string;
  colorWarning: string;
  darkColorPrimary: string;
  darkBackground: string;
  borderRadius: number;
  isCompact: boolean;
  isEnabled: boolean;
  fontFamily: string;
  fontFamilyMono: string;
  spacingScale: number;
}

export interface ResolvedThemePayload {
  theme: ResolvedTheme;
  css: string;
}

export interface ResolvedProvider {
  name: string;
  displayName: string;
  type: string;
  logoUrl: string;
  clientId: string;
  prompted: boolean;
  canSignUp: boolean;
  rule: string;
}

export interface SigninMethod {
  name: string;
  displayName: string;
  rule: string;
}

export interface SignupItem {
  name: string;
  visible: boolean;
  required: boolean;
  prompted: boolean;
  type: string;
  customCss: string;
  label: string;
  placeholder: string;
  options: string[];
  regex: string;
  rule: string;
}

export interface SigninItem {
  name: string;
  visible: boolean;
  label: string;
  customCss: string;
  placeholder: string;
  rule: string;
  isCustom: boolean;
}

export interface AuthApplication {
  name: string;
  organization: string;
  displayName: string;
  logo: string;
  favicon: string;
  title: string;
  homepageUrl: string;
  enablePassword: boolean;
  enableSignUp: boolean;
  enableGuestSignin: boolean;
  disableSignin: boolean;
  enableAutoSignin: boolean;
  enableCodeSignin: boolean;
  enableWebAuthn: boolean;
  orgChoiceMode: string;
  formOffset: number;
  formBackgroundUrl: string;
  formBackgroundUrlMobile: string;
  formCss: string;
  formCssMobile: string;
  formSideHtml: string;
  headerHtml: string;
  footerHtml: string;
  signinHtml: string;
  signupHtml: string;
  signinMethods: SigninMethod[];
  signupItems: SignupItem[];
  signinItems: SigninItem[];
  themeData?: ResolvedTheme | null;
  organizationObj?: {
    name: string;
    displayName: string;
    logo: string;
    logoDark: string;
    favicon: string;
    themeData?: ResolvedTheme | null;
    countryCodes?: string[];
    languages?: string[];
  } | null;
}

export interface AppLoginResponse {
  status: "ok" | "error";
  msg?: string;
  data: AuthApplication;
  providersResolved: ResolvedProvider[];
}
```

- [ ] **Step 2: Create `getResolvedTheme.ts`**

```typescript
// web-new/src/auth/api/getResolvedTheme.ts
import { api } from "../../api/client";
import type { ResolvedThemePayload } from "./types";

export async function getResolvedTheme(appId: string): Promise<ResolvedThemePayload> {
  const res = await api.get<{ status: string; msg?: string; data: ResolvedThemePayload }>(
    `/api/get-resolved-theme?app=${encodeURIComponent(appId)}`
  );
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to load resolved theme");
  }
  return res.data;
}
```

- [ ] **Step 3: Create `getAppLogin.ts`**

```typescript
// web-new/src/auth/api/getAppLogin.ts
import { api } from "../../api/client";
import type { AppLoginResponse, AuthApplication, ResolvedProvider } from "./types";

export interface LoadedApp {
  application: AuthApplication;
  providers: ResolvedProvider[];
}

export async function getAppLogin(appId: string): Promise<LoadedApp> {
  const res = await api.get<AppLoginResponse>(
    `/api/get-app-login?id=${encodeURIComponent(appId)}`
  );
  if (res.status !== "ok" || !res.data) {
    throw new Error(res.msg || "failed to load application");
  }
  return {
    application: res.data,
    providers: res.providersResolved ?? [],
  };
}
```

- [ ] **Step 4: Create `README.md`**

```markdown
# web-new/src/auth/

New data-driven auth surface (Auth UI Revamp, 2026-04).

## Layout
- `api/`         Data fetchers + TypeScript types
- `shell/`       Layout primitives (added W3)
- `signin/`     Login flow (added W2)
- `signup/`     Signup flow (added W3)
- `items/`      Signin-item slot components (added W3)
- `html/`       Safe HTML renderers (added W5)

Every component in this module MUST consume the theme tokens from
`ThemeProvider` (added alongside this scaffold) — never reach into
raw hex values or `organizationObj.themeData` directly.
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd web-new
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web-new/src/auth/
git commit -m "scaffold(web-new): introduce auth/ module with API types + fetchers

New home for login/signup UI. Types mirror backend structs from
object/application.go and object/theme_resolver.go. Fetchers wrap
the endpoints added in this week's backend tasks (B2, B3)."
```

---

## Task W1-T12: ThemeProvider Component

React context + CSS-variable injector. Single source of truth for all auth-UI components.

**Files:**
- Create: `web-new/src/auth/ThemeProvider.tsx`
- Create: `web-new/src/auth/__tests__/ThemeProvider.test.tsx`

- [ ] **Step 1: Install vitest + testing-library if not present**

```bash
cd web-new
grep -q '"vitest"' package.json || npm install --save-dev vitest @testing-library/react @testing-library/jest-dom happy-dom
```

Add to `package.json` scripts: `"test": "vitest run"`.

Create `web-new/vitest.config.ts` if it doesn't exist:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `web-new/src/auth/__tests__/ThemeProvider.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useAuthTheme } from "../ThemeProvider";

vi.mock("../api/getResolvedTheme", () => ({
  getResolvedTheme: vi.fn().mockResolvedValue({
    theme: {
      themeType: "default",
      colorPrimary: "#00FF00",
      colorCTA: "#FF8800",
      colorSuccess: "", colorDanger: "", colorWarning: "",
      darkColorPrimary: "#88FFBB", darkBackground: "#0F1117",
      borderRadius: 10, isCompact: false, isEnabled: true,
      fontFamily: "Inter", fontFamilyMono: "JetBrains Mono",
      spacingScale: 1,
    },
    css: ":root {\n  --color-primary: #00FF00;\n  --color-cta: #FF8800;\n}\n",
  }),
}));

function ProbeTheme() {
  const t = useAuthTheme();
  return <div data-testid="probe">{t?.colorPrimary ?? "loading"}</div>;
}

describe("ThemeProvider", () => {
  it("loads resolved theme and exposes it via useAuthTheme", async () => {
    render(
      <ThemeProvider appId="admin/app-test">
        <ProbeTheme />
      </ThemeProvider>
    );
    expect(screen.getByTestId("probe").textContent).toBe("loading");
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("#00FF00");
    });
  });

  it("injects a <style> tag with the CSS payload", async () => {
    render(
      <ThemeProvider appId="admin/app-test">
        <div />
      </ThemeProvider>
    );
    await waitFor(() => {
      const style = document.querySelector("style[data-auth-theme]");
      expect(style?.textContent).toContain("--color-primary: #00FF00");
    });
  });
});
```

- [ ] **Step 3: Run test — expect failure**

```bash
npm test -- ThemeProvider
```

- [ ] **Step 4: Implement `ThemeProvider.tsx`**

```typescript
// web-new/src/auth/ThemeProvider.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getResolvedTheme } from "./api/getResolvedTheme";
import type { ResolvedTheme } from "./api/types";

const ThemeContext = createContext<ResolvedTheme | null>(null);

export function useAuthTheme(): ResolvedTheme | null {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  appId: string;
  children: ReactNode;
}

/**
 * Loads the resolved theme from /api/get-resolved-theme and injects its
 * CSS-variable payload into a <style data-auth-theme> tag in the document
 * head. Children receive the theme via the useAuthTheme() hook.
 */
export function ThemeProvider({ appId, children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ResolvedTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    getResolvedTheme(appId)
      .then((payload) => {
        if (cancelled) return;
        setTheme(payload.theme);
        let tag = document.querySelector<HTMLStyleElement>("style[data-auth-theme]");
        if (!tag) {
          tag = document.createElement("style");
          tag.setAttribute("data-auth-theme", "");
          document.head.appendChild(tag);
        }
        tag.textContent = payload.css;
      })
      .catch((err) => {
        console.error("[ThemeProvider] failed to load theme:", err);
        // Leave theme as null — components fall back to tailwind defaults.
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test -- ThemeProvider
```

Expected: 2/2 pass.

- [ ] **Step 6: Commit**

```bash
git add web-new/src/auth/ThemeProvider.tsx web-new/src/auth/__tests__/ThemeProvider.test.tsx web-new/vitest.config.ts web-new/package.json web-new/package-lock.json
git commit -m "feat(auth): ThemeProvider loads resolved theme + injects CSS vars

Wraps the auth surface so every component reads a single ResolvedTheme.
CSS payload is injected into <style data-auth-theme> on the document
head. Children get the theme object via useAuthTheme()."
```

---

## Task W1-T13: AuthShell Skeleton + Wire App.tsx, Delete Old Pages

Replace the old hardcoded `pages/Login.tsx` and `pages/Signup.tsx` with a minimal `AuthShell` that verifies the theme pipeline works end-to-end. W2 fills in the real auth logic.

**Files:**
- Create: `web-new/src/auth/AuthShell.tsx`
- Modify: `web-new/src/App.tsx`
- Delete: `web-new/src/pages/Login.tsx`
- Delete: `web-new/src/pages/Signup.tsx`

- [ ] **Step 1: Create the skeleton `AuthShell.tsx`**

```typescript
// web-new/src/auth/AuthShell.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ThemeProvider, useAuthTheme } from "./ThemeProvider";
import { getAppLogin } from "./api/getAppLogin";
import type { AuthApplication, ResolvedProvider } from "./api/types";

type Mode = "signin" | "signup";

interface AuthShellProps {
  mode: Mode;
}

export default function AuthShell({ mode }: AuthShellProps) {
  const params = useParams<{ applicationName?: string; organizationName?: string }>();
  const appId =
    params.applicationName
      ? `admin/${params.applicationName}`
      : params.organizationName
      ? `admin/app-${params.organizationName}`
      : "admin/app-built-in";

  return (
    <ThemeProvider appId={appId}>
      <AuthShellInner appId={appId} mode={mode} />
    </ThemeProvider>
  );
}

function AuthShellInner({ appId, mode }: { appId: string; mode: Mode }) {
  const theme = useAuthTheme();
  const [app, setApp] = useState<AuthApplication | null>(null);
  const [providers, setProviders] = useState<ResolvedProvider[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getAppLogin(appId)
      .then(({ application, providers }) => {
        setApp(application);
        setProviders(providers);
      })
      .catch((e) => setError(e.message ?? "failed to load"));
  }, [appId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-[14px] text-text-muted">{error}</p>
      </div>
    );
  }
  if (!app) {
    return <div className="min-h-screen flex items-center justify-center">loading…</div>;
  }

  // W1 placeholder surface — proves the theme pipeline works.
  // W2 replaces the body with the real sign-in orchestrator.
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{
        backgroundColor: "var(--color-background, #f8fafc)",
        fontFamily: "var(--font-sans, Inter)",
      }}
    >
      <div
        className="max-w-md w-full p-8 bg-white border border-gray-200 shadow-sm"
        style={{
          borderRadius: "var(--radius-lg, 12px)",
        }}
      >
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--color-primary, #2563EB)" }}
        >
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {app.displayName || app.name} · W1 skeleton — real auth flow arrives in W2.
        </p>

        <div className="text-[12px] font-mono text-gray-400 p-3 bg-gray-50 rounded">
          theme.colorPrimary = <span className="text-black">{theme?.colorPrimary ?? "—"}</span>
          <br />
          providers = <span className="text-black">{providers.length}</span>
          <br />
          signinMethods = <span className="text-black">{app.signinMethods?.length ?? 0}</span>
          <br />
          formOffset = <span className="text-black">{app.formOffset ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire routes in `App.tsx`**

Replace the current login/signup imports and route declarations. Find in `web-new/src/App.tsx`:

```typescript
import Login from "./pages/Login";
import Signup from "./pages/Signup";
```

Replace with:

```typescript
import AuthShell from "./auth/AuthShell";
```

Find the route declarations (`<Route path="/login/:organizationName" element={<Login … />}`) and replace all `Login`/`Signup` element usages with:

```typescript
<Route path="/login" element={<AuthShell mode="signin" />} />
<Route path="/login/:organizationName" element={<AuthShell mode="signin" />} />
<Route path="/login/:organizationName/:applicationName" element={<AuthShell mode="signin" />} />
<Route path="/signup" element={<AuthShell mode="signup" />} />
<Route path="/signup/:applicationName" element={<AuthShell mode="signup" />} />
```

Remove any `onLogin` / `error` / `themeData` props that used to flow into the old Login component — the new shell is self-contained.

- [ ] **Step 3: Delete the old pages**

```bash
cd /Users/xiongyanlin/projects/jetauth
git rm web-new/src/pages/Login.tsx web-new/src/pages/Signup.tsx
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd web-new
npx tsc --noEmit
```

Expected: zero errors. If anything else in the codebase imported from `pages/Login` or `pages/Signup`, the failure will surface here — fix each import to route through `auth/` or remove if dead.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: clean build (i18n check passes, tsc passes, vite bundles).

- [ ] **Step 6: Manual smoke (optional but recommended)**

```bash
# In terminal 1:
cd /Users/xiongyanlin/projects/jetauth
go run .

# In terminal 2:
cd web-new
npm run dev

# Open http://localhost:5173/login in a browser.
# Expected:
#   - Page loads with "Sign in" heading
#   - Debug panel shows theme.colorPrimary populated
#   - providers/signinMethods/formOffset reflect the app config
#
# Then, in the admin UI, edit admin/app-built-in → change ColorPrimary to #FF0000.
# Refresh /login — the heading color should now be red.
```

- [ ] **Step 7: Commit**

```bash
git add web-new/src/App.tsx web-new/src/auth/AuthShell.tsx
git rm web-new/src/pages/Login.tsx web-new/src/pages/Signup.tsx
git commit -m "feat(auth): introduce AuthShell skeleton; retire old Login/Signup pages

AuthShell is the new data-driven root for /login and /signup routes.
It wraps children in ThemeProvider and fetches the application via
/api/get-app-login (now including providersResolved). Body is a
W1 placeholder that proves the theme pipeline end-to-end by
displaying raw theme tokens; W2 replaces it with the real
identifier-first sign-in flow.

Old web-new/src/pages/Login.tsx and Signup.tsx are deleted — they
were ~950 lines of hardcoded UI that ignored every customization
field."
```

---

## Wrap-up

Final W1 state:
- Old `web/` gone, `web-new/build` is the sole frontend served by the binary
- `ThemeData` extended (9 new fields) + `ResolveTheme` merge engine + `/api/get-resolved-theme`
- `/api/get-app-login` returns `providersResolved[]`
- Field-level RBAC blocks non-global-admins from editing HTML injection fields
- `web-new/src/auth/` module scaffolded; `ThemeProvider` injects CSS vars
- `AuthShell` routes `/login` + `/signup` to a themed placeholder
- All backend tests + frontend tsc + vitest green; i18n parity enforced by CI

**Demo for end-of-W1 review:** in admin, change the primary color on any application; the `/login/<app>` page reflects it within a browser refresh (no code change, no redeploy).

**Not in W1 (deferred):** real sign-in forms, signup forms, layouts, HTML injection rendering, live-preview iframe, drag-sort, classic-mode fallback. Those are W2–W5.
