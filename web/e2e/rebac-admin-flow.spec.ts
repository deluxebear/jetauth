import { expect, test } from "@playwright/test";

/**
 * Smoke test for the redesigned ReBAC admin flow (iter-1).
 *
 * Covers the five mockup screens via one happy-path traversal:
 *   1. Overview (mockup ①) — hero stats render
 *   2. Authorization model list (mockup ②) — version rows render
 *   3. Model detail (mockup ③) — DSL editor + actions render
 *   4. Tuples (mockup ④) — facet chips + table render
 *   5. Check tester (mockup ⑤) — 3-column layout renders
 *
 * globalSetup seeds the fixture; just `npm run e2e` to run.
 */

const REBAC_APP = process.env.PLAYWRIGHT_REBAC_APP;

test.describe("ReBAC admin iter-1 happy path", () => {

  test("overview → model list → detail → tuples → tester", async ({ page }) => {
    const [, appName] = (REBAC_APP as string).split("/");

    // 1. Overview — open the app's authorization page directly.
    await page.goto(`/applications/admin/${appName}/authorization?tab=overview`);
    // Header model-type badge proves we're on the right app + tab dispatcher.
    await expect(page.getByText(/rebac/i).first()).toBeVisible();
    // One of the four hero tiles — pick a stable label.
    await expect(page.getByText(/check qps/i)).toBeVisible({ timeout: 10_000 });

    // 2. Authorization model list.
    await page.getByRole("button", { name: /授权模型|authorization model/i }).first().click();
    await expect(page.getByText(/版本历史|version history/i)).toBeVisible();

    // 3. Detail view — click the active row, then return.
    await page.locator("[role='button']").filter({ hasText: /已激活|active/i }).first().click();
    await expect(page.getByRole("button", { name: /发布新版|publish new/i })).toBeVisible();
    await page.getByRole("button", { name: /^返回|^back/i }).click();
    await expect(page.getByText(/版本历史|version history/i)).toBeVisible();

    // 4. Tuples — facet chips visible, table renders.
    await page.getByRole("button", { name: /^关系|^tuples/i }).first().click();
    await expect(page.getByPlaceholder(/搜索 user|search user/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^●? ?user$/ })).toBeVisible();

    // 5. Check tester — 3-column layout, run button visible.
    await page.getByRole("button", { name: /check 测试|check tester/i }).first().click();
    await expect(page.getByRole("button", { name: /执行|execute/i })).toBeVisible();
  });
});
