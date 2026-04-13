# Organization Theme Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 curated theme presets to the organization theme tab, with a visual card selector, live login page preview, and runtime color derivation on login/signup pages.

**Architecture:** Pure frontend feature. Theme presets are constant objects mapping to the existing `ThemeData` backend model (themeType, colorPrimary, borderRadius, isCompact). A color derivation utility generates full CSS variable sets from `colorPrimary` at runtime. The organization edit page gets a new card-based theme selector with inline preview. Login/signup pages apply org theme CSS variables on load.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Framer Motion, CSS custom properties

---

## File Structure

| File | Responsibility |
|------|---------------|
| `web-new/src/lib/theme-utils.ts` | **New** — Color math: hex/HSL conversion, darken, lighten, hueShift, deriveThemeVars |
| `web-new/src/theme-presets.ts` | **New** — 5 preset definitions + ThemePreset type + helper to match current themeData to a preset |
| `web-new/src/components/ThemePresetCard.tsx` | **New** — Clickable preset card with mini login page thumbnail |
| `web-new/src/components/LoginPreview.tsx` | **New** — Live preview of login page reflecting current theme values |
| `web-new/src/index.css` | **Modify** — Add `--radius`, `--gradient-from`, `--gradient-to`, `--gradient-blob` CSS variables to both light/dark themes |
| `web-new/src/theme.tsx` | **Modify** — Add `applyOrgTheme(themeData)` and `clearOrgTheme()` to ThemeProvider |
| `web-new/src/pages/OrganizationEditPage.tsx` | **Modify** — Replace theme tab (lines 515-549) with card selector + custom controls + preview |
| `web-new/src/pages/Login.tsx` | **Modify** — Apply org theme on mount, replace hardcoded gradient colors with CSS variables |
| `web-new/src/pages/Signup.tsx` | **Modify** — Same as Login.tsx |
| `web-new/src/locales/en.ts` | **Modify** — Add preset name + section translations |
| `web-new/src/locales/zh.ts` | **Modify** — Add preset name + section translations |

---

### Task 1: Color Derivation Utility

**Files:**
- Create: `web-new/src/lib/theme-utils.ts`

- [ ] **Step 1: Create the color utility file with hex/HSL conversion**

```typescript
// web-new/src/lib/theme-utils.ts

/** Convert hex color (#rrggbb) to HSL [h: 0-360, s: 0-100, l: 0-100] */
export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, Math.round(l * 100)];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Convert HSL [h: 0-360, s: 0-100, l: 0-100] to hex (#rrggbb) */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;

  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Darken a hex color by a percentage (0-100) */
export function darken(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

/** Lighten a hex color by a percentage (0-100) */
export function lighten(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, l + amount));
}

/** Shift hue by degrees */
export function hueShift(hex: string, degrees: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + degrees + 360) % 360, s, l);
}

/** Desaturate a hex color by a percentage (0-100) */
export function desaturate(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s - amount), l);
}

/** Add alpha to a hex color, return rgba string */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ThemeVars {
  "--accent": string;
  "--accent-hover": string;
  "--accent-subtle": string;
  "--shadow-glow": string;
  "--gradient-from": string;
  "--gradient-to": string;
  "--gradient-blob": string;
  "--radius": string;
}

/**
 * Derive full CSS variable set from colorPrimary and themeType.
 * Dark mode: lighten accent 15%, desaturate 5% for contrast.
 */
export function deriveThemeVars(
  colorPrimary: string,
  themeType: string,
  borderRadius: number
): ThemeVars {
  const isDark = themeType === "dark";
  const accent = isDark
    ? desaturate(lighten(colorPrimary, 15), 5)
    : colorPrimary;

  return {
    "--accent": accent,
    "--accent-hover": isDark ? lighten(accent, 8) : darken(accent, 12),
    "--accent-subtle": withAlpha(accent, 0.08),
    "--shadow-glow": `0 0 20px ${withAlpha(accent, isDark ? 0.15 : 0.08)}`,
    "--gradient-from": colorPrimary,
    "--gradient-to": hueShift(colorPrimary, 30),
    "--gradient-blob": hueShift(colorPrimary, -20),
    "--radius": `${borderRadius}px`,
  };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/xiongyanlin/projects/jetauth/web-new && npx tsc --noEmit src/lib/theme-utils.ts 2>&1 | head -20`

