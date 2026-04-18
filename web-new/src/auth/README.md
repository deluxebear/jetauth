# web-new/src/auth/

New data-driven auth surface (Auth UI Revamp, 2026-04).

## Layout
- `api/`         Data fetchers + TypeScript types
- `shell/`       Layout primitives (added W3)
- `signin/`      Login flow (added W2)
- `signup/`      Signup flow (added W3)
- `items/`       Signin-item slot components (added W3)
- `html/`        Safe HTML renderers (added W5)

Every component in this module MUST consume the theme tokens from
`ThemeProvider` (added alongside this scaffold) — never reach into
raw hex values or `organizationObj.themeData` directly.
