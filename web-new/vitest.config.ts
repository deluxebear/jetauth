import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: [
      "@testing-library/jest-dom/vitest",
      "./src/__tests__/setup-axe.ts",
    ],
    // e2e/ holds Playwright specs; those have their own runner (npm run e2e)
    // and import from @playwright/test, not vitest. Excluding them here
    // prevents vitest from tripping over the imports.
    exclude: ["node_modules", "dist", "e2e/**"],
  },
});
