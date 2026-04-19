# Template Manifest Authoring Guide

Date: 2026-04-19
Audience: people writing auth-UI template manifests — either for the in-repo gallery or a remote registry.
Scope: the JSON contract, the two flavors (L2 layout-based / legacy CSS-overlay), per-template options, security rules, versioning, hosting.

---

## 1. What a manifest is

A manifest is a JSON object (or a TypeScript `AuthTemplate` literal) that says: "when the admin clicks Apply on me, **write these fields into the Application**". The admin can continue editing afterwards — the manifest only *seeds* state, it does not lock anything.

At apply time the gallery writes into three slots on the Application:

```
application.template         ← config.template
application.templateOptions  ← merge(prev.templateOptions, config.templateOptions, _manifest)
application.themeData        ← merge(prev.themeData, config.themeData, {isEnabled: true})
application.<scalar fields>  ← direct overwrite (formOffset / formSideHtml / CSS / HTML slots ...)
```

The only field the gallery adds on its own is a tombstone:

```jsonc
templateOptions._manifest = { "id": "...", "version": "..." }
```

That tombstone is how the gallery later shows "Current" and "Update to vX" badges.

**What a manifest must NOT touch** (these are identity / structure, not presentation):

```
name, organization, displayName, logo, favicon,
signinMethods, signupItems, signinItems
```

---

## 2. Two authoring flavors

### 2a. L2 layout-based (recommended for new manifests)

Set `config.template` to one of the layout ids. The runtime then uses that layout file and passes `config.templateOptions` to it.

```jsonc
{
  "id": "prism-split",
  "version": "1.0.0",
  "name": "Prism split",
  "description": "Vibrant purple → pink hero panel on the left.",
  "preview": "<svg ...>...</svg>",
  "config": {
    "template": "split-hero",
    "templateOptions": {
      "heroHeadline": { "en": "Build something brilliant", "zh": "让创意落地成真" },
      "heroSide": "left",
      "overlayOpacity": 0.3
    },
    "themeData": {
      "colorPrimary": "#9333EA",
      "darkColorPrimary": "#A855F7",
      "borderRadius": 10,
      "themeType": "light"
    }
  }
}
```

Pros: responsive and a11y come from the layout file. The manifest stays ~30 lines. The admin can swap layouts later without editing HTML.

### 2b. Legacy CSS-overlay

Leave `config.template` unset. Use `formSideHtml` / `formCss` / `headerHtml` to paint on top of whatever layout the admin already picked.

```jsonc
{
  "id": "neon-split",
  "version": "1.0.0",
  "name": "Neon split",
  "description": "Dark hero with pulsing neon accent.",
  "preview": "<svg ...>...</svg>",
  "config": {
    "formOffset": 4,
    "formSideHtml": "<div style=\"min-height:100vh;...\">...</div>",
    "formCss": ".auth-submit { animation: ... }",
    "themeData": { "colorPrimary": "#00E599", "themeType": "dark" }
  }
}
```

Use this only when you need arbitrary HTML a layout template can't express. It ships a lot more bytes and breaks layout swapping. If you find yourself copying the same HTML into three manifests, you're actually writing a new layout template — add it to `web-new/src/auth/templates/` instead.

---

## 3. Top-level schema

```ts
interface AuthTemplate {
  id: string;          // kebab-case, must match /^[a-z0-9-]+$/
  version: string;     // semver — bump when config changes substantially
  name: string;        // shown on the gallery card
  description: string; // one-sentence hook
  preview: string;     // inline SVG, ~240×140
  config: { ... };     // see §4
}
```

Rules:
- `id` is a **persistence key**. It ends up in `templateOptions._manifest.id`. Never rename a published manifest — ship a new id if the design changes radically.
- `version` is a **semver string**. The gallery stores `{id, version}` on apply and shows "Update to vX" when the registry version is newer than the stored version.
- Ids with bad characters (spaces, uppercase, `!`) are dropped silently by the remote registry validator (`web-new/src/pages/admin-preview/remoteRegistry.ts:158`).

---

## 4. `config` schema reference

