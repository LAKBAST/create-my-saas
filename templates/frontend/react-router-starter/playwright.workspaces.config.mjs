import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

process.env.WORKSPACE_TEST_UPSTREAM_PORT = '3248';
export default defineConfig({
  testDir: './test', testMatch: 'workspaces.spec.mjs', outputDir: '../../../test-results/workspaces-react-router',
  workers: 1, timeout: 60000, expect: { timeout: 20000 },
  use: { baseURL: 'http://127.0.0.1:3247', browserName: 'chromium', headless: true },
  webServer: {
    command: 'node node_modules/@react-router/dev/bin.js dev --host 127.0.0.1 --port 3247',
    cwd: fileURLToPath(new URL('.', import.meta.url)), url: 'http://127.0.0.1:3247/login', timeout: 120000,
    env: { API_PROXY_TARGET: 'http://127.0.0.1:3248', VITE_POSTHOG_KEY: '', VITE_POSTHOG_HOST: '' },
  },
});
