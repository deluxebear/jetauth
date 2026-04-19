# Template Store Proposal

**Date**: 2026-04-19
**Status**: Design proposal. Not yet built.
**Relates to**: `docs/2026-04-19-auth-template-gallery.md` (the five-template in-tree gallery ships in M1–M2; this doc covers the "how do community templates plug in without shipping a PR" question).

---

## TL;DR

Community templates **cannot ship custom React components** — that's a straight path to RCE in the auth page. The tractable version is: a community template is a signed JSON manifest that overlays `themeData` + `templateOptions` on top of one of the five built-in layout templates. Admins browse a registry, pick one, it gets copied into their application's config. No remote code runs at sign-in time.

This preserves 95% of the "install a pretty template" user value — brand colors, hero imagery, layout option combinations, copy — without opening the auth page up to an unbounded code-execution surface.

---

## 1. Why not "download a React component from a URL"

- The auth pages run in the same origin as the application. A compromised community template could steal credentials, reshape the DOM to phish, or exfiltrate session tokens.
- Even a sandboxed iframe doesn't help — the whole point of an auth page is to collect credentials, so anything rendering on it inherits the trust.
- Subresource Integrity + CSP narrow the surface but don't remove it. A template author who goes rogue after a version bump still wins.
- We have *five* battle-tested layouts already. Giving community authors a *data* surface (tokens + options) that drives those layouts is almost as expressive and dramatically safer.

The rule: **no custom code from untrusted sources on the auth page. Ever.**

---

## 2. What a community template *is*

```jsonc
{
  "$schema": "https://jetauth.example.com/schemas/template-manifest/v1.json",
  "id": "acme-onyx",                    // globally unique, kebab-case
  "version": "1.2.0",                   // semver
  "name": { "en": "Acme Onyx", "zh": "Acme 曜石" },
  "description": {
    "en": "Dark-on-dark glass card with a neon accent — fintech-ish.",
    "zh": "深色玻璃卡片搭霓虹主色,金融科技风。"
  },
  "preview": "https://cdn.example.com/acme-onyx/preview.png",
  "author": {
    "name": "Acme Design",
    "url": "https://example.com",
    "email": "design@example.com"
  },
  "license": "MIT",
  "extends": "full-bleed",              // MUST be one of the built-in template ids
  "themeData": {
    "colorPrimary": "#9333EA",
    "darkColorPrimary": "#A855F7",
    "borderRadius": 4,
    "fontFamily": "\"Space Grotesk\", system-ui, sans-serif"
  },
  "templateOptions": {
    "backgroundImageUrl": "https://cdn.example.com/acme-onyx/bg.jpg",
    "backgroundImageUrlDark": "https://cdn.example.com/acme-onyx/bg-dark.jpg",
    "overlayOpacity": 0.45,
    "glassBlur": 20,
    "cardStyle": "glass",
    "formPosition": "center"
  },
  "signinHtml": "<p class=\"text-center text-[11px] text-text-muted mt-6\">© Acme 2026</p>"
}
```

### Allowed fields on the manifest

| Field | Purpose | Notes |
|---|---|---|
| `id`, `version`, `name`, `description`, `preview`, `author`, `license` | Metadata | Required for discovery |
| `extends` | Built-in layout to base on | Must be one of `centered-card` / `split-hero` / `full-bleed` / `minimal-inline` / `sidebar-brand`. Rejected otherwise. |
| `themeData` | L1 tokens | Merged into the target app's themeData |
| `templateOptions` | L2 options for the `extends` layout | Merged into templateOptions |
| `signinHtml`, `signupHtml`, `forgetHtml` | Extra HTML | **Sanitized with DOMPurify server-side + at render time**. No `<script>`, no event handlers. |
| `signinCss`, `signupCss` | Custom CSS | Subset-sanitized: no `@import`, no `url()` pointing off-origin, no `-webkit-binding`. |
| `signinItems`, `signupItems`, `forgetItems` | Default feature toggles | **Not honored in v1.** Feature selection is the admin's decision. |

### Banned fields

- Anything that executes code (`src`, script URLs, event handlers)
- Arbitrary provider config (providers are identity/trust concerns, not visual)
- Any field not in the allowlist above — unknown fields cause manifest rejection, not silent drop, so schema drift is visible.

---

## 3. Distribution + trust model

Three tiers, each with different authenticity guarantees:

### 3.1 Curated catalog (official)

- Hosted by the JetAuth team at a stable URL (e.g. `registry.jetauth.example.com/templates`).
- Manifests reviewed + signed with the JetAuth release key.
- Admin UI's "Browse community templates" button fetches the curated catalog by default.
- This is the only tier visible to an admin who hasn't opted into external sources.

### 3.2 Trusted third-party (opt-in)

- Admin adds a registry URL in app settings: e.g. `https://acme.example.com/jetauth-templates/index.json`.
- The registry lists manifests + signatures from a pinned public key.
- Admin UI shows these alongside the curated catalog with a "Third-party: acme" badge.
- Rotation: signing key for a registry lives in the registry metadata; admin is prompted if it changes.

### 3.3 Single-manifest URL (power-user)

- Admin pastes a raw manifest URL directly.
- Manifest is fetched, validated against the schema, rendered in the admin preview BEFORE commit.
- Heavy warning: "This manifest is not signed. Apply at your own risk."
- No automatic update — admin re-pastes to get a new version.

### 3.4 Signature format

Detached signatures, one per manifest:

```
{manifest}.json     — the JSON
{manifest}.json.sig — base64(ed25519(manifest-bytes, key))
```