```ts
interface Config {
  // ── L2 layout path ──────────────────────────────────────────────────
  template?: "centered-card" | "split-hero" | "full-bleed"
            | "minimal-inline" | "sidebar-brand";
  templateOptions?: Record<string, unknown>; // shape depends on template, see §5

  // ── Theme tokens (L1) — overlay on app.themeData ────────────────────
  themeData?: {
    colorPrimary?: string;     // hex like "#2563EB"
    darkColorPrimary?: string; // used when themeType=dark or OS prefers dark
    borderRadius?: number;     // px, 0–20
    fontFamily?: string;       // CSS font stack, e.g. "'Inter', sans-serif"
    themeType?: "light" | "dark" | "auto";
    // Less commonly set:
    colorCTA?: string; colorSuccess?: string; colorDanger?: string; colorWarning?: string;
    darkBackground?: string; isCompact?: boolean; isEnabled?: boolean;
    fontFamilyMono?: string; spacingScale?: number;
  };

  // ── Legacy overlay scalars (L4) — direct overwrite ──────────────────
  formOffset?: number;               // -10 … 10, vertical nudge in rem
  formBackgroundUrl?: string;        // desktop background image
  formBackgroundUrlMobile?: string;  // optional mobile variant
  formSideHtml?: string;             // HTML for the side panel
  formCss?: string;                  // scoped CSS
  formCssMobile?: string;
  headerHtml?: string;
  footerHtml?: string;
  signinHtml?: string;               // variant-specific HTML (signin only)
  signupHtml?: string;
}
```

Validation (`validateOne` in `remoteRegistry.ts:154`): missing top-level `id` / `version` / `name` / `config` → manifest is silently skipped. Unknown keys in `config` are stripped (forward-compat with future schema versions).

---

## 5. Per-template `templateOptions` reference

These are the `templateOptions` shapes each L2 layout understands. Fields not listed are ignored. All fields are optional — omit to accept the default.

### 5.1 `centered-card`

No options. Field ignored if set. Pair with `themeData` only.

### 5.2 `split-hero`

```ts
{
  heroImageUrl?: string;       // light-mode image URL (empty → gradient fallback)
  heroImageUrlDark?: string;   // dark-mode image URL (empty → reuse light)
  heroHeadline?: string | { en: string; zh: string };   // bilingual — see §7
  heroSubcopy?:  string | { en: string; zh: string };
  heroSide?: "left" | "right"; // default "left"
  overlayOpacity?: number;     // 0–1, default 0.35
}
```

Behavior on mobile: hero panel hides at `< lg` breakpoint, form takes full width.

### 5.3 `full-bleed`

```ts
{
  backgroundImageUrl?: string;
  backgroundImageUrlDark?: string;
  overlayOpacity?: number;                    // 0–1, default 0.4
  glassBlur?: number;                         // 0–40 px, default 16
  cardStyle?: "glass" | "solid";              // default "glass"
  formPosition?: "center" | "top-center" | "bottom-center"; // default "center"
}
```

Use `cardStyle: "solid"` when the background photo kills form contrast.

### 5.4 `minimal-inline`

No options. Pair with `themeData` only.

### 5.5 `sidebar-brand`

```ts
{
  sidebarWidth?: "narrow" | "standard" | "wide";     // 200 / 280 / 340 px
  sidebarBackground?: "surface" | "accent" | "gradient";
  sidebarFeatureList?: string[];                     // max 8 shown, empty strings filtered
  sidebarFooterText?: string | { en: string; zh: string };
}
```

Below `lg` the sidebar hides and the page falls back to a stacked Centered layout.

---

## 6. `themeData` — what actually shows up

- `colorPrimary` drives `--color-primary`, primary button background, focus rings, link color.
- `darkColorPrimary` is read instead of `colorPrimary` when the app's resolved theme is dark (via `themeType: "dark"` or OS preference when `themeType: "auto"`).
- `borderRadius` is the global radius token (cards, inputs, buttons share it — `0` = sharp corners).
- `fontFamily` accepts any CSS font stack. Use `"inherit"` to defer to the host page's font.

Setting `themeData` **merges** with the existing `app.themeData` — any key the manifest omits is preserved. The gallery always sets `isEnabled: true` after a merge.

---

## 7. Bilingual fields (the `pickLang` rule)

Any field in `templateOptions` that surfaces as user-visible copy accepts either a plain string or `{ en, zh }`. At render time the template calls `pickLang(value, locale)` which:

- If value is a string → returns it verbatim (works for legacy manifests).
- If value is an object → returns `value[locale]` or `value.en` as fallback.

Bilingual fields in the shipping templates: `heroHeadline`, `heroSubcopy`, `sidebarFooterText`. Extend by wiring through `pickLang` inside the template component.

Single-language shortcut:
```jsonc
"heroHeadline": "Sign in to Atrium"
```

Bilingual:
```jsonc
"heroHeadline": { "en": "Sign in to Atrium", "zh": "登录到 Atrium" }
```

---

## 8. Preview SVG conventions

`preview` is an inline SVG string rendered via `dangerouslySetInnerHTML` on the gallery card (~220 × 140 on screen).

Rules:
- Use `viewBox="0 0 240 140"` and `preserveAspectRatio="xMidYMid slice"` so it scales cleanly.
- Keep under ~40 logical lines — gallery pages pay the byte cost for every manifest.
- No external URLs. No `<script>`. No event handlers. Image fills via solid rects + simple shapes only.
- Echo the actual template: split previews should show the split, full-bleed should show a background, etc. Mismatched previews erode trust.