Expected: No errors (or only errors about missing tsconfig paths — the functions are self-contained).

- [ ] **Step 3: Commit**

```bash
git add web-new/src/lib/theme-utils.ts
git commit -m "feat: add color derivation utility for org theme presets"
```

---

### Task 2: Theme Presets Definition

**Files:**
- Create: `web-new/src/theme-presets.ts`

- [ ] **Step 1: Create the presets file**

```typescript
// web-new/src/theme-presets.ts

export interface ThemeData {
  themeType: string;
  colorPrimary: string;
  borderRadius: number;
  isCompact: boolean;
  isEnabled: boolean;
}

export interface ThemePreset {
  key: string;
  nameKey: string; // i18n key
  themeData: Omit<ThemeData, "isEnabled">;
  palette: {
    accentLight: string;
    accentDark: string;
    gradientFrom: string;
    gradientTo: string;
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "aurora",
    nameKey: "theme.preset.aurora",
    themeData: {
      themeType: "light",
      colorPrimary: "#0891b2",
      borderRadius: 8,
      isCompact: false,
    },
    palette: {
      accentLight: "#0891b2",
      accentDark: "#06b6d4",
      gradientFrom: "#0891b2",
      gradientTo: "#14b8a6",
    },
  },
  {
    key: "volcano",
    nameKey: "theme.preset.volcano",
    themeData: {
      themeType: "light",
      colorPrimary: "#ea580c",
      borderRadius: 12,
      isCompact: false,
    },
    palette: {
      accentLight: "#ea580c",
      accentDark: "#f97316",
      gradientFrom: "#ea580c",
      gradientTo: "#f59e0b",
    },
  },
  {
    key: "forest",
    nameKey: "theme.preset.forest",
    themeData: {
      themeType: "light",
      colorPrimary: "#059669",
      borderRadius: 6,
      isCompact: false,
    },
    palette: {
      accentLight: "#059669",
      accentDark: "#34d399",
      gradientFrom: "#059669",
      gradientTo: "#14b8a6",
    },
  },
  {
    key: "cosmos",
    nameKey: "theme.preset.cosmos",
    themeData: {
      themeType: "dark",
      colorPrimary: "#7c3aed",
      borderRadius: 10,
      isCompact: false,
    },
    palette: {
      accentLight: "#7c3aed",
      accentDark: "#a78bfa",
      gradientFrom: "#7c3aed",
      gradientTo: "#4f46e5",
    },
  },
  {
    key: "coral",
    nameKey: "theme.preset.coral",
    themeData: {
      themeType: "light",
      colorPrimary: "#e11d48",
      borderRadius: 14,
      isCompact: false,
    },
    palette: {
      accentLight: "#e11d48",
      accentDark: "#fb7185",
      gradientFrom: "#e11d48",
      gradientTo: "#ec4899",
    },
  },
];

/**
 * Find which preset matches the current themeData (if any).
 * Returns the preset key or null if values don't match any preset.
 */
export function matchPreset(themeData: Partial<ThemeData> | null | undefined): string | null {
  if (!themeData) return null;
  for (const preset of THEME_PRESETS) {
    if (
      preset.themeData.themeType === themeData.themeType &&
      preset.themeData.colorPrimary === themeData.colorPrimary &&
      preset.themeData.borderRadius === themeData.borderRadius &&
      preset.themeData.isCompact === themeData.isCompact
    ) {
      return preset.key;
    }
  }
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add web-new/src/theme-presets.ts
git commit -m "feat: define 5 organization theme presets"
```

