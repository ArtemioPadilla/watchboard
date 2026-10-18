import { describe, it, expect } from 'vitest';
import {
  EMPTY_STATE,
  TELEGRAM_MAX_CHARS,
  composeProposalMessage,
  describeProposal,
  markNotified,
  pruneNotified,
  resolveAlertTarget,
  selectProposals,
  waitingLabel,
} from '../scripts/lib/social-proposals.js';
import type { QueueEntry, QueueStatus } from '../scripts/social-types.js';

function entry(over: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'e1',
    type: 'contested',
    voice: 'analyst',
    tracker: 'yemen-conflict',
    lang: 'en',
    text: 'Three counts, three sources.',
    hashtags: ['#Yemen', '#Watchboard'],
    link: 'https://watchboard.dev/yemen-conflict/',
    image: null,
    memegenUrl: null,
    publishAt: '2026-10-17T22:00:00Z',
    status: 'pending_review',
    estimatedCost: 0.01,
    judge: { score: 0.82, verdict: 'REVIEW', comment: 'States each side with attribution.', factChecks: [] },
    threadTweets: null,
    tweetId: null,
    postedAt: null,
    ...over,
  };
}

const OPTS = { baseUrl: 'https://watchboard.dev' };

describe('selectProposals', () => {
  it('picks what is waiting on a person and nothing else', () => {
    const statuses: QueueStatus[] = [
      'pending_review', 'held', 'approved', 'auto_approved', 'rejected', 'posted', 'expired',
    ];
    const queue = statuses.map((status, i) => entry({ id: `id-${i}`, status }));
    expect(selectProposals(queue, EMPTY_STATE).map(e => e.status)).toEqual(['pending_review', 'held']);
  });

  it('never announces the same entry twice', () => {
    const queue = [entry({ id: 'a' }), entry({ id: 'b' })];
    const state = markNotified(EMPTY_STATE, ['a'], new Date('2026-10-17T22:00:00Z'));
    expect(selectProposals(queue, state).map(e => e.id)).toEqual(['b']);
  });

  it('keeps the queue order, so the message reads in publish order', () => {
    const queue = [entry({ id: 'late', publishAt: '2026-10-17T22:00:00Z' }), entry({ id: 'early', publishAt: '2026-10-17T08:00:00Z' })];
    expect(selectProposals(queue, EMPTY_STATE).map(e => e.id)).toEqual(['late', 'early']);
  });
});

describe('notified state', () => {
  it('adds without dropping what is already there', () => {
    const at = new Date('2026-10-17T22:00:00Z');
    const state = markNotified(markNotified(EMPTY_STATE, ['a'], at), ['b'], at);
    expect(Object.keys(state.notified).sort()).toEqual(['a', 'b']);
    expect(state.notified.a).toBe('2026-10-17T22:00:00Z');
  });

  it('forgets ids older than the window, so the file cannot grow for ever', () => {
    const now = new Date('2026-10-17T22:00:00Z');
    const old = markNotified(EMPTY_STATE, ['stale'], new Date('2026-08-01T00:00:00Z'));
    const both = markNotified(old, ['fresh'], now);
    expect(Object.keys(pruneNotified(both, now).notified)).toEqual(['fresh']);
  });

  it('keeps an unparseable timestamp rather than re-announcing the entry', () => {
    const state = { notified: { weird: 'not a date' } };
    expect(pruneNotified(state, new Date('2026-10-17T22:00:00Z')).notified.weird).toBe('not a date');
  });
});

describe('describeProposal', () => {
  it('says what it is, what the judge thought, and where to look', () => {
    const d = describeProposal(entry(), 1, OPTS);
    expect(d).toContain('1. contested · yemen-conflict · en');
    expect(d).toContain('judge 0.82 REVIEW');
    expect(d).toContain('needs review');
    expect(d).toContain('https://watchboard.dev/yemen-conflict/');
    expect(d).toContain('slot 2026-10-17T22:00:00Z');
  });

  it('says so when there is no judge assessment, instead of pretending a score', () => {
    const d = describeProposal(entry({ judge: undefined as unknown as QueueEntry['judge'] }), 1, OPTS);
    expect(d).toContain('no judge assessment');
    expect(d).not.toContain('NaN');
  });

  it('summarises fact checks by status', () => {
    const judge = {
      score: 0.5, verdict: 'REVIEW' as const, comment: '',
      factChecks: [
        { claim: 'a', status: 'verified' as const, source: 's' },
        { claim: 'b', status: 'verified' as const, source: 's' },
        { claim: 'c', status: 'warning' as const, source: 's' },
      ],
    };
    expect(describeProposal(entry({ judge }), 1, OPTS)).toContain('fact checks: 2 verified, 1 warning');
  });

  it('flattens a multi-line tweet and marks a thread', () => {
    const d = describeProposal(entry({ text: 'one\n\ntwo', threadTweets: ['b', 'c'] }), 1, OPTS);
    expect(d).toContain('“one two”');
    expect(d).toContain('thread, 3 parts');
  });

  it('labels held separately from pending_review', () => {
    expect(waitingLabel('held')).toBe('held by the judge');
    expect(waitingLabel('pending_review')).toBe('needs review');
  });
});