Verified on both the server (before acceptance) and the client (before render) using a pinned set of public keys per registry.

---

## 4. Apply flow

1. Admin opens Template Store from the Layout Template card.
2. Catalog loads. Each tile shows preview / name / rating / author.
3. Click tile → full preview in the existing `TemplatePreviewModal` pipeline, with the manifest applied as a preview override (same postMessage contract — template id = manifest.extends, templateOptions and themeData come from the manifest).
4. Click Apply → server validates manifest (signature, schema), then:
   - `application.template = manifest.extends`
   - `application.templateOptions = { ...defaults, ...manifest.templateOptions }`
   - `application.themeData = { ...existing, ...manifest.themeData, isEnabled: true }`
   - Optional HTML/CSS fields go into `signinHtml` / `formCss` / etc., DOMPurify-sanitized.
   - A tombstone on the app records the manifest id + version so we can show "running community template X v1.2.0" and prompt for updates.
5. Admin can tweak further via the existing options forms — the manifest is a starting point, not a lockdown.

---

## 5. Update story

- Registry ships a changelog + version.
- Admin UI shows a small "v1.3.0 available — see changes" pip on apps running an older manifest version.
- Clicking "Update" runs the same Apply flow against the new manifest. The admin's tweaks on top of the manifest are **not** overwritten — the merge favors the admin's own `templateOptions` / `themeData` fields over the new manifest's, only adding keys the admin hasn't touched.
- Conflict UX: if the admin has edited a field the new manifest also changes, show a 3-way diff (original manifest → new manifest → admin edit) and let them pick.

---

## 6. Threat model

| Attack | Mitigation |
|---|---|
| Rogue manifest injects scripts via `signinHtml` | DOMPurify at both save + render; CSP with `script-src 'self'` blocks leftovers. |
| Rogue manifest leaks session via remote image beacons | `img-src` CSP allowlist per-app, reject manifests whose image URLs aren't on that list at apply time. |
| Compromised third-party registry pushes a malicious update | Update path requires admin click; signing key rotation requires explicit admin approval. |
| Manifest has a supply-chain issue via CDN URLs rotating | All manifest-referenced URLs copied to the app's own storage on apply, so the content is frozen at the version the admin approved. |
| JSON parser / schema validator bug | Manifests validated with Ajv (or similar) against a strict JSON Schema before any field is read. |
| Font-family CSS injects `expression()` (legacy IE) or `url()` to evil origin | CSS field is fed through a property allowlist, values sanitized per-property. `url(...)` inside fontFamily is stripped. |
| DoS via huge manifests or huge referenced images | Size limits: manifest ≤ 20KB, image ≤ 500KB. Registry lint rejects oversized manifests at publish. |

---

## 7. Publish flow (for template authors)

1. Author writes a manifest locally, validates against the JSON Schema.
2. Runs `jetauth-cli template preview manifest.json` which opens a local preview harness against their dev backend — matches the admin preview iframe.
3. Pushes to their registry's pending queue (manual review for curated; auto-merge to pending for third-party).
4. Registry CI:
   - Validates manifest
   - Runs Playwright smoke: manifest renders without JS errors on Centered / Split Hero / whichever `extends` says
   - Virus-scans referenced images
   - If all green: signs + publishes
5. Curated catalog additionally requires human review for aesthetic quality + accessibility contrast.

---

## 8. Scope for v1 (implementation plan)

| Area | v1 delivers | Deferred |
|---|---|---|
| Manifest schema | JSON Schema with `extends` + `themeData` + `templateOptions` + HTML/CSS (sanitized) | `signinItems` / `signupItems` overrides |
| Curated catalog | Static JSON hosted by the JetAuth team | Full web-based registry UI |
| Admin browse UI | Modal gallery fed from the catalog URL | Third-party registry URL config |
| Apply flow | Server merges into app config, frontend previews with postMessage | 3-way conflict merge on update |
| Signatures | Ed25519 detached sigs, verified server-side | Multi-key rotation UI |
| Updates | Manual "check for updates" button on apps running a manifest | Auto-update notifications |

**Total v1 estimate**: ~2 weeks of engineering (1 week backend + catalog tooling, 1 week frontend UI + Playwright tests).

---

## 9. Open questions

1. **Do we want monetization?** Paid community templates are technically feasible (the catalog just gates download) but open up a huge product-support surface (refunds, disputes). Recommend: no for v1. Curated = free. Third-party authors monetize via their own payment before handing over the URL.

2. **Where do templates run in previews?** The admin preview modal already accepts template overrides via postMessage. Community templates apply the manifest → postMessage with `template: extends` + the merged options. No new pipeline needed.

3. **Rating / trust signals?** "Installed by 1,200 apps" is useful social proof. Tracking requires telemetry that some customers don't want. Recommend: opt-in anonymous install counts, displayed on tiles.

4. **Backward compatibility when manifest schema v2 lands?** Manifest has `$schema`; the store UI shows a warning and refuses to apply if the schema URL isn't understood. v1 admins see v2 templates as "requires newer JetAuth" and are pointed at upgrade docs.

5. **Template authors as first-class entities?** An "author profile" page (templates by this author, verified badge) is a small addition that multiplies the ecosystem effect. Ships with curated tier.

---

## 10. When to build

Gated on customer signal. If 2+ customers ask "can we share a brand across three of our apps without re-entering every option," the manifest schema + curated catalog become the right answer — they're already one ApplyTemplate step away.

Not blocked on anything in M1–M3. Can land alongside or after the generalized QR backend.
