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

/**
 * Matrix test: each of the 5 templates, when posted as an override,
 * must produce a DOM signature unique to that template. Regressions
 * where a template silently falls back to the default, or renders
 * empty, are caught here rather than in production.
 *
 * The signatures are intentionally loose — they check for a structural
 * element, not specific classes or spacing, so a visual refresh of a
 * template doesn't cascade test breakage.
 */
const TEMPLATE_SIGNATURES: Array<{
  id: string;
  label: string;
  signature: string;
  options?: Record<string, unknown>;
}> = [
  {
    id: "centered-card",
    label: "Centered",
    // Centered's form column caps at max-w-sm; other templates diverge.
    signature: "div.max-w-sm",
  },
  {
    id: "split-hero",
    label: "Split Hero",
    // Hero panel uses lg:flex flex-1 — only renders on Split Hero.
    signature: "div.hidden.lg\\:flex.flex-1.relative.overflow-hidden",
    options: {
      heroHeadline: { en: "Acme", zh: "Acme" },
      heroSide: "left",
    },
  },
  {
    id: "full-bleed",
    label: "Full-bleed",
    // Glass card wraps form with rounded-2xl + p-8/10 inside a full-height
    // absolute-background container.
    signature: "div.min-h-screen.relative.overflow-hidden",
  },
  {
    id: "minimal-inline",
    label: "Minimal",
    // Minimal uses max-w-md (wider) + top-aligned pt-16.
    signature: "div.max-w-md",
  },
  {
    id: "sidebar-brand",
    label: "Sidebar Brand",
    // Persistent sidebar on lg — aside element, hidden < lg.
    signature: "aside.hidden.lg\\:flex",
  },
];

/**
 * Variants the app serves. Each template should render its signature on
 * all three so a regression in one page type gets caught.
 */
const VARIANTS = [
  { name: "signin", path: `/login/built-in/app-built-in` },
  { name: "signup", path: `/signup/app-built-in` },
  { name: "forget", path: `/forget/app-built-in` },
] as const;

test.describe("Template matrix (signin / signup / forget)", () => {
  for (const variant of VARIANTS) {
    for (const { id, label, signature, options } of TEMPLATE_SIGNATURES) {
      test(`${variant.name} · ${label} (${id}) renders its signature`, async ({ page }) => {
        await page.goto(`${variant.path}?preview=1&asGuest=1`);
        await page.waitForLoadState("networkidle");
        await page.evaluate(
          ({ tpl, opts }) => {
            window.postMessage(
              {
                type: "jetauth.preview.config",
                payload: { template: tpl, templateOptions: opts ?? {} },
              },
              window.location.origin,
            );
          },
          { tpl: id, opts: options },
        );
        await expect(page.locator(signature).first()).toBeVisible({ timeout: 10_000 });
      });
    }
  }
});
