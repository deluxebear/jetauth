# Auth UI E2E tests (Playwright)

Smoke-level coverage of the template system — the 5 layouts render, the
admin picker commits a selection, and the preview modal actually flips
layouts (not the bug we squashed in `d9ebe178`).

## Prereqs

- Backend on `:8000` (e.g. `/tmp/jetauth-bin` from a fresh build)
- Chromium browser binary: `npx playwright install chromium` (one-time)
- A built-in admin app available at `admin/app-built-in` with the
  default layout. Most dev setups already have this from `init_data_dump.json`.

## Run

```bash
cd web-new
# Auto-starts Vite if needed (CI), else expects one on :7001.
npx playwright test

# Watch-mode / debug in a headed browser:
npx playwright test --headed --ui
```

Set `PLAYWRIGHT_BASE_URL` to point at a deployed instance if you want to
smoke-test a real environment.

## What's covered (v1)

- `templates.spec.ts`
  - Default `centered-card` signin renders and the form is interactive.
  - Applying `split-hero` server-side flips the rendered layout to show
    the hero panel on `lg`+ viewports.
  - Bare-bones guard that template switching in the preview postMessage
    pipeline actually re-renders the iframe.

## What's NOT covered yet

- Actual auth (login with real credentials) — needs a seeded test user
  and cookie jar. Split into a later milestone.
- Every template × every variant (signin / signup / forgot). V1 proves
  the harness; add variant matrices as regressions appear.
- QR / WebAuthn / Face ID flows. These need mock providers.

Keep this file and the specs honest: if a test starts flaking on a
false premise (e.g. the built-in app got renamed), fix the premise in
a fixture, don't widen the assertions.