---

### Task 3: Add CSS Variables for Gradients and Radius

**Files:**
- Modify: `web-new/src/index.css`

- [ ] **Step 1: Add gradient and radius CSS variables to light theme**

In `web-new/src/index.css`, within the `:root, [data-theme="light"]` block, after line 27 (`--glass-bg: rgba(255, 255, 255, 0.8);`), add:

```css
  --gradient-from: #0891b2;
  --gradient-to: #14b8a6;
  --gradient-blob: #06b6d4;
  --radius: 8px;
```

- [ ] **Step 2: Add gradient and radius CSS variables to dark theme**

In `web-new/src/index.css`, within the `[data-theme="dark"]` block, after line 53 (`--glass-bg: rgba(15, 17, 23, 0.7);`), add:

```css
  --gradient-from: #06b6d4;
  --gradient-to: #2dd4bf;
  --gradient-blob: #22d3ee;
  --radius: 8px;
```

- [ ] **Step 3: Add gradient and radius tokens to the @theme block**

In `web-new/src/index.css`, within the `@theme` block, after line 74 (`--color-info: var(--info);`), add:

```css
  --color-gradient-from: var(--gradient-from);
  --color-gradient-to: var(--gradient-to);
  --color-gradient-blob: var(--gradient-blob);
  --radius-theme: var(--radius);
```

- [ ] **Step 4: Commit**

```bash
git add web-new/src/index.css
git commit -m "feat: add gradient and radius CSS variables for theme system"
```

---

### Task 4: Update ThemeProvider with applyOrgTheme

**Files:**
- Modify: `web-new/src/theme.tsx`

- [ ] **Step 1: Rewrite theme.tsx to add org theme application**

Replace the entire content of `web-new/src/theme.tsx` with:

```typescript
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { deriveThemeVars, type ThemeVars } from "./lib/theme-utils";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
  applyOrgTheme: (themeData: { themeType: string; colorPrimary: string; borderRadius: number; isCompact: boolean } | null) => void;
  clearOrgTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>(null!);

function getInitialTheme(): Theme {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") return saved;
  return "dark";
}

const THEME_VAR_KEYS: (keyof ThemeVars)[] = [
  "--accent",
  "--accent-hover",
  "--accent-subtle",
  "--shadow-glow",
  "--gradient-from",
  "--gradient-to",
  "--gradient-blob",
  "--radius",
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const applyOrgTheme = useCallback(
    (themeData: { themeType: string; colorPrimary: string; borderRadius: number; isCompact: boolean } | null) => {
      if (!themeData) {
        clearOrgTheme();
        return;
      }

      const resolvedTheme = (themeData.themeType === "dark" ? "dark" : "light") as Theme;
      setTheme(resolvedTheme);

      const vars = deriveThemeVars(themeData.colorPrimary, themeData.themeType, themeData.borderRadius);
      const root = document.documentElement;
      for (const key of THEME_VAR_KEYS) {
        root.style.setProperty(key, vars[key]);
      }
    },
    []
  );

  const clearOrgTheme = useCallback(() => {
    const root = document.documentElement;
    for (const key of THEME_VAR_KEYS) {
      root.style.removeProperty(key);
    }
    setTheme(getInitialTheme());
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, applyOrgTheme, clearOrgTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/xiongyanlin/projects/jetauth/web-new && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors introduced.

- [ ] **Step 3: Commit**

```bash
git add web-new/src/theme.tsx
git commit -m "feat: add applyOrgTheme/clearOrgTheme to ThemeProvider"
```

---

### Task 5: i18n Translations

**Files:**
- Modify: `web-new/src/locales/en.ts`
- Modify: `web-new/src/locales/zh.ts`

- [ ] **Step 1: Add English translations**

In `web-new/src/locales/en.ts`, find the line containing `"orgs.field.compactMode"` and add after it:

```typescript
  "orgs.section.selectTheme": "Select Theme",
  "orgs.section.customizeTheme": "Customize",
  "orgs.section.themePreview": "Login Page Preview",
  "orgs.field.lightDarkMode": "Light/Dark Mode",
  "theme.preset.aurora": "Aurora",
  "theme.preset.volcano": "Volcano",
  "theme.preset.forest": "Forest",
  "theme.preset.cosmos": "Cosmos",
  "theme.preset.coral": "Coral",
  "theme.preset.custom": "Custom",
