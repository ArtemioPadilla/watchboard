import { describe, it, expect } from 'vitest';
import { isDueOn, markPostedOn, selectDue, approvalOf, type TrackedEntry } from './social-due';

const now = new Date('2026-09-28T13:05:00Z');

function entry(over: Partial<TrackedEntry> = {}): TrackedEntry {
  return {
    id: 'e1',
    type: 'digest',
    voice: 'analyst',
    tracker: 'iran-conflict',
    lang: 'en',
    text: 'x',
    hashtags: ['#Watchboard'],
    link: 'https://watchboard.dev/iran-conflict/',
    image: null,
    memegenUrl: null,
    publishAt: '2026-09-28T13:00:00Z',
    status: 'approved',
    estimatedCost: 0.01,
    judge: { score: 0.9, verdict: 'PUBLISH', factChecks: [], comment: '' } as unknown as TrackedEntry['judge'],
    threadTweets: null,
    tweetId: null,
    postedAt: null,
    ...over,
  };
}

describe('isDueOn', () => {
  it('a human-approved, due entry is due on both platforms', () => {
    const e = entry();
    expect(isDueOn(e, 'bluesky', now, { allowAutoApproved: true })).toBe(true);
    expect(isDueOn(e, 'x', now, { allowAutoApproved: false })).toBe(true);
  });

  it('auto-approved entries reach Bluesky but not X while X is manual-only', () => {
    const e = entry({ status: 'auto_approved' });
    expect(isDueOn(e, 'bluesky', now, { allowAutoApproved: true })).toBe(true);
    expect(isDueOn(e, 'x', now, { allowAutoApproved: false })).toBe(false);
    expect(isDueOn(e, 'x', now, { allowAutoApproved: true })).toBe(true);
  });

  it('is not due before publishAt, with a bad date, or in an excluded language', () => {
    expect(isDueOn(entry({ publishAt: '2026-09-28T18:00:00Z' }), 'x', now, { allowAutoApproved: false })).toBe(false);
    expect(isDueOn(entry({ publishAt: 'nope' }), 'x', now, { allowAutoApproved: false })).toBe(false);
    expect(isDueOn(entry({ lang: 'fr' }), 'x', now, { allowAutoApproved: false, languages: ['en', 'es'] })).toBe(false);
    expect(isDueOn(entry({ lang: 'es' }), 'x', now, { allowAutoApproved: false, languages: ['en', 'es'] })).toBe(true);
  });

  it('pending, held, rejected and expired are never due', () => {
    for (const status of ['pending_review', 'held', 'rejected', 'expired'] as const) {
      expect(isDueOn(entry({ status }), 'bluesky', now, { allowAutoApproved: true })).toBe(false);
    }
  });

  it('legacy posted entries (no postedTo) are posted everywhere', () => {
    const e = entry({ status: 'posted', tweetId: 'at://did:plc/abc' });
    expect(isDueOn(e, 'x', now, { allowAutoApproved: true })).toBe(false);
    expect(isDueOn(e, 'bluesky', now, { allowAutoApproved: true })).toBe(false);
  });
});

describe('markPostedOn + cross-platform flow', () => {
  it('Bluesky posting first does not starve X, and X still applies its manual gate', () => {
    const manual = entry({ id: 'm', status: 'approved' });
    const auto = entry({ id: 'a', status: 'auto_approved' });

    markPostedOn(manual, 'bluesky', { id: 'at://m', at: now.toISOString() });
    markPostedOn(auto, 'bluesky', { id: 'at://a', at: now.toISOString() });

    expect(manual.status).toBe('posted');
    expect(manual.tweetId).toBe('at://m'); // legacy field filled by the first platform
    expect(manual.approval).toBe('manual');
    expect(auto.approval).toBe('auto');

    // Bluesky is done with both
    expect(isDueOn(manual, 'bluesky', now, { allowAutoApproved: true })).toBe(false);
    // X: the human-approved one is still due; the auto one is not (manual-only mode)
    expect(isDueOn(manual, 'x', now, { allowAutoApproved: false })).toBe(true);
    expect(isDueOn(auto, 'x', now, { allowAutoApproved: false })).toBe(false);
    expect(isDueOn(auto, 'x', now, { allowAutoApproved: true })).toBe(true);

    markPostedOn(manual, 'x', { id: '1234', url: 'https://x.com/watchboard_dev/status/1234', at: now.toISOString() });
    expect(manual.postedTo?.x?.id).toBe('1234');
    expect(manual.tweetId).toBe('at://m'); // not overwritten
    expect(isDueOn(manual, 'x', now, { allowAutoApproved: true })).toBe(false);
  });

  it('X posting first leaves Bluesky due and fills tweetId with the tweet id', () => {
    const e = entry();
    markPostedOn(e, 'x', { id: '99', at: now.toISOString() });
    expect(e.tweetId).toBe('99');
    expect(isDueOn(e, 'bluesky', now, { allowAutoApproved: true })).toBe(true);
    expect(isDueOn(e, 'x', now, { allowAutoApproved: true })).toBe(false);
  });

  it('selectDue filters a mixed queue', () => {
    const q = [entry({ id: '1' }), entry({ id: '2', status: 'auto_approved' }), entry({ id: '3', status: 'held' })];
    expect(selectDue(q, 'x', now, { allowAutoApproved: false }).map((e) => e.id)).toEqual(['1']);
    expect(selectDue(q, 'bluesky', now, { allowAutoApproved: true }).map((e) => e.id)).toEqual(['1', '2']);
  });

  it('approvalOf reads the remembered approval after status flips', () => {
    const e = entry({ status: 'auto_approved' });
    expect(approvalOf(e)).toBe('auto');
    markPostedOn(e, 'bluesky', { id: 'at://x', at: now.toISOString() });
    expect(approvalOf(e)).toBe('auto');
    expect(approvalOf(entry({ status: 'held' }))).toBeNull();
  });
});
