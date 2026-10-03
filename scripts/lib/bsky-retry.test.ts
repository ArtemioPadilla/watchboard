import { describe, it, expect } from 'vitest';
import { makeTid, createWithRetry } from './bsky-retry';

const noSleep = async () => {};

describe('makeTid', () => {
  it('is 13 base32-sortable characters', () => {
    const t = makeTid(Date.UTC(2026, 8, 29, 4, 18, 49), 7);
    expect(t).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/);
  });

  it('sorts by time', () => {
    const a = makeTid(1_790_000_000_000, 1023);
    const b = makeTid(1_790_000_000_001, 0);
    expect(a < b).toBe(true);
  });

  it('encodes the clock id in the low bits', () => {
    const now = 1_790_000_000_000;
    expect(makeTid(now, 0)).not.toBe(makeTid(now, 1));
    expect(makeTid(now, 0).slice(0, 11)).toBe(makeTid(now, 1).slice(0, 11));
  });
});

describe('createWithRetry', () => {
  it('returns the first success without looking for an existing record', async () => {
    let lookups = 0;
    const r = await createWithRetry(async () => 'ok', async () => { lookups++; return null; }, { sleep: noSleep });
    expect(r).toBe('ok');
    expect(lookups).toBe(0);
  });

  it('retries a dropped connection and succeeds', async () => {
    let calls = 0;
    const waits: number[] = [];
    const r = await createWithRetry(
      async () => { calls++; if (calls < 3) throw new Error('fetch failed'); return 'posted'; },
      async () => null,
      { sleep: async (ms) => { waits.push(ms); }, delaysMs: [10, 20, 30] },
    );
    expect(r).toBe('posted');
    expect(calls).toBe(3);
    expect(waits).toEqual([10, 20]);
  });

  it('does not post twice when the failed attempt actually landed', async () => {
    let calls = 0;
    const r = await createWithRetry(
      async () => { calls++; throw new Error('fetch failed'); },
      async () => 'at://did/app.bsky.feed.post/abc',
      { sleep: noSleep },
    );
    expect(r).toBe('at://did/app.bsky.feed.post/abc');
    expect(calls).toBe(1);
  });

  it('treats a failing lookup as "not there" and keeps retrying', async () => {
    let calls = 0;
    const r = await createWithRetry(
      async () => { calls++; if (calls === 1) throw new Error('fetch failed'); return 'ok'; },
      async () => { throw new Error('lookup down'); },
      { sleep: noSleep },
    );
    expect(r).toBe('ok');
  });

  it('throws the last error once retries run out', async () => {
    let calls = 0;
    const logs: string[] = [];
    await expect(
      createWithRetry(
        async () => { calls++; throw new Error(`boom ${calls}`); },
        async () => null,
        { sleep: noSleep, delaysMs: [1, 1], log: (l) => logs.push(l) },
      ),
    ).rejects.toThrow('boom 3');
    expect(calls).toBe(3);
    expect(logs.filter((l) => l.includes('failed'))).toHaveLength(3);
  });
});
