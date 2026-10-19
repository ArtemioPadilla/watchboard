import { defineConfig } from 'vitest/config';

/**
 * This package needs its own config, and it needs to ask esbuild for nothing.
 *
 * Without a config here, vitest walks up and loads the repo root's
 * `vitest.config.ts` — which imports `vitest` from the root `node_modules`.
 * The CI job for this package installs only `video/node_modules`, so Node
 * reported `Cannot find package 'vitest' imported from <root>/vitest.config.ts`
 * and nothing ran.
 *
 * With a config here, vite's root becomes `video/`, and
 * `src/data/fetch-breaking.ts` imports the parent repo's
 * `src/lib/activity-index.ts` — outside that root. esbuild then hunted for a
 * tsconfig covering it and failed: `[TSCONFIG_ERROR] Failed to load tsconfig
 * for '../src/lib/activity-index.ts'`. `tsconfigRaw` answers the question so
 * it stops asking; the transform only needs to strip types, and the real type
 * checking is `npm run typecheck` against this package's own tsconfig.
 *
 * Both failure modes were observed in CI on 2026-10-19 and neither reproduces
 * locally, where the root `node_modules` exists.
 */
export default defineConfig({
  esbuild: {
    tsconfigRaw: {},
  },
});
