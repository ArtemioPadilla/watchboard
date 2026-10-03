import { describe, it, expect } from 'vitest';
import { postVideoOnce, classifyTelegramResponse, type VideoRecordLike } from './telegram-video';

function harness(initial: VideoRecordLike | null, response: { status: number; body: unknown } | Error) {
  let record = initial;
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(String(url));
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as unknown as typeof fetch;
  const run = () => postVideoOnce({
    recordPath: 'rec.json', date: '2026-09-24', videoPath: 'v.mp4', caption: 'cap', chatId: '-100public', token: 'T',
    fetchFn, readFile: () => Buffer.from('mp4'), now: () => new Date('2026-09-24T00:05:00Z'),
    loadRecord: () => record, saveRecord: (_p, r) => { record = r; },
  });
  return { run, calls, get record() { return record; } };
}

describe('classifyTelegramResponse', () => {
  it('2xx with ok:true and a message id is sent', () =>
    expect(classifyTelegramResponse(200, { ok: true, result: { message_id: 42 } })).toEqual({ status: 'sent', messageId: 42 }));
  it('4xx is rejected (Telegram did not publish)', () =>
    expect(classifyTelegramResponse(400, { ok: false })).toEqual({ status: 'rejected', httpStatus: 400 }));
  it('5xx is unknown (it may have published)', () => expect(classifyTelegramResponse(502, null).status).toBe('unknown'));
  it('2xx without ok:true or a message id is unknown', () => {
    expect(classifyTelegramResponse(200, { ok: true }).status).toBe('unknown');
    expect(classifyTelegramResponse(200, { ok: false, result: { message_id: 1 } }).status).toBe('unknown');
    expect(classifyTelegramResponse(200, null).status).toBe('unknown');
  });
});

describe('postVideoOnce', () => {
  it('sends once, records it, and skips on a re-run', async () => {
    const h = harness({ date: '2026-09-24', posted: { bluesky: { url: 'b', postedAt: 'x' } }, caption_en: 'keep' }, { status: 200, body: { ok: true, result: { message_id: 9 } } });
    expect(await h.run()).toBe('sent');
    expect(h.record!.posted.telegram).toEqual({ url: 'telegram:message/9', postedAt: '2026-09-24T00:05:00.000Z' });
    expect(h.record!.caption_en).toBe('keep');
    expect(h.record!.posted.bluesky).toEqual({ url: 'b', postedAt: 'x' });
    expect(await h.run()).toBe('skipped');
    expect(h.calls).toHaveLength(1);
  });
  it('a 4xx is rejected and not recorded', async () => {
    const h = harness(null, { status: 400, body: { ok: false, description: 'Bad Request' } });
    expect(await h.run()).toBe('rejected');
    expect(h.record?.posted.telegram).toBeUndefined();
  });
  it('a network error is recorded as uncertain so a re-run does not post again', async () => {
    const h = harness(null, new Error('ETIMEDOUT'));
    expect(await h.run()).toBe('unknown');
    expect(h.record!.posted.telegram).toMatchObject({ uncertain: true });
    expect(await h.run()).toBe('skipped');
    expect(h.calls).toHaveLength(1);
  });
  it('a 5xx is recorded as uncertain and never retried', async () => {
    const h = harness(null, { status: 502, body: null });
    expect(await h.run()).toBe('unknown');
    expect(h.record!.posted.telegram).toMatchObject({ uncertain: true });
    expect(await h.run()).toBe('skipped');
    expect(h.calls).toHaveLength(1);
  });
});
