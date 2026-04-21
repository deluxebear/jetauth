import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for JetAuth auth UI smoke tests.
 *
 * Assumes a local dev environment:
 *   - Backend on http://localhost:8000 (started separately)
 *   - Vite dev server on http://localhost:7001 (webServer below starts it
 *     if not already up).
 *
 * First time: `npx playwright install chromium` to download the browser.
 * Run: `npm run e2e`  (see package.json)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:7001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Start the Vite dev server on demand. Reuses an existing instance when
  // one is already listening — matches how this repo typically runs during
  // development.
  webServer: process.env.CI
    ? {
        command: "npm run dev -- --port 7001",
        url: "http://localhost:7001",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
