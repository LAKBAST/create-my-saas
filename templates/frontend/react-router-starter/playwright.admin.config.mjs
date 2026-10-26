import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Repository checks use the root development dependency on @playwright/test.
export default defineConfig({
  testDir: './test',
  testMatch: 'admin-dashboard.spec.mjs',
  outputDir: '../../../test-results/admin-react-router',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: { baseURL: 'http://127.0.0.1:3217', browserName: 'chromium', headless: true, screenshot: 'only-on-failure' },
  webServer: {
    command: 'node node_modules/@react-router/dev/bin.js dev --host 127.0.0.1 --port 3217',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:3217/login',
    timeout: 120_000,
    env: { API_PROXY_TARGET: 'http://127.0.0.1:3218', VITE_POSTHOG_KEY: '', VITE_POSTHOG_HOST: '' },
  },
});
