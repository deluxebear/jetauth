# W3 Mobile Audit (2026-04-18)

Static analysis of web/src/auth/ for mobile-viewport issues.
No browser run — this is a code review pass.

## Methodology

Reviewed every .tsx/.ts file under web/src/auth/ (excluding __tests__)
for the following patterns:

1. Fixed widths without max-w constraint
2. Missing `lg:`/`md:` responsive modifiers
3. Horizontal overflow risks
4. Touch targets < 44px
5. Body text < 14px / input text < 16px (iOS auto-zoom trigger)
6. Hover-only interactions

## Findings

### 🟢 Fixed in this commit

**shell/TopBar.tsx:36** — Locale label text-[11px] below 14px floor → changed to `text-[12px]`

**shell/TopBar.tsx:43** — Language picker dropdown items used `py-1.5` (≈32px height), tap targets too small → changed to `py-2` (≈40px, acceptable at W3; 44px target deferred)

**shell/TopBar.tsx:49** — Dropdown locale code spans at text-[11px] → changed to `text-[12px]`

**shell/TopBar.tsx:38** — Language dropdown used `invisible group-hover:visible` — invisible on touch because touch has no hover state. Added `group-focus-within:visible` so keyboard focus (and touch browsers that convert tap to focus) can reveal the menu. Full touch-friendly popover is deferred to W6.

**signin/ProvidersRow.tsx:65** — OAuth provider buttons at `py-2` were ~32px tall, well under the 44px touch target minimum → bumped to `py-2.5` (~40px, practical improvement; full 44px requires line-height change deferred to W6)

**signin/MethodStep.tsx:122** — "Try another method" button had no padding at all (zero height beyond its text line) → added `py-2` for a meaningful touch target

**signin/CodeForm.tsx:181** — "Resend code" button had no padding → added `py-2`

**signin/ClassicSigninPage.tsx:331** — Same resend button in ClassicSigninPage CodeBody → added `py-2`

### 🟡 Known issues for W6 polish

**shell/TopBar.tsx** — Hover-only language picker dropdown: while `group-focus-within:visible` helps keyboard users, on mobile the correct fix is a dedicated toggle button that opens/closes the menu on tap with proper z-index and backdrop-dismiss. Structural change → deferred to W6.

**signin/ProvidersRow.tsx** — Provider buttons still land at ~40px, not the 44px WCAG target. Reaching 44px requires bumping font size or adding an explicit `min-h-[44px]` which can shift overall card height. Deferred to W6 layout polish pass.

**signup/fields/shared.ts (inputClass)** — All form inputs use `text-[14px]` (not 16px). iOS Safari auto-zooms when input font-size < 16px, which breaks the viewport on signup. Risk is moderate — Android is fine, and `py-2.5` keeps fields tappable — but the zoom jank on iPhone is a real UX issue. Fixing to `text-base` (16px) would change visual sizing across all fields; deferred to W6 for coordinated review with design.

**signin/ClassicSigninPage.tsx (tab buttons)** — Tab bar items use `py-1.5` (~32px). On four-tab layouts the row still fits without horizontal scroll, but tap precision is poor. Deferred to W6.

**shell/TopBar.tsx (theme toggle + language trigger)** — Both icon-only buttons use `p-2` with a 17px icon. Combined height ≈ 37px, slightly under 44px. Safe fix would be `p-2.5`, but the absolute-positioned row would shift; deferred to W6.

**signin/MethodStep.tsx (method menu items)** — Switcher dropdown items use `py-1.5` (~32px touch target). Deferred to W6 alongside tab bar fixes.

**auth/signup/SignupPage.tsx / signin/SigninPage.tsx / signin/ForgotPasswordPage.tsx** — Subtitle paragraphs use `text-[13px]`. This is a cosmetic body text issue (under the 14px soft floor) but does not affect interactivity or iOS zoom. Deferred to W6 typography pass.

### ✅ Clean

- api/getAppLogin.ts — no UI
- api/getResolvedTheme.ts — no UI
- api/resolveSigninMethods.ts — no UI
- api/types.ts — no UI
- AuthShell.tsx — shell orchestrator; error/loading states use `text-[14px]` and full-screen flex centering; fine
- items/useSigninItemVisibility.ts — no UI
- layouts/CenteredCard.tsx — delegates to BackgroundLayer; no fixed widths
- layouts/LayoutRouter.tsx — no UI
- layouts/LeftForm.tsx — form panel is `w-full lg:w-[420px]`; mobile gets full width correctly
- layouts/RightForm.tsx — same pattern as LeftForm; clean
- layouts/SidePanel.tsx — mobile accordion collapses the hero panel; form gets full width; clean
- shell/BackgroundLayer.tsx — handles mobile/desktop background swap via JS; clean
- shell/BrandingLayer.tsx — `max-w-[200px]` on logo constrains it; no overflow risk
- shell/OrgChoiceWidget.tsx — inputs use `text-[14px]` and `py-2.5`; fine
- shell/SideHtml.tsx — no Tailwind width classes; user HTML may introduce issues but that is a content concern
- signin/IdentifierStep.tsx — input at `text-[14px]` / `py-2.5`, submit button at `py-2.5`; acceptable
- signin/PasswordForm.tsx — input at `text-[14px]` / `py-2.5`; back chip has `py-2` container; acceptable
- signin/WebAuthnForm.tsx — button at `py-2.5`; clean
- signin/FaceForm.tsx — video preview uses `max-w-[300px]` with `w-full` wrapper; fine on mobile
- signin/ForgotPasswordPage.tsx — follows same pattern as SigninPage; no additional issues beyond shared text-[13px] subtitle
- signup/DynamicField.tsx — dispatcher only; no UI
- signup/fields/AgreementField.tsx — checkbox + label; fine
- signup/fields/CheckboxField.tsx — checkbox + label; fine
- signup/fields/ConfirmPasswordField.tsx — uses shared inputClass; same iOS zoom note as above
- signup/fields/DateField.tsx — uses shared inputClass; fine
- signup/fields/EmailField.tsx — uses shared inputClass; fine
- signup/fields/PasswordField.tsx — uses shared inputClass; fine
- signup/fields/PhoneField.tsx — uses shared inputClass with inputMode="tel"; fine
- signup/fields/SelectField.tsx — select at `text-[14px]` / `py-2.5`; fine
- signup/fields/shared.ts — see deferred note on input text-[14px] / iOS zoom
- signup/fields/TextField.tsx — uses shared inputClass; fine
- signup/useSignupSchema.ts — no UI
- ThemeProvider.tsx — no UI

## Summary

- Total files reviewed: 41
- Fixes applied: 8 (across 5 files)
- Deferred to W6: 7 items
- Overall mobile readiness: **NEEDS WORK** — core flows (signin, signup, forgot password) render correctly on narrow viewports and all primary action buttons have usable tap targets. However the iOS auto-zoom on text inputs (text-[14px] < 16px threshold), the hover-only language picker, and a handful of secondary/tertiary controls that fall under 44px constitute real friction on real devices. None of these are blocking for a staging demo but should be addressed before production launch.