Look at the existing `PREVIEW_PRISM_SPLIT` / `PREVIEW_AURORA_GLASS` / `PREVIEW_ATRIUM_SIDEBAR` constants in `web-new/src/pages/admin-preview/templates.ts` for reference.

---

## 9. HTML & CSS injection rules (legacy flavor)

Fields that accept HTML: `signinHtml`, `signupHtml`, `headerHtml`, `footerHtml`, `formSideHtml`.
Fields that accept CSS: `formCss`, `formCssMobile`.

Two lines of defense:

1. **Validation at registry load** (`remoteRegistry.ts:170`) — any HTML field matching `/\<script\b|javascript:/i` rejects the **entire manifest**. Fail closed, before sanitization.
2. **DOMPurify at render** — strips event handlers, `<script>`, and any attribute not in the safe allowlist.

Allowed: structural tags (`div`, `span`, `p`, `h1`–`h6`, `ul`, `li`, `img`, `a`), inline `style`, `class`, `href` (but `javascript:` is rejected by the validator above).

**Placeholder pitfall:** strings like `{{displayName}}` in HTML are **not** interpolated — they render literally. There is no template engine. If you want the app's display name to appear, that's fine for internal JetAuth team manifests (which know the single brand), but shipping a third-party manifest with `{{displayName}}` just puts that literal text on the screen.

---

## 10. Versioning semantics

Bump `version` (semver) when the `config` block changes substantially:

- **Patch** (1.0.0 → 1.0.1): typos, tiny color tweaks, SVG polish.
- **Minor** (1.0.0 → 1.1.0): new option added with a safe default. Existing applied apps keep working.
- **Major** (1.0.0 → 2.0.0): removed / renamed option, changed `template`, or overhauled the visual. Admins will see "Update to v2.0.0" and should expect their instance to shift.

Do **not** bump version when nothing about the visible config changed — the update badge is trying to mean something. Noise breaks it.

The gallery records `{id, version}` inside `templateOptions._manifest` at apply time. Rewriting history (re-publishing `1.0.0` with different config) is a lie to everyone with that version stored — ship a new version instead.

---

## 11. Hosting as a remote registry

Admins add registry URLs through the gallery's ⚙️ Settings panel. The client fetches them with `credentials: "omit"` and an 8-second timeout, then caches the response for 5 min in `sessionStorage`.

### 11a. Payload shape

Either is accepted:

```jsonc
// Bare array
[
  { "id": "...", "version": "1.0.0", "name": "...", "config": {...} }
]
```

```jsonc
// Wrapper (recommended — leaves room for metadata)
{
  "manifests": [
    { "id": "...", ... }
  ]
}
```

### 11b. HTTP contract

