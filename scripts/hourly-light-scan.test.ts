import { describe, it, expect, vi } from 'vitest';
import { alertAndRecord } from './hourly-light-scan';

const empty = () => ({ seen: [], alerted: [], telegramFailed: [] }) as never;

describe('alertAndRecord', () => {
  it('writes the alert to disk before anything else can crash', async () => {
    const state = empty() as { alerted: unknown[] };
    const saved: number[] = [];
    const ok = await alertAndRecord(state as never, { title: 't', url: 'u', score: 0.9, tracker: 'gaza-war', topicKey: 'k' },
      { post: async () => true, save: s => saved.push((s as { alerted: unknown[] }).alerted.length), now: () => new Date('2026-09-24T00:00:00Z') });
    expect(ok).toBe(true);
    expect(saved).toEqual([1]);
    expect(state.alerted).toEqual([{ tracker: 'gaza-war', topicKey: 'k', ts: '2026-09-24T00:00:00.000Z' }]);
  });
  it('does not record or save a failed post', async () => {
    const state = empty() as { alerted: unknown[] };
    const save = vi.fn();
    expect(await alertAndRecord(state as never, { title: 't', url: 'u', score: 0.9, tracker: 'x', topicKey: 'k' }, { post: async () => false, save })).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(state.alerted).toEqual([]);
  });
});
