import { describe, it, expect, vi } from 'vitest';
import { alertAndRecord, postTelegram, sendOpsAlert } from './hourly-light-scan';

const empty = () => ({ seen: [], alerted: [], telegramFailed: [] }) as never;
const cand = { title: 't', url: 'u', score: 0.9, tracker: 'gaza-war', topicKey: 'k' };
const env = { TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '@public' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const netErr = (code?: string) => Object.assign(new TypeError('fetch failed'), code ? { cause: { code } } : {});

describe('alertAndRecord', () => {
  it('writes the alert to disk before anything else can crash', async () => {
    const state = empty() as { alerted: unknown[] };
    const saved: number[] = [];
    const out = await alertAndRecord(state as never, cand,
      { post: async () => 'sent', save: s => saved.push((s as { alerted: unknown[] }).alerted.length), now: () => new Date('2026-09-24T00:00:00Z') });
    expect(out).toBe('sent');
    expect(saved).toEqual([1]);
    expect(state.alerted).toEqual([{ tracker: 'gaza-war', topicKey: 'k', ts: '2026-09-24T00:00:00.000Z' }]);
  });
  it('does not record or save a rejected post (the caller queues it for retry)', async () => {
    const state = empty() as { alerted: unknown[] };
    const save = vi.fn();
    const onUncertain = vi.fn();
    expect(await alertAndRecord(state as never, cand, { post: async () => 'rejected', save, onUncertain })).toBe('rejected');
    expect(save).not.toHaveBeenCalled();
    expect(onUncertain).not.toHaveBeenCalled();
    expect(state.alerted).toEqual([]);
  });
  it('records an unknown outcome as uncertain, saves it and alerts privately', async () => {
    const state = empty() as { alerted: unknown[]; telegramFailed: unknown[] };
    const order: string[] = [];
    const out = await alertAndRecord(state as never, cand, {
      post: async () => 'unknown',
      save: () => order.push('save'),
      onUncertain: () => { order.push('ops'); },
      now: () => new Date('2026-09-24T00:00:00Z'),
    });
    expect(out).toBe('unknown');
    expect(order).toEqual(['save', 'ops']);
    expect(state.alerted).toEqual([{ tracker: 'gaza-war', topicKey: 'k', ts: '2026-09-24T00:00:00.000Z', uncertain: true }]);
    expect(state.telegramFailed).toEqual([]);
  });
});

describe('postTelegram outcome', () => {
  const post = (fetchImpl: () => Promise<Response>) =>
    postTelegram('t', 'u', 0.9, 'gaza-war', { env, fetchImpl: fetchImpl as never, timeoutMs: 1000 });

  it('sent on 2xx with a numeric message_id', async () => {
    expect(await post(async () => json(200, { ok: true, result: { message_id: 42 } }))).toBe('sent');
  });
  it('unknown on 2xx without a message_id', async () => {
    expect(await post(async () => json(200, { ok: true }))).toBe('unknown');
  });
  it('rejected on 4xx', async () => {
    expect(await post(async () => json(400, { ok: false, description: 'Bad Request' }))).toBe('rejected');
  });
  it('unknown on 5xx', async () => {
    expect(await post(async () => json(502, { ok: false }))).toBe('unknown');
  });
  it('unknown on a timeout or reset', async () => {
    expect(await post(async () => { throw new DOMException('aborted', 'AbortError'); })).toBe('unknown');
    expect(await post(async () => { throw netErr('ECONNRESET'); })).toBe('unknown');
    expect(await post(async () => { throw netErr(); })).toBe('unknown');
  });
  it('rejected when the request never reached Telegram', async () => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'])
      expect(await post(async () => { throw netErr(code); })).toBe('rejected');
  });
  it('rejected without credentials, and no request is made', async () => {
    const fetchImpl = vi.fn();
    expect(await postTelegram('t', 'u', 0.9, 'x', { env: {}, fetchImpl })).toBe('rejected');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('uncertain sends are never queued for a public retry', () => {
  for (const [name, impl] of [
    ['5xx', async () => json(500, { ok: false })],
    ['throw', async () => { throw netErr('ETIMEDOUT'); }],
  ] as const) {
    it(`a ${name} lands in alerted (uncertain), not telegramFailed`, async () => {
      const state = empty() as { alerted: Array<{ uncertain?: boolean }>; telegramFailed: unknown[] };
      const out = await alertAndRecord(state as never, cand, {
        post: (t, u, s, tr) => postTelegram(t, u, s, tr, { env, fetchImpl: impl as never }),
        save: () => {},
        onUncertain: () => {},
      });
      // Mirrors main(): only a `rejected` outcome is pushed to telegramFailed.
      if (out === 'rejected') state.telegramFailed.push(cand);
      expect(out).toBe('unknown');
      expect(state.telegramFailed).toEqual([]);
      expect(state.alerted[0].uncertain).toBe(true);
    });
  }
});

describe('sendOpsAlert', () => {
  it('posts to the private chat only', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true, result: { message_id: 1 } }));
    const ok = await sendOpsAlert('hi', { env: { ...env, TELEGRAM_ALERT_CHAT_ID: '-100private', TELEGRAM_CHANNEL_ID: '@public' }, fetchImpl: fetchImpl as never });
    expect(ok).toBe(true);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.chat_id).toBe('-100private');
  });
  it('refuses when the alert chat is the public channel', async () => {
    const fetchImpl = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendOpsAlert('hi', { env: { ...env, TELEGRAM_ALERT_CHAT_ID: '@public', TELEGRAM_CHANNEL_ID: '@public' }, fetchImpl })).toBe(false);
    expect(await sendOpsAlert('hi', { env: { ...env, TELEGRAM_ALERT_CHAT_ID: '@public' }, fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('is a warning, not a send, without the private chat id', async () => {
    const fetchImpl = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await sendOpsAlert('hi', { env, fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
