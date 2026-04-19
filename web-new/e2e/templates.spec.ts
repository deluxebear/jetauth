import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the layout template system.
 *
 * Goal: catch regressions where a template stops rendering or the
 * preview-override postMessage pipeline silently no-ops.
 *
 * Fixture expectation: the backend serves an app at
 * `admin/app-built-in` with the default (Centered) template — this is
 * the seed that ships in init_data_dump.json.
 */

const APP_URL = "/login/built-in/app-built-in";

test.describe("Centered (default) template", () => {
  test("signin page renders with the expected single-column shell", async ({ page }) => {
    await page.goto(`${APP_URL}?asGuest=1`);
    // Outer shell that all templates share in different shapes.
    await expect(page.locator("div.min-h-screen.flex")).toBeVisible();
    // Centered template puts the form column at max-w-sm centered.
    await expect(page.locator(".max-w-sm").first()).toBeVisible();
    // Identifier input is the first interactive control.
    await expect(
      page.getByRole("textbox", { name: /username|identifier|用户名/i }).first(),
    ).toBeVisible();
  });
});

test.describe("Template override via preview postMessage", () => {
  test("a posted template id actually flips the rendered layout", async ({ page }) => {
    await page.goto(`${APP_URL}?preview=1&asGuest=1`);
    // Wait for the AuthShell ready signal shape (page emits READY to parent,
    // but in test context there's no parent — we just let it settle).
    await page.waitForLoadState("networkidle");

    // Inject an override as if the parent admin page had posted it. We do
    // this via an in-page postMessage from window to window (same origin),
    // which AuthShell's handler accepts.
    await page.evaluate(() => {
      window.postMessage(
        {
          type: "jetauth.preview.config",
          payload: {
            template: "split-hero",
            templateOptions: {
              heroImageUrl: "",
              heroHeadline: { en: "Built with JetAuth", zh: "由 JetAuth 驱动" },
              heroSubcopy: { en: "Hero subcopy", zh: "副标题" },
              heroSide: "left",
              overlayOpacity: 0.35,
            },
          },
        },
        window.location.origin,
      );
    });

    // Split Hero shows a hero panel that's hidden below lg. In Desktop
    // Chrome (default project) the viewport is lg, so the hero copy
    // renders as a block adjacent to the form column.
    await expect(
      page
        .locator("div.relative.z-10.flex.flex-col.justify-end")
        .filter({ hasText: /Built with JetAuth|JetAuth/ }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Signup variant", () => {
  test("renders when enableSignUp on built-in app", async ({ page }) => {
    await page.goto(`/signup/app-built-in?asGuest=1`);
    // If disabled, the hard-gate page shows a "registration closed" heading;
    // if enabled, the signup form shows up. Either way SafeHtml + BrandingLayer
    // must render — assert the min-h-screen shell.
    await expect(page.locator("div.min-h-screen.flex")).toBeVisible();
  });
});
