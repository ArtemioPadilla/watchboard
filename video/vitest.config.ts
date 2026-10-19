import { defineConfig } from 'vitest/config';

/**
 * This package needs a config of its own, even an empty one.
 *
 * Without it vitest walks up and loads the repo root's `vitest.config.ts`,
 * whose `include` globs point at the root's own suites — and which imports
 * `vitest` from the root `node_modules`. In the CI job for this package that
 * produced `Cannot find package 'vitest' imported from <root>/vitest.config.ts`
 * and nothing ran.
 */
export default defineConfig({});
