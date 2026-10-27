import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

process.env.WORKSPACE_TEST_UPSTREAM_PORT = '3258';
export default defineConfig({
  testDir: './test', testMatch: 'workspaces.spec.mjs', outputDir: '../../../test-results/workspaces-astro',
  workers: 1, timeout: 60000, expect: { timeout: 20000 },
  use: { baseURL: 'http://127.0.0.1:3257', browserName: 'chromium', headless: true },
  webServer: {
    command: 'node node_modules/astro/astro.js dev --host 127.0.0.1 --port 3257',
    cwd: process.env.ASTRO_WORKSPACE_TEST_ROOT ?? fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:3257/login/', timeout: 120000,
    env: { API_PROXY_TARGET: 'http://127.0.0.1:3258', PUBLIC_API_BASE_URL: '', PUBLIC_POSTHOG_KEY: '', PUBLIC_POSTHOG_HOST: '' },
  },
});
