import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Runs before each test file, so the state-path override is in place
    // before fetch-breaking.ts resolves it at import time.
    setupFiles: ['./vitest.setup.ts'],
  },
});
