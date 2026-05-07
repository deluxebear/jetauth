// Playwright globalTeardown — deletes the e2e biz app and its parent
// org so consecutive `npm run e2e` invocations start clean. Failures
// are non-fatal (the fixture is recreated on next run anyway).
import { request } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:8000";
const APP_OWNER = "rebac-e2e";
const APP_NAME = "drive_prod_e2e";

export default async function globalTeardown() {
  try {
    const ctx = await request.newContext({
      storageState: "playwright/.auth/admin.json",
    });
    await ctx.post(`${BASE}/api/biz-delete-app-config`, {
      data: { owner: APP_OWNER, name: APP_NAME },
    });
    await ctx.post(`${BASE}/api/delete-organization`, {
      data: { owner: "admin", name: APP_OWNER },
    });
    await ctx.dispose();
  } catch {
    // Teardown errors are non-fatal — the fixture will be recreated
    // and overwritten on the next setup run.
  }
}