```

- [ ] **Step 2: Add Chinese translations**

In `web-new/src/locales/zh.ts`, find the line containing `"orgs.field.compactMode"` and add after it:

```typescript
  "orgs.section.selectTheme": "选择主题",
  "orgs.section.customizeTheme": "自定义调整",
  "orgs.section.themePreview": "登录页预览",
  "orgs.field.lightDarkMode": "明暗模式",
  "theme.preset.aurora": "极光",
  "theme.preset.volcano": "熔岩",
  "theme.preset.forest": "森林",
  "theme.preset.cosmos": "星空",
  "theme.preset.coral": "珊瑚",
  "theme.preset.custom": "自定义",
```

- [ ] **Step 3: Commit**

```bash
git add web-new/src/locales/en.ts web-new/src/locales/zh.ts
git commit -m "feat: add i18n translations for theme presets"
```

---

### Task 6: ThemePresetCard Component

**Files:**
- Create: `web-new/src/components/ThemePresetCard.tsx`

- [ ] **Step 1: Create the preset card component**

```typescript
// web-new/src/components/ThemePresetCard.tsx
import { Check } from "lucide-react";
import type { ThemePreset } from "../theme-presets";
import { useTranslation } from "../i18n";

interface ThemePresetCardProps {
  preset: ThemePreset;
  selected: boolean;
  onClick: () => void;
}

