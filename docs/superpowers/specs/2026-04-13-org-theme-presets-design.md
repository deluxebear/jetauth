# Organization Theme Presets Design

## Overview

Add 5 curated theme presets to the organization "Appearance/Theme" tab, replacing the current bare form with a visual card selector + live login page preview. Themes only affect public-facing pages (login/signup). Zero backend changes.

## Problem

The current theme editor is a plain select dropdown + input fields. Users cannot visualize the effect of their choices. There are no presets to guide non-designer admins toward a polished result.

## Solution

5 theme presets that map directly to the existing `ThemeData` backend model. Each preset is a curated combination of `themeType`, `colorPrimary`, `borderRadius`, and `isCompact`. The frontend derives a full CSS variable set from `colorPrimary` at runtime.

## Architecture Decision

**Organization vs Application separation preserved:**

| Level | Controls | Stored in |
|-------|----------|-----------|
| Organization ThemeData | Brand identity: color palette, light/dark, border radius, compact mode | `organizations.theme_data` (JSON) |
| Application UI Customization | Page structure: layout, form items, background image, custom CSS/HTML | `applications.*` fields |

Theme presets operate at the organization level only. Application-level layout customization remains independent.

**Priority chain (unchanged):** Application themeData (if enabled) > Organization themeData (if enabled) > system default.

## ThemeData Backend Model (unchanged)

```go
type ThemeData struct {
    ThemeType    string `xorm:"varchar(30)" json:"themeType"`
    ColorPrimary string `xorm:"varchar(10)" json:"colorPrimary"`
    BorderRadius int    `xorm:"int" json:"borderRadius"`
    IsCompact    bool   `xorm:"bool" json:"isCompact"`
    IsEnabled    bool   `xorm:"bool" json:"isEnabled"`
}
```

## 5 Theme Presets

### 1. Aurora (extreme light)

- **Feeling:** Tech-forward, trustworthy, modern
- **Use case:** SaaS platforms, developer tools, API services
- themeType: `light`
- colorPrimary: `#0891b2` (cyan-600)
- borderRadius: `8`
- isCompact: `false`
- Dark mode accent: `#06b6d4`
- Gradient: cyan → teal

### 2. Volcano (warm, energetic)

- **Feeling:** Vibrant, action-oriented, approachable
- **Use case:** E-commerce, social apps, consumer products
- themeType: `light`
- colorPrimary: `#ea580c` (orange-600)
- borderRadius: `12`
- isCompact: `false`
- Dark mode accent: `#f97316`
- Gradient: orange → amber

### 3. Forest (natural, stable)

- **Feeling:** Reliable, calm, institutional
- **Use case:** Finance, healthcare, government, enterprise
- themeType: `light`
- colorPrimary: `#059669` (emerald-600)
- borderRadius: `6`
- isCompact: `false`
- Dark mode accent: `#34d399`
- Gradient: emerald → teal

### 4. Cosmos (premium, deep)

- **Feeling:** Premium, creative, mysterious
- **Use case:** Creative tools, gaming, design platforms
- themeType: `dark` (only dark-default preset)
- colorPrimary: `#7c3aed` (violet-600)
- borderRadius: `10`
- isCompact: `false`
- Dark mode accent: `#a78bfa`
- Gradient: violet → indigo

### 5. Coral (warm, friendly)

- **Feeling:** Warm, approachable, modern
- **Use case:** Education, community, health/wellness
- themeType: `light`
- colorPrimary: `#e11d48` (rose-600)
- borderRadius: `14`
- isCompact: `false`
- Dark mode accent: `#fb7185`
- Gradient: rose → pink

## Frontend Data Structure

```typescript
// web/src/theme-presets.ts

interface ThemePreset {
  key: string;
  name: string;           // i18n key, e.g. "theme.preset.aurora"
  themeData: {
    themeType: string;
    colorPrimary: string;
    borderRadius: number;
    isCompact: boolean;
  };
  palette: {
    accentLight: string;
    accentDark: string;
    gradientFrom: string;
    gradientTo: string;
  };
}
```

The `palette` field is derived from `colorPrimary` and used only for rendering preset cards and the preview. It is NOT persisted to the backend.

## Color Derivation System

A pure function `deriveThemeVars(colorPrimary, themeType)` generates the full CSS variable set:

```
Input: colorPrimary, themeType ("light" | "dark")

Output CSS variables:
  --accent           = colorPrimary
  --accent-hover     = darken(colorPrimary, 12%)
  --accent-subtle    = colorPrimary @ 8% opacity
  --shadow-glow      = colorPrimary @ 12% opacity
  --gradient-from    = colorPrimary
  --gradient-to      = hueShift(colorPrimary, +30deg)
  --gradient-blob    = hueShift(colorPrimary, -20deg)
  --radius           = borderRadius + "px"
```

**Dark mode correction:** When themeType is "dark", the accent color is lightened 15% and desaturated 5% to maintain WCAG AA contrast (>= 4.5:1) against dark backgrounds.

**Surface/text/border colors remain fixed** per light/dark mode. Only accent-derived variables change with `colorPrimary`. This prevents readability issues.

