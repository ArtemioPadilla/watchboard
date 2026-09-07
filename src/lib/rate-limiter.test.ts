import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limiter';

function clock(start = 0) {
  let t = start;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => { slept.push(ms); t += ms; },
    advance: (ms: number) => { t += ms; },
    slept,
  };
}

describe('createRateLimiter', () => {
  it('spaces consecutive calls by the minimum interval', async () => {
    const c = clock();
    const rl = createRateLimiter(1000, c);
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => rl.schedule(async () => { starts.push(c.now()); })));
    expect(starts).toEqual([0, 1000, 2000]);
    expect(c.slept).toEqual([1000, 1000]);
  });

  it('does not wait when enough time has already passed', async () => {
    const c = clock();
    const rl = createRateLimiter(1000, c);
    await rl.schedule(async () => 1);
    c.advance(5000);
    await rl.schedule(async () => 2);
    expect(c.slept).toEqual([]);
  });

  it('keeps serving after a rejected call and reports pending count', async () => {
    const c = clock();
    const rl = createRateLimiter(10, c);
    const p1 = rl.schedule(async () => { throw new Error('boom'); });
    const p2 = rl.schedule(async () => 'ok');
    expect(rl.pending()).toBe(2);
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe('ok');
    expect(rl.pending()).toBe(0);
  });
});
