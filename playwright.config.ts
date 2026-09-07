import { defineConfig } from '@playwright/test';

// The site is served at base '/' (astro.config.mjs). Specs use relative
// paths ('./iran-conflict/') so they follow baseURL.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:4321/',
    headless: true,
    launchOptions: {
      // Cesium needs WebGL; SwiftShader gives headless Chromium a software GL.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
      // Sandboxes that pre-install Chromium at a fixed path set this instead
      // of downloading the pinned build (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome).
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: {
    command: 'npm run dev',
    port: 4321,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