Implementation uses HSL math only (hex → HSL → manipulate → HSL → hex). No external color library needed.

File: `web/src/lib/theme-utils.ts`

## UI Design: Organization Theme Tab

### Layout

```
[Enable Custom Theme toggle]

── Select Theme ──────────────────────────────────
[Aurora] [Volcano] [Forest] [Cosmos] [Coral]
 (card)   (card)    (card)   (card)   (card)
   ✓

── Customize ─────────────────────────────────────
Light/Dark [select]    Primary Color [picker] [hex input]
Border Radius [number]  Compact Mode [switch]

── Login Page Preview ────────────────────────────
┌─────────────────────────────────────────────┐
│  [mini login page simulation]               │
└─────────────────────────────────────────────┘
```

### Interaction Logic

1. **Select preset card** → fills themeType, colorPrimary, borderRadius, isCompact → preview updates instantly
2. **Manual field edit** → if values no longer match any preset, card selection clears (shows "custom" state)
3. **Preview** → pure CSS rendered div (~400x240px), NOT an iframe. Shows left gradient panel + right form mockup with inputs and button colored by current values

### Preset Card Component

- Size: ~120x90px
- Content: mini login page thumbnail — left half gradient, right half form outline
- Border radius on the card matches the preset's `borderRadius` value
- Selected state: accent-colored border + checkmark badge
- Hover: subtle scale(1.02) + shadow lift

File: `web/src/components/ThemePresetCard.tsx`

### Login Preview Component

- Size: ~400x240px, responsive
- Static simulation, no interactivity
- Left region: `gradientFrom → gradientTo` fill
- Right region: surface-0 background, 3 input placeholders (surface-2 rectangles), 1 button (accent color)
- All corners use current `borderRadius`
- Responds to themeType (light surfaces vs dark surfaces)

File: `web/src/components/LoginPreview.tsx`

## Login/Signup Page Integration

### Flow

```
User visits /login or /signup
  → Frontend fetches /api/get-application (includes app.themeData + org.themeData)
  → Priority: app.themeData.isEnabled ? app : org.themeData.isEnabled ? org : default
  → Call deriveThemeVars(colorPrimary, themeType)
  → Apply CSS variables to document.documentElement.style
  → All components respond automatically via existing Tailwind/CSS variable bindings
```

### Changes to Login.tsx and Signup.tsx

- After fetching application/organization data, call `applyOrgTheme(themeData)` from the enhanced ThemeProvider
- The existing gradient blobs in Login.tsx change from hardcoded cyan to `var(--gradient-from)` and `var(--gradient-to)`
- Button colors already use `bg-accent` (Tailwind) which maps to `var(--accent)` — no change needed
- Add `border-radius: var(--radius)` to form card, inputs, and buttons

### Changes to ThemeProvider (theme.tsx)

Add `applyOrgTheme(themeData: ThemeData | null)` method:
- Calls `deriveThemeVars()` to compute CSS variables
- Sets them on `document.documentElement.style`
- Sets `data-theme` attribute based on `themeData.themeType`
- When themeData is null/disabled, clears overrides and falls back to localStorage preference

## File Change Summary

| File | Change | Description |
|------|--------|-------------|
| `web/src/theme-presets.ts` | **New** | 5 preset definitions |
| `web/src/lib/theme-utils.ts` | **New** | Color derivation: hex↔HSL, darken, hueShift, deriveThemeVars |
| `web/src/components/ThemePresetCard.tsx` | **New** | Preset selection card with mini preview |
| `web/src/components/LoginPreview.tsx` | **New** | Live login page preview simulation |
| `web/src/pages/OrganizationEditPage.tsx` | **Modify** | Replace theme tab content with card selector + preview |
| `web/src/pages/Login.tsx` | **Modify** | Apply org theme on load, use CSS variables for gradients |
| `web/src/pages/Signup.tsx` | **Modify** | Apply org theme on load (same mechanism) |
| `web/src/theme.tsx` | **Modify** | Add applyOrgTheme() method |
| `web/src/index.css` | **Modify** | Add --radius, --gradient-from, --gradient-to, --gradient-blob variables |
| `web/src/locales/en.ts` | **Modify** | Add preset name translations |
| `web/src/locales/zh.ts` | **Modify** | Add preset name translations |

## What Does NOT Change

- Backend Go code — zero changes
- Backend API — zero changes
- Database schema — zero changes
- Application-level UI customization — independent
- Admin backend theme — separate concern (future system settings)

## Testing

- Select each of the 5 presets → verify colorPrimary, themeType, borderRadius, isCompact are set correctly
- Save organization → reload → verify values persisted and correct preset is re-selected
- Manually adjust a field after selecting preset → verify card deselects
- Open login page for the organization → verify accent color, gradients, border radius match
- Test dark-mode preset (Cosmos) → verify surface colors switch correctly
- Test color contrast → buttons and text must pass WCAG AA on both light and dark backgrounds
- Test mobile viewport → preview card should scale down gracefully, preset cards wrap to 2 rows
