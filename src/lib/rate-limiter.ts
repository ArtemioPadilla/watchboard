/**
 * rate-limiter.ts — serialises calls to a third-party API at a minimum
 * spacing. Nominatim's usage policy is one request per second per
 * application; a burst of right-clicks must queue, not fire in parallel.
 * Pure (clock and sleep injectable) so the spacing is unit-tested.
 */
export interface RateLimiter {
  /** Runs `fn` no sooner than `minIntervalMs` after the previous run started. */
  schedule<T>(fn: () => Promise<T>): Promise<T>;
  /** Number of calls waiting. */
  pending(): number;
}

export function createRateLimiter(
  minIntervalMs: number,
  deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): RateLimiter {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  let lastStart = -Infinity;
  let chain: Promise<unknown> = Promise.resolve();
  let waiting = 0;

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      waiting += 1;
      const run = chain.then(async () => {
        const wait = lastStart + minIntervalMs - now();
        if (wait > 0) await sleep(wait);
        lastStart = now();
        waiting -= 1;
        return fn();
      });
      // Keep the chain alive even if fn rejects.
      chain = run.catch(() => undefined);
      return run;
    },
    pending: () => waiting,
  };
}
