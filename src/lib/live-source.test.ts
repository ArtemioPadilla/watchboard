import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchLiveSource, peekLiveSource, clearLiveSources, subscribeLiveSource, isDue,
  FAIL_RETRY_MS, RATE_LIMIT_BASE_MS, RATE_LIMIT_MAX_MS, MAX_ENTRIES,
} from './live-source';

type Item = { id: number };

function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function fakeFetch(script: Array<{ status: number; body?: unknown; delayMs?: number; throws?: string }>) {
  const calls: string[] = [];
  let i = 0;
  const impl = (async (url: string) => {
    calls.push(url);
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (step.throws) throw new Error(step.throws);
    return {
      status: step.status,
      ok: step.status >= 200 && step.status < 300,
      json: async () => step.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const parse = async (r: Response) => (await r.json()) as Item[];
const URL_ = 'https://example.test/feed';

describe('fetchLiveSource', () => {
  beforeEach(() => clearLiveSources());

  it('returns cached data within the TTL without a second request', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }]);
    const spec = { key: 'a', url: URL_, ttlMs: 10_000, parse, now: clock.now, fetchImpl: f.impl };
    const r1 = await fetchLiveSource(spec);
    expect(r1.status).toBe('ok');
    expect(r1.data).toEqual([{ id: 1 }]);
    clock.advance(5_000);
    const r2 = await fetchLiveSource(spec);
    expect(r2.data).toEqual([{ id: 1 }]);
    expect(f.calls).toHaveLength(1);
  });

  it('dedupes concurrent callers into one request', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }]);
    const spec = { key: 'b', url: URL_, ttlMs: 10_000, parse, now: clock.now, fetchImpl: f.impl };
    const [r1, r2, r3] = await Promise.all([fetchLiveSource(spec), fetchLiveSource(spec), fetchLiveSource(spec)]);
    expect(f.calls).toHaveLength(1);
    expect(r1.data).toEqual(r2.data);
    expect(r3.status).toBe('ok');
  });

  it('refetches once the TTL expires', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }, { status: 200, body: [{ id: 2 }] }]);
    const spec = { key: 'c', url: URL_, ttlMs: 10_000, parse, now: clock.now, fetchImpl: f.impl };
    await fetchLiveSource(spec);
    clock.advance(10_001);
    const r = await fetchLiveSource(spec);
    expect(r.data).toEqual([{ id: 2 }]);
    expect(f.calls).toHaveLength(2);
  });

  it('on 429 keeps the last good data as rate-limited and backs off 30/60/120 s', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }, { status: 429 }, { status: 429 }, { status: 429 }, { status: 429 }]);
    const spec = { key: 'd', url: URL_, ttlMs: 1_000, parse, now: clock.now, fetchImpl: f.impl };
    await fetchLiveSource(spec);
    clock.advance(1_001);
    const r = await fetchLiveSource(spec);
    expect(r.status).toBe('rate-limited');
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.retryAt).toBe(clock.now() + RATE_LIMIT_BASE_MS);
    // Inside the window: no request.
    clock.advance(RATE_LIMIT_BASE_MS - 1);
    await fetchLiveSource(spec);
    expect(f.calls).toHaveLength(2);
    clock.advance(1);
    const r2 = await fetchLiveSource(spec);
    expect(r2.retryAt).toBe(clock.now() + RATE_LIMIT_BASE_MS * 2);
    clock.advance(RATE_LIMIT_BASE_MS * 2);
    const r3 = await fetchLiveSource(spec);
    expect(r3.retryAt).toBe(clock.now() + RATE_LIMIT_MAX_MS);
    clock.advance(RATE_LIMIT_MAX_MS);
    const r4 = await fetchLiveSource(spec);
    expect(r4.retryAt).toBe(clock.now() + RATE_LIMIT_MAX_MS); // capped
    expect(r4.data).toEqual([{ id: 1 }]);
  });

  it('with no prior data a failure is "error" and retries after 60 s, not the TTL', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 503 }, { status: 200, body: [{ id: 9 }] }]);
    const spec = { key: 'e', url: URL_, ttlMs: 3_600_000, parse, now: clock.now, fetchImpl: f.impl };
    const r = await fetchLiveSource(spec);
    expect(r.status).toBe('error');
    expect(r.data).toBeNull();
    expect(r.error).toContain('503');
    clock.advance(FAIL_RETRY_MS - 1);
    expect(isDue('e', clock.now())).toBe(false);
    clock.advance(1);
    expect(isDue('e', clock.now())).toBe(true);
    const r2 = await fetchLiveSource(spec);
    expect(r2.status).toBe('ok');
    expect(r2.data).toEqual([{ id: 9 }]);
  });

  it('with prior data a failure keeps the data as "stale"', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }, { throws: 'network down', status: 0 }]);
    const spec = { key: 'f', url: URL_, ttlMs: 1_000, parse, now: clock.now, fetchImpl: f.impl };
    await fetchLiveSource(spec);
    clock.advance(1_001);
    const r = await fetchLiveSource(spec);
    expect(r.status).toBe('stale');
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.error).toBe('network down');
  });

  it('data older than 2×TTL is reported stale even without a new attempt', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }]);
    const spec = { key: 'g', url: URL_, ttlMs: 1_000, parse, now: clock.now, fetchImpl: f.impl };
    await fetchLiveSource(spec);
    clock.advance(2_001);
    expect(peekLiveSource('g', clock.now()).status).toBe('stale');
    clock.advance(-1_500);
    expect(peekLiveSource('g', clock.now()).status).toBe('ok');
  });

  it('an empty payload counts as a failed refresh and keeps the previous data', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }, { status: 200, body: [] }]);
    const spec = { key: 'h', url: URL_, ttlMs: 1_000, parse, now: clock.now, fetchImpl: f.impl };
    await fetchLiveSource(spec);
    clock.advance(1_001);
    const r = await fetchLiveSource(spec);
    expect(r.status).toBe('stale');
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.retryAt).toBe(clock.now() + FAIL_RETRY_MS);
  });

  it('an empty first payload is stored (so the UI can say "0") but retried in 60 s', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [] }]);
    const spec = { key: 'i', url: URL_, ttlMs: 60_000, parse, now: clock.now, fetchImpl: f.impl };
    const r = await fetchLiveSource(spec);
    expect(r.data).toEqual([]);
    expect(r.status).toBe('ok');
    expect(isDue('i', clock.now() + FAIL_RETRY_MS)).toBe(true);
  });

  it('an aborted request does not write to the cache', async () => {
    const clock = makeClock();
    const ac = new AbortController();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }]);
    const spec = { key: 'j', url: URL_, ttlMs: 1_000, parse, now: clock.now, fetchImpl: f.impl, signal: ac.signal };
    const p = fetchLiveSource(spec);
    ac.abort();
    const r = await p;
    expect(r.data).toBeNull();
    expect(peekLiveSource('j', clock.now()).data).toBeNull();
  });

  it('notifies subscribers on loading and on settle', async () => {
    const clock = makeClock();
    const f = fakeFetch([{ status: 200, body: [{ id: 1 }] }]);
    const seen: string[] = [];
    const unsub = subscribeLiveSource<Item[]>('k', 1_000, r => seen.push(r.status));
    await fetchLiveSource({ key: 'k', url: URL_, ttlMs: 1_000, parse, now: clock.now, fetchImpl: f.impl });
    expect(seen).toEqual(['loading', 'ok']);
    unsub();
  });

  it('evicts the oldest idle entry beyond MAX_ENTRIES', async () => {
    const clock = makeClock();
    for (let n = 0; n < MAX_ENTRIES + 1; n++) {
      const f = fakeFetch([{ status: 200, body: [{ id: n }] }]);
      await fetchLiveSource({ key: `k${n}`, url: URL_, ttlMs: 1_000, parse, now: clock.now, fetchImpl: f.impl });
    }
    expect(peekLiveSource('k0', clock.now()).status).toBe('idle');
    expect(peekLiveSource(`k${MAX_ENTRIES}`, clock.now()).status).toBe('ok');
  });
});