export default function ThemePresetCard({ preset, selected, onClick }: ThemePresetCardProps) {
  const { t } = useTranslation();
  const { palette, themeData } = preset;
  const isDark = themeData.themeType === "dark";
  const radius = `${themeData.borderRadius}px`;

  const bgColor = isDark ? "#0f1117" : "#ffffff";
  const surfaceColor = isDark ? "#1e2231" : "#f0f2f5";
  const borderColor = isDark ? "#2a3040" : "#dfe2ea";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg cursor-pointer ${
        selected
          ? "border-accent shadow-md bg-accent-subtle"
          : "border-border-subtle hover:border-border bg-surface-1"
      }`}
      style={{ width: 130 }}
    >
      {/* Mini login page thumbnail */}
      <div
        className="w-full aspect-[4/3] rounded-lg overflow-hidden flex"
        style={{ border: `1px solid ${borderColor}` }}
      >
        {/* Left gradient panel */}
        <div
          className="w-[40%] h-full"
          style={{
            background: `linear-gradient(135deg, ${palette.gradientFrom}, ${palette.gradientTo})`,
          }}
        />
        {/* Right form panel */}
        <div className="flex-1 flex flex-col justify-center gap-1.5 px-2 py-2" style={{ background: bgColor }}>
          {/* Mini input placeholders */}
          <div className="h-2 w-full" style={{ background: surfaceColor, borderRadius: radius }} />
          <div className="h-2 w-full" style={{ background: surfaceColor, borderRadius: radius }} />
          {/* Mini button */}
          <div
            className="h-2.5 w-full mt-0.5"
            style={{
              background: isDark ? palette.accentDark : palette.accentLight,
              borderRadius: radius,
            }}
          />
        </div>
      </div>

      {/* Label */}
      <span className={`text-[12px] font-medium ${selected ? "text-accent" : "text-text-secondary"}`}>
        {t(preset.nameKey as any)}
      </span>

      {/* Checkmark badge */}
      {selected && (
        <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-accent flex items-center justify-center shadow-sm">
          <Check size={12} className="text-white" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web-new/src/components/ThemePresetCard.tsx
git commit -m "feat: add ThemePresetCard component"
```

---

### Task 7: LoginPreview Component

**Files:**
- Create: `web-new/src/components/LoginPreview.tsx`

- [ ] **Step 1: Create the login preview component**

```typescript
// web-new/src/components/LoginPreview.tsx
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "../i18n";
import { deriveThemeVars } from "../lib/theme-utils";

interface LoginPreviewProps {
  colorPrimary: string;
  themeType: string;
  borderRadius: number;
}

export default function LoginPreview({ colorPrimary, themeType, borderRadius }: LoginPreviewProps) {
  const { t } = useTranslation();
  const isDark = themeType === "dark";
  const vars = deriveThemeVars(colorPrimary, themeType, borderRadius);
  const radius = `${borderRadius}px`;

  const bgColor = isDark ? "#0f1117" : "#ffffff";
  const surfaceBg = isDark ? "#161923" : "#f8f9fb";
  const inputBg = isDark ? "#1e2231" : "#f0f2f5";
  const borderColor = isDark ? "#2a3040" : "#dfe2ea";
  const textPrimary = isDark ? "#e8eaf0" : "#111827";
  const textSecondary = isDark ? "#8b93a8" : "#4b5563";
  const textMuted = isDark ? "#555d73" : "#9ca3af";

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-border"
      style={{ maxWidth: 480, aspectRatio: "5 / 3" }}
    >
      <div className="flex h-full">
        {/* Left branding panel */}
        <div
          className="w-[42%] relative overflow-hidden flex items-center justify-center"
          style={{ background: surfaceBg }}
        >
          {/* Gradient blob 1 */}
          <div
            className="absolute top-[20%] left-[25%] h-24 w-24 rounded-full blur-[40px] opacity-30"
            style={{ background: vars["--gradient-from"] }}
          />
          {/* Gradient blob 2 */}
          <div
            className="absolute bottom-[25%] right-[20%] h-20 w-20 rounded-full blur-[35px] opacity-20"
            style={{ background: vars["--gradient-to"] }}
          />
          {/* Logo + text */}
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background: `${vars["--accent"]}20`, border: `1px solid ${vars["--accent"]}30` }}
            >
              <ShieldCheck size={16} style={{ color: vars["--accent"] }} />
            </div>
            <div className="text-[10px] font-bold" style={{ color: textPrimary }}>
              JetAuth
            </div>
            <div className="text-[7px] font-mono uppercase tracking-wider" style={{ color: textMuted }}>
              Identity Platform
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex flex-col justify-center px-5 py-4" style={{ background: bgColor }}>
          <div className="text-[11px] font-bold mb-0.5" style={{ color: textPrimary }}>
            {t("login.title")}
          </div>
          <div className="text-[7px] mb-3" style={{ color: textMuted }}>
            {t("login.subtitle")}
          </div>

          {/* Username input mock */}
          <div className="mb-1.5">
            <div className="text-[6px] mb-0.5" style={{ color: textSecondary }}>
              {t("login.username")}
            </div>
            <div
              className="h-4 w-full"
              style={{ background: inputBg, borderRadius: radius, border: `1px solid ${borderColor}` }}
            />
          </div>

          {/* Password input mock */}
          <div className="mb-2">
            <div className="text-[6px] mb-0.5" style={{ color: textSecondary }}>
              {t("login.password")}
            </div>
            <div
              className="h-4 w-full"
              style={{ background: inputBg, borderRadius: radius, border: `1px solid ${borderColor}` }}
            />
          </div>

          {/* Login button mock */}
          <div
            className="h-4.5 w-full flex items-center justify-center"
            style={{
              background: vars["--accent"],
              borderRadius: radius,
            }}
          >
            <span className="text-[7px] font-semibold text-white">{t("login.submit")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web-new/src/components/LoginPreview.tsx
git commit -m "feat: add LoginPreview component for theme editor"
```

---

### Task 8: Rewrite Organization Theme Tab

**Files:**
- Modify: `web-new/src/pages/OrganizationEditPage.tsx` (lines 515-549)

- [ ] **Step 1: Add imports at the top of OrganizationEditPage.tsx**

At the top of `web-new/src/pages/OrganizationEditPage.tsx`, add these imports after the existing imports (around line 16):

```typescript
import { THEME_PRESETS, matchPreset } from "../theme-presets";
import ThemePresetCard from "../components/ThemePresetCard";
import LoginPreview from "../components/LoginPreview";
```

- [ ] **Step 2: Replace the theme tab content**

In `web-new/src/pages/OrganizationEditPage.tsx`, replace the entire theme tab block from line 515 (`{`) to line 549 (`},`) with:

```typescript
        {
          key: "theme",
          label: t("orgs.tab.theme" as any),
          icon: <Palette size={14} />,
          content: (
            <div className={!canEditField("themeData") ? "pointer-events-none opacity-60" : ""}>
              <FormSection title={t("orgs.field.enableCustomTheme" as any)}>
                <FormField label={t("orgs.field.enableCustomTheme" as any)}>
                  <Switch checked={!!(org as any).themeData?.isEnabled} onChange={(v) => set("themeData", { ...((org as any).themeData ?? {}), isEnabled: v })} />
                </FormField>
              </FormSection>

              {(org as any).themeData?.isEnabled && (
                <>
                  {/* Preset cards */}
                  <FormSection title={t("orgs.section.selectTheme" as any)}>
                    <div className="col-span-2">
                      <div className="flex flex-wrap gap-3">
                        {THEME_PRESETS.map((preset) => (
                          <ThemePresetCard
                            key={preset.key}
                            preset={preset}
                            selected={matchPreset((org as any).themeData) === preset.key}
                            onClick={() =>
                              set("themeData", {
                                ...((org as any).themeData ?? {}),
                                isEnabled: true,
                                ...preset.themeData,
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </FormSection>

                  {/* Custom controls */}
                  <FormSection title={t("orgs.section.customizeTheme" as any)}>
                    <FormField label={t("orgs.field.lightDarkMode" as any)}>
                      <select
                        value={(org as any).themeData?.themeType ?? "light"}
                        onChange={(e) => set("themeData", { ...(org as any).themeData, themeType: e.target.value })}
                        className={inputClass}
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </FormField>
                    <FormField label={t("orgs.field.primaryColor" as any)}>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={(org as any).themeData?.colorPrimary ?? "#0891b2"}
                          onChange={(e) => set("themeData", { ...(org as any).themeData, colorPrimary: e.target.value })}
                          className="h-9 w-12 rounded border border-border cursor-pointer"
                        />
                        <input
                          value={(org as any).themeData?.colorPrimary ?? "#0891b2"}
                          onChange={(e) => set("themeData", { ...(org as any).themeData, colorPrimary: e.target.value })}
                          className={`${monoInputClass} flex-1`}
                        />
                      </div>
                    </FormField>
                    <FormField label={t("orgs.field.borderRadius" as any)}>
                      <input
                        type="number"
                        value={(org as any).themeData?.borderRadius ?? 8}
                        onChange={(e) => set("themeData", { ...(org as any).themeData, borderRadius: Number(e.target.value) })}
                        min={0}
                        max={20}
                        className={monoInputClass}
                      />
                    </FormField>
                    <FormField label={t("orgs.field.compactMode" as any)}>
                      <Switch
                        checked={!!(org as any).themeData?.isCompact}
                        onChange={(v) => set("themeData", { ...(org as any).themeData, isCompact: v })}
                      />
                    </FormField>
                  </FormSection>

                  {/* Live preview */}
                  <FormSection title={t("orgs.section.themePreview" as any)}>
                    <div className="col-span-2">
                      <LoginPreview
                        colorPrimary={(org as any).themeData?.colorPrimary ?? "#0891b2"}
                        themeType={(org as any).themeData?.themeType ?? "light"}
                        borderRadius={(org as any).themeData?.borderRadius ?? 8}
                      />
                    </div>
                  </FormSection>
                </>
              )}
            </div>
          ),
        },
```

- [ ] **Step 3: Verify the page loads**

Run: `cd /Users/xiongyanlin/projects/jetauth/web-new && npx tsc --noEmit 2>&1 | head -20`

Expected: No new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add web-new/src/pages/OrganizationEditPage.tsx
git commit -m "feat: replace theme tab with preset cards, custom controls, and live preview"
```

---

### Task 9: Update Login.tsx to Apply Org Theme

**Files:**
- Modify: `web-new/src/pages/Login.tsx`

- [ ] **Step 1: Replace hardcoded gradient colors with CSS variables**

In `web-new/src/pages/Login.tsx`, make these changes:

1. On line 71, replace:
```
<div className="absolute top-1/4 left-1/3 h-72 w-72 rounded-full bg-accent/8 blur-[100px]" />
```
with:
```
<div className="absolute top-1/4 left-1/3 h-72 w-72 rounded-full blur-[100px]" style={{ background: "var(--gradient-from)", opacity: 0.08 }} />
```

2. On line 72, replace:
```
<div className="absolute bottom-1/3 right-1/4 h-56 w-56 rounded-full bg-cyan-400/6 blur-[80px]" />
```
with:
```
<div className="absolute bottom-1/3 right-1/4 h-56 w-56 rounded-full blur-[80px]" style={{ background: "var(--gradient-blob)", opacity: 0.06 }} />
```

3. On line 98, replace:
```
<span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-cyan-300">
```
with:
```
<span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(to right, var(--gradient-from), var(--gradient-to))` }}>
```

- [ ] **Step 2: Commit**

```bash
git add web-new/src/pages/Login.tsx
git commit -m "feat: use CSS variable gradients on login page for theme support"
```

---

### Task 10: Update Signup.tsx to Apply Org Theme

**Files:**
- Modify: `web-new/src/pages/Signup.tsx`

- [ ] **Step 1: Replace hardcoded gradient colors with CSS variables**

In `web-new/src/pages/Signup.tsx`, make these changes:

1. On line 267, replace:
```
<div className="absolute top-1/4 left-1/3 h-72 w-72 rounded-full bg-accent/8 blur-[100px]" />
```
with:
```
<div className="absolute top-1/4 left-1/3 h-72 w-72 rounded-full blur-[100px]" style={{ background: "var(--gradient-from)", opacity: 0.08 }} />
```

2. On line 268, replace:
```
<div className="absolute bottom-1/3 right-1/4 h-56 w-56 rounded-full bg-cyan-400/6 blur-[80px]" />
```
with:
```
<div className="absolute bottom-1/3 right-1/4 h-56 w-56 rounded-full blur-[80px]" style={{ background: "var(--gradient-blob)", opacity: 0.06 }} />
```

3. On line 297, replace:
```
<span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-cyan-300">
```
with:
```
<span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(to right, var(--gradient-from), var(--gradient-to))` }}>
```

- [ ] **Step 2: Commit**

```bash
git add web-new/src/pages/Signup.tsx
git commit -m "feat: use CSS variable gradients on signup page for theme support"
```

---

### Task 11: Integration — Apply Org Theme on Login/Signup Load

**Files:**
- Modify: `web-new/src/pages/Login.tsx`
- Modify: `web-new/src/pages/Signup.tsx`

This task connects the theme application to the actual organization/application data fetched from the API.

- [ ] **Step 1: Add theme application hook to Login.tsx**

In `web-new/src/pages/Login.tsx`, the Login component currently receives organizations as a prop but does not fetch application or organization theme data. The theme application will happen when the parent `App.tsx` passes themeData or when the Login page fetches it.

Since Login.tsx currently gets organization data from App.tsx (via the `organizations` prop), and the app data is fetched in App.tsx, the cleanest approach is to add an optional `themeData` prop to Login and apply it on mount.

Add the themeData prop to LoginProps interface (line 9):

```typescript
interface LoginProps {
  onLogin: (username: string, password: string, organization: string) => Promise<void>;
  error?: string;
  organizations?: OrgOption[];
  themeData?: { themeType: string; colorPrimary: string; borderRadius: number; isCompact: boolean; isEnabled: boolean } | null;
}
```

Update the component function signature (line 15):

```typescript
export default function Login({ onLogin, error, organizations = [], themeData }: LoginProps) {
```

Add after the `useTheme()` call (after line 22):

```typescript
  const { theme, toggle: toggleTheme, applyOrgTheme, clearOrgTheme } = useTheme();

  useEffect(() => {
    if (themeData?.isEnabled) {
      applyOrgTheme(themeData);
    }
    return () => clearOrgTheme();
  }, [themeData, applyOrgTheme, clearOrgTheme]);
```

And remove the existing `const { theme, toggle: toggleTheme } = useTheme();` line.

- [ ] **Step 2: Add theme application to Signup.tsx**

In `web-new/src/pages/Signup.tsx`, the component already fetches application data. After the application is loaded, apply its theme (or the organization's theme).

After the `useTheme()` call (line 41), replace:

```typescript
  const { theme, toggle: toggleTheme } = useTheme();
```

with:

```typescript
  const { theme, toggle: toggleTheme, applyOrgTheme, clearOrgTheme } = useTheme();
```

Add after the application fetch `useEffect` (after line 88), add a new effect:

```typescript
  // Apply application/organization theme
  useEffect(() => {
    const appTheme = application?.themeData as any;
    if (appTheme?.isEnabled) {
      applyOrgTheme(appTheme);
    }
    return () => clearOrgTheme();
  }, [application, applyOrgTheme, clearOrgTheme]);
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/xiongyanlin/projects/jetauth/web-new && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add web-new/src/pages/Login.tsx web-new/src/pages/Signup.tsx
git commit -m "feat: apply org/app theme on login and signup page mount"
```

---

### Task 12: Manual Testing & Polish

**Files:** All modified files

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/xiongyanlin/projects/jetauth/web-new && npm run dev`

- [ ] **Step 2: Test the organization theme tab**

1. Navigate to an organization edit page → Theme tab
2. Enable custom theme toggle
3. Verify all 5 preset cards render with correct mini thumbnails
4. Click each preset card → verify:
   - The card gets a checkmark + accent border
   - The color/themeType/borderRadius/isCompact fields update
   - The login preview updates in real time
5. Manually change a field (e.g., adjust borderRadius) → verify the preset card deselects
6. Save the organization

- [ ] **Step 3: Test the login page**

1. Open the login page
2. If themeData is passed via props, verify:
   - Gradient blobs use the org's colorPrimary-derived colors
   - The gradient text heading uses org colors
   - Buttons use the accent color
3. Test with the Cosmos preset (dark mode default) → verify dark surface colors

- [ ] **Step 4: Test edge cases**

1. Disable custom theme → verify fields hide
2. Set colorPrimary to a very light color (e.g., #fde68a) → verify dark mode contrast adjustment
3. Set borderRadius to 0 → verify sharp corners in preview
4. Set borderRadius to 20 → verify rounded corners in preview
5. Test on mobile viewport → verify preset cards wrap nicely

- [ ] **Step 5: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: polish theme preset UI and edge cases"
```
