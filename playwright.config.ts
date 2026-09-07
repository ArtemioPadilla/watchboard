import { defineConfig } from '@playwright/test';

// The site is served at base '/' (astro.config.mjs). Specs use relative
// paths ('./iran-conflict/') so they follow baseURL.
export default defineConfig({
  testDir: './e2e',
  // The homepage compiles Cesium/globe.gl islands on first request of a cold
  // dev server; on a loaded CI runner that alone can exceed a minute.
  timeout: 180_000,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:4321/',
    navigationTimeout: 150_000,
    actionTimeout: 30_000,
    // BaseLayout registers a service worker; once it controls the page (any
    // reload after the first visit) it serves fetches itself and page.route
    // mocks are bypassed. Tests mock feeds, so keep the worker out.
    serviceWorkers: 'block',
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
    // The DeepState layer is behind a build-time flag until permission is
    // recorded; the e2e exercises it against a routed fixture.
    env: { PUBLIC_ENABLE_DEEPSTATE: 'true' },
    port: 4321,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
