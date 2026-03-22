import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:4321/watchboard/',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 4321,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
