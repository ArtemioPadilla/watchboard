import { describe, it, expect } from 'vitest';
import { reslotQueue, splitByDay, mergeById, type SchedulableEntry } from './social-schedule';

const now = new Date('2026-09-28T21:06:19Z');
const e = (publishAt: string | null, over: Partial<SchedulableEntry> = {}): SchedulableEntry => ({
  publishAt,
  status: 'auto_approved',
  postedAt: null,
  ...over,
});

describe('reslotQueue', () => {
  it('spreads past-due entries from now, in their original order, 3 h apart', () => {
    // The 2026-09-28 queue: 13:00 and 18:00 had passed when it was written at 21:06.
    const q = [e('2026-09-28T18:00:00Z'), e('2026-09-28T13:00:00Z'), e('2026-09-28T22:00:00Z', { status: 'pending_review' })];
    expect(reslotQueue(q, now)).toBe(2);
    expect(q[1].publishAt).toBe('2026-09-28T21:07:00Z'); // was 13:00 → first
    expect(q[0].publishAt).toBe('2026-09-29T00:07:00Z'); // was 18:00 → +3 h
    expect(q[2].publishAt).toBe('2026-09-28T22:00:00Z'); // future: untouched
  });

  it('compresses the gap so nothing lands past the horizon', () => {
    const q = Array.from({ length: 10 }, () => e('2026-09-28T08:00:00Z'));
    reslotQueue(q, now);
    const last = new Date(q[9].publishAt!).getTime();
    expect(last - new Date('2026-09-28T21:07:00Z').getTime()).toBe(18 * 3600_000);
  });

  it('fills a missing or invalid publishAt', () => {
    const q = [e(null), e('not a date')];
    expect(reslotQueue(q, now)).toBe(2);
    expect(q.every((x) => !Number.isNaN(new Date(x.publishAt!).getTime()))).toBe(true);
  });

  it('never touches posted entries or closed statuses', () => {
    const q = [
      e('2026-09-28T08:00:00Z', { status: 'posted', postedAt: '2026-09-28T08:05:00Z' }),
      e('2026-09-28T08:00:00Z', { postedTo: { bluesky: { id: 'at://x' } } }),
      e('2026-09-28T08:00:00Z', { status: 'held' }),
      e('2026-09-28T08:00:00Z', { status: 'rejected' }),
      e('2026-09-28T08:00:00Z', { status: 'expired' }),
    ];
    expect(reslotQueue(q, now)).toBe(0);
    expect(q.every((x) => x.publishAt === '2026-09-28T08:00:00Z')).toBe(true);
  });

  it('is a no-op when the nightly runs on time', () => {
    const early = new Date('2026-09-28T07:30:00Z');
    const q = [e('2026-09-28T08:00:00Z'), e('2026-09-28T13:00:00Z')];
    expect(reslotQueue(q, early)).toBe(0);
  });
});

describe('splitByDay', () => {
  it('moves open entries scheduled after the file date to that day', () => {
    const q = [
      e('2026-09-28T21:07:00Z'),
      e('2026-09-29T00:07:00Z'),
      e('2026-09-29T03:07:00Z', { status: 'pending_review' }),
      e('2026-09-29T09:00:00Z', { status: 'held' }), // closed: stays where it is
    ];
    const { keep, later } = splitByDay(q, '2026-09-28');
    expect(keep.map((x) => x.publishAt)).toEqual(['2026-09-28T21:07:00Z', '2026-09-29T09:00:00Z']);
    expect([...later.keys()]).toEqual(['2026-09-29']);
    expect(later.get('2026-09-29')!.map((x) => x.publishAt)).toEqual(['2026-09-29T00:07:00Z', '2026-09-29T03:07:00Z']);
  });

  it('the 2026-09-28 case end to end: nothing stays unreachable', () => {
    const q = [e('2026-09-28T13:00:00Z'), e('2026-09-28T18:00:00Z'), e('2026-09-28T22:00:00Z', { status: 'pending_review' })];
    reslotQueue(q, now);
    const { keep, later } = splitByDay(q, '2026-09-28');
    expect(keep.map((x) => x.publishAt)).toEqual(['2026-09-28T21:07:00Z', '2026-09-28T22:00:00Z']);
    expect(later.get('2026-09-29')!.map((x) => x.publishAt)).toEqual(['2026-09-29T00:07:00Z']);
  });
});

describe('mergeById', () => {
  it('keeps existing entries and their state, appends new ids', () => {
    const existing = [{ id: 'a', status: 'posted' }, { id: 'b', status: 'auto_approved' }];
    const incoming = [{ id: 'a', status: 'auto_approved' }, { id: 'c', status: 'auto_approved' }];
    expect(mergeById(existing, incoming)).toEqual([...existing, { id: 'c', status: 'auto_approved' }]);
  });
});
