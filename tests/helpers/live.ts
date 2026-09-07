/**
 * Opt-in helpers for tests that touch the network.
 *
 * `npm test` must stay green with no network: DeepState, GDACS, Nominatim
 * and OpenSky are outside our control and CI must not depend on them. A
 * test written with `liveIt` is skipped unless `RUN_LIVE_TESTS=1`, which
 * `npm run test:live` sets.
 *
 * Usage:
 *   import { liveIt, liveDescribe } from '../helpers/live';
 *   liveDescribe('DeepState API', () => {
 *     liveIt('returns a FeatureCollection', async () => { ... });
 *   });
 */
import { describe, it } from 'vitest';

export const LIVE_TESTS_ENABLED = process.env.RUN_LIVE_TESTS === '1';

/** Timeout applied to live tests; upstreams can be slow. */
export const LIVE_TEST_TIMEOUT_MS = 30_000;

export const liveIt = LIVE_TESTS_ENABLED ? it : it.skip;
export const liveDescribe = LIVE_TESTS_ENABLED ? describe : describe.skip;