- `Content-Type: application/json; charset=utf-8`
- `Access-Control-Allow-Origin: *` (or the admin console's origin)
- `HTTP 200` for success. Any non-200 → whole registry is marked failed and hidden from the gallery until the admin refreshes.

### 11c. What gets rejected silently

Drops the **individual manifest**, rest of the registry still loads:
- `id` missing, empty, or fails `/^[a-z0-9-]+$/`.
- `version`, `name`, or `config` missing.
- Any HTML field containing `<script` or `javascript:`.

Drops the **whole payload**:
- Not JSON, or not an array / `{manifests: []}` wrapper.
- Every manifest in the payload was rejected.

### 11d. Third-party badge

Any manifest loaded from a remote URL carries a "Globe {host}" badge in the gallery — admins see at a glance that it's not curated. There is **no signature verification yet**; a v1.2 enhancement tracked in `docs/2026-04-19-template-store-proposal.md` adds Ed25519 signatures for this tier.

---

## 12. Complete examples

### 12a. Minimal L2 manifest (colors only on top of `centered-card`)

```jsonc
{
  "id": "midnight-centered",
  "version": "1.0.0",
  "name": "Midnight centered",
  "description": "Dark theme, centered — the quiet option.",
  "preview": "<svg viewBox=\"0 0 240 140\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"240\" height=\"140\" fill=\"#0A0A0A\"/><rect x=\"80\" y=\"34\" width=\"80\" height=\"72\" rx=\"8\" fill=\"#1F2937\"/><rect x=\"92\" y=\"88\" width=\"56\" height=\"10\" rx=\"3\" fill=\"#60A5FA\"/></svg>",
  "config": {
    "template": "centered-card",
    "themeData": {
      "colorPrimary": "#60A5FA",
      "darkColorPrimary": "#93C5FD",
      "borderRadius": 8,
      "themeType": "dark"
    }
  }
}
```

### 12b. Full L2 split-hero manifest

```jsonc
{
  "id": "atrium-split",
  "version": "1.2.0",
  "name": "Atrium split",
  "description": "Amber accent, marketing copy on the left.",
  "preview": "<svg ...>...</svg>",
  "config": {
    "template": "split-hero",
    "templateOptions": {
      "heroImageUrl": "https://cdn.example.com/atrium/hero.webp",
      "heroImageUrlDark": "https://cdn.example.com/atrium/hero-dark.webp",
      "heroHeadline": { "en": "Ship faster with Atrium", "zh": "使用 Atrium 更快地交付" },
      "heroSubcopy":  { "en": "Single sign-on across every workspace.", "zh": "一次登录，贯穿所有工作区。" },
      "heroSide": "left",
      "overlayOpacity": 0.35
    },
    "themeData": {
      "colorPrimary": "#F59E0B",
      "darkColorPrimary": "#FBBF24",
      "borderRadius": 8,
      "themeType": "light"
    }
  }
}
```

### 12c. Legacy CSS-overlay manifest

```jsonc
{
  "id": "festive-header",
  "version": "1.0.0",
  "name": "Festive header",
  "description": "Banner across the top for seasonal campaigns.",
  "preview": "<svg ...>...</svg>",
  "config": {
    "headerHtml": "<div style=\"padding:10px 16px;background:#DC2626;color:#fff;text-align:center;font-size:13px;\">Spring sale — 30% off new seats this week only.</div>",
    "themeData": { "colorPrimary": "#DC2626" }
  }
}
```

Note: no `template` field, so this applies **on top of** whatever layout the admin already has. That's the point — legacy overlay manifests are additive.

### 12d. Remote registry payload (three manifests)

```json
{
  "manifests": [
    { "id": "midnight-centered", "version": "1.0.0", ... },
    { "id": "atrium-split",      "version": "1.2.0", ... },
    { "id": "festive-header",    "version": "1.0.0", ... }
  ]
}
```

---

## 13. Testing your manifest

Locally, before publishing:

1. Drop the manifest into `web-new/src/pages/admin-preview/templates.ts` `AUTH_TEMPLATES` array temporarily (or host it on `http://localhost:8080/manifests.json` and add that URL in the gallery's settings).
2. `cd web-new && bun run dev`.
3. Open the Application Edit page → 界面定制 tab → 模板商店 button.
4. Click **查看大图** on your card to see the full-screen preview (desktop / tablet / mobile toggle).
5. Click **应用** and verify the post-apply state in the 布局模板 / 主题 Tokens panels matches expectation.
6. Check at least the three variants: signin / signup / forgot.

Automated: extend `web-new/e2e/templates.spec.ts` with a matrix row for your template id + variant. See the `TEMPLATE_SIGNATURES` map for existing selector-based assertions.

---

## 14. Common pitfalls

| Symptom | Cause |
|---|---|
| Manifest missing from the gallery after registry add | Silent validator drop. Check `id` charset (`/^[a-z0-9-]+$/`) and that `version`/`name`/`config` are all non-empty. |
| `<script>` stripped at render but loaded from registry | Never loaded — validator rejects the whole manifest first. Fix the HTML. |
| "Update to v1.0.1" badge never goes away | Admin applied v1.0.0, registry now says v1.0.1. Clicking the card re-applies and updates the tombstone. |
| Swapping to a different L2 layout wiped my hero copy | Expected — `templateOptions` keys are scoped to the active template. Store per-layout overrides in separate manifests, not in one. |
| `{{displayName}}` shows up literally on the login page | There is no interpolation. Remove the placeholder or hard-code the brand name. |
| Gradient preview looks great, rendered page looks flat | `config.preview` is just a gallery card. The actual page renders the layout component with your `templateOptions` — they have to match visually. If they don't, the preview is lying. |
| `fontFamily: "Inter"` does nothing | CSS-level: the font has to be loaded by the host page. Either use a system stack (`"Inter, sans-serif"` + `@font-face` elsewhere), or `"inherit"`. |

---

## 15. Checklist before publishing

- [ ] `id` is kebab-case, never used before, never shipped under a different config.
- [ ] `version` is semver. Bumped from the previous published value (or `1.0.0` on first publish).
- [ ] `preview` SVG visually matches the runtime result.
- [ ] Every option you set has been through manual test in all three variants (signin / signup / forget).
- [ ] No `<script>` or `javascript:` in any HTML field.
- [ ] Bilingual fields use `{ en, zh }` if the copy is translated, plain strings if not.
- [ ] `themeData.colorPrimary` contrasts ≥ 4.5:1 against the form background it ends up on.
- [ ] Dark mode variant checked if `darkColorPrimary` is set.
- [ ] Remote registry payload passes `validateRegistryPayload` (the vitest suite in `__tests__/remoteRegistry.test.ts` is a useful local harness).
