import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:14701',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config apps/web/vite.config.mjs',
    url: 'http://127.0.0.1:14701',
    reuseExistingServer: false,
    env: {
      WEB_PORT: '14701',
      API_PORT: '14700',
      VITE_API_URL: 'http://127.0.0.1:14700',
      VITE_OPERATION_TIMEOUT_MS: '1500',
    },
  },
});
