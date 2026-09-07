import { defineConfig } from 'vitest/config';

// Live-network tests are opt-in via RUN_LIVE_TESTS=1 (`npm run test:live`);
// see tests/helpers/live.ts. They get a longer timeout because the
// upstreams (DeepState, GDACS, Nominatim, OpenSky) are not ours.
const live = process.env.RUN_LIVE_TESTS === '1';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: live ? 30_000 : 5_000,
  },
});
