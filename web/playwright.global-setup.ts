// Playwright globalSetup — seeds a fresh ReBAC e2e app (org + biz_app
// + authorization model + a few tuples) once before specs run, and
// persists the admin session cookie so each spec can reuse it. The
// teardown hook removes everything it created so the test database
// stays tidy.
//
// Backend assumed at PLAYWRIGHT_BACKEND_URL or http://localhost:8000.
// Built-in admin credentials (admin/123) are the default JetAuth
// dev-environment login.
import { request } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:8000";
const APP_OWNER = "rebac-e2e";
const APP_NAME = "drive_prod_e2e";
const AUTH_STATE_PATH = "playwright/.auth/admin.json";

export default async function globalSetup() {
  const ctx = await request.newContext();

  // Login as built-in admin.
  const loginRes = await ctx.post(`${BASE}/api/login`, {
    data: {
      organization: "built-in",
      application: "app-built-in",
      username: "admin",
      password: "123",
      autoSignin: true,
      type: "login",
    },
  });
  if (!loginRes.ok()) {
    throw new Error(`globalSetup login failed: ${loginRes.status()} ${await loginRes.text()}`);
  }

  // Create org for the e2e fixture (idempotent — ignore conflict).
  await ctx.post(`${BASE}/api/add-organization`, {
    data: { owner: "admin", name: APP_OWNER, displayName: "ReBAC E2E" },
  });

  // Create the biz app.
  await ctx.post(`${BASE}/api/biz-add-app-config`, {
    data: {
      owner: APP_OWNER,
      appName: APP_NAME,
      displayName: "Drive Production E2E",
      modelType: "rebac",
      policyTable: `biz_${APP_NAME}_policy`,
      isEnabled: true,
    },
  });

  // Save authorization model.
  await ctx.post(
    `${BASE}/api/biz-write-authorization-model?appId=${APP_OWNER}/${APP_NAME}`,
    {
      data: {
        schemaDsl: "model\n  schema 1.1\n\ntype user\n\ntype document\n  relations\n    define viewer: [user]\n",
        description: "e2e fixture",
      },
    },
  );

  // Write fixture tuples.
  await ctx.post(`${BASE}/api/biz-write-tuples`, {
    data: {
      appId: `${APP_OWNER}/${APP_NAME}`,
      writes: [
        { object: "document:roadmap-2026", relation: "viewer", user: "user:alice" },
      ],
    },
  });

  // Persist storage state so spec files reuse the cookie.
  mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });
  await ctx.storageState({ path: AUTH_STATE_PATH });
  await ctx.dispose();

  // Specs can pick these up via process.env.
  process.env.PLAYWRIGHT_REBAC_APP = `${APP_OWNER}/${APP_NAME}`;
  process.env.PLAYWRIGHT_ADMIN_AUTH = "1";
}
