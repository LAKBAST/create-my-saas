import { defineConfig } from "@playwright/test";

// Repository checks use the root Playwright dependency; generated projects can
// install @playwright/test to run this optional browser suite independently.
export default defineConfig({
  testDir: "./test",
  testMatch: "admin-dashboard.spec.mjs",
  workers: 1,
  timeout: 45000,
  outputDir: "./test-results/admin-dashboard",
  use: {
    baseURL: "http://127.0.0.1:3327",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "node node_modules/astro/astro.js dev --host 127.0.0.1 --port 3327",
    cwd: process.env.ASTRO_ADMIN_TEST_ROOT ?? ".",
    url: "http://127.0.0.1:3327/admin/",
    timeout: 90000,
    env: {
      API_PROXY_TARGET: "http://127.0.0.1:3328",
      PUBLIC_API_BASE_URL: "",
      PUBLIC_POSTHOG_KEY: "",
      PUBLIC_POSTHOG_HOST: "",
    },
  },
});
