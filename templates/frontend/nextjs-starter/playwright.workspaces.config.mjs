import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

process.env.WORKSPACE_TEST_UPSTREAM_PORT = '3238';
export default defineConfig({
  testDir: './test', testMatch: 'workspaces.spec.mjs', outputDir: '../../../test-results/workspaces-nextjs',
  workers: 1, timeout: 60000, expect: { timeout: 20000 },
  use: { baseURL: 'http://127.0.0.1:3237', browserName: 'chromium', headless: true },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3237',
    cwd: fileURLToPath(new URL('.', import.meta.url)), url: 'http://127.0.0.1:3237/login', timeout: 120000,
    env: { API_PROXY_TARGET: 'http://127.0.0.1:3238', NEXT_PUBLIC_API_BASE_URL: '', NEXT_PUBLIC_POSTHOG_KEY: '', NEXT_PUBLIC_POSTHOG_HOST: '' },
  },
});