describe('composeProposalMessage', () => {
  it('is empty when there is nothing waiting, so the caller sends nothing', () => {
    expect(composeProposalMessage([], OPTS)).toBe('');
  });

  it('leads with the count, says why it matters, and ends with the approve link', () => {
    const msg = composeProposalMessage([entry()], OPTS);
    expect(msg).toContain('📝 1 social proposal waiting for you');
    expect(msg).toContain('X posts only what a human approves');
    expect(msg).toContain('Approve or reject: https://watchboard.dev/social/');
  });

  it('links the queue file when it knows the repo', () => {
    const msg = composeProposalMessage([entry()], { ...OPTS, repo: 'o/r', queueFile: 'public/_social/queue-2026-10-17.json' });
    expect(msg).toContain('https://github.com/o/r/blob/main/public/_social/queue-2026-10-17.json');
  });

  it('stays inside the Telegram limit and says how many it dropped', () => {
    // 40 proposals with long judge comments would run to several times the cap.
    const many = Array.from({ length: 40 }, (_, i) =>
      entry({ id: `id-${i}`, text: 'x'.repeat(400), judge: { score: 0.5, verdict: 'REVIEW', comment: 'y'.repeat(400), factChecks: [] } }),
    );
    const msg = composeProposalMessage(many, OPTS);
    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS);
    expect(msg).toMatch(/… and \d+ more in \/social\//);
    expect(msg).toContain('Approve or reject');
  });

  it('keeps at least one proposal even when a single one is enormous', () => {
    // Truncating the only proposal away would leave a message that announces a
    // count and shows nothing.
    const huge = entry({ text: 'x'.repeat(9000), judge: { score: 0.5, verdict: 'REVIEW', comment: 'y'.repeat(9000), factChecks: [] } });
    const msg = composeProposalMessage([huge], OPTS);
    expect(msg).toContain('1. contested · yemen-conflict');
    expect(msg).not.toMatch(/… and \d+ more/);
  });

  it('counts the dropped ones correctly at a tight limit', () => {
    const three = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
    const msg = composeProposalMessage(three, { ...OPTS, maxChars: 700 });
    const shown = (msg.match(/^\d+\. /gm) ?? []).length;
    const omitted = Number(/… and (\d+) more/.exec(msg)?.[1] ?? 0);
    expect(shown + omitted).toBe(3);
    expect(msg.length).toBeLessThanOrEqual(700);
  });
});

// The standing rule in this repo: infra and internal messages go to the
// private ops chat, never to TELEGRAM_CHANNEL_ID, which has outside
// subscribers. These messages carry drafts the judge held and rejected copy,
// so posting them publicly would be worse than not sending at all.
describe('resolveAlertTarget', () => {
  it('sends to the private ops chat', () => {
    expect(resolveAlertTarget({ botToken: 't', alertChatId: '-100ops' }))
      .toEqual({ kind: 'send', chatId: '-100ops' });
  });

  it('refuses when the ops chat IS the public channel', () => {
    const r = resolveAlertTarget({ botToken: 't', alertChatId: '-100same', channelId: '-100same' });
    expect(r.kind).toBe('refuse');
    expect(r.kind === 'refuse' && r.reason).toContain('public channel');
  });

  it('skips quietly without credentials — a missing secret is not a failure here', () => {
    expect(resolveAlertTarget({ alertChatId: '-100ops' }).kind).toBe('skip');
    expect(resolveAlertTarget({ botToken: 't' }).kind).toBe('skip');
    expect(resolveAlertTarget({}).kind).toBe('skip');
  });

  it('still sends when only the channel id is absent', () => {
    expect(resolveAlertTarget({ botToken: 't', alertChatId: '-100ops', channelId: undefined }).kind).toBe('send');
  });
});
