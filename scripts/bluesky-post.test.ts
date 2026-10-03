import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ queue: [] as any[], saves: [] as string[][] }));
vi.mock('./social-types.js', () => ({
  todayDateString: () => '2026-09-24',
  loadConfig: () => ({}),
  loadBudget: () => ({ monthlyTarget: 1, currentMonth: '2026-09', spent: 0, tweetsPosted: 0, remaining: 1 }),
  loadHistory: () => [],
  loadQueue: () => store.queue,
  saveQueue: (_d: string, q: any[]) => { store.saves.push(q.filter(e => e.status === 'posted').map(e => e.id)); },
  saveBudget: () => {},
  saveHistory: () => {},
}));
import { postFromQueue } from './bluesky-post';

const entry = (id: string, text: string) => ({
  id, type: 'digest', voice: 'analyst', tracker: 'gaza-war', lang: 'en', text, hashtags: [], link: 'https://watchboard.dev/gaza-war/',
  image: null, memegenUrl: null, publishAt: '2026-09-24T00:00:00Z', status: 'approved', estimatedCost: 0.01, judge: {}, threadTweets: null, tweetId: null, postedAt: null,
});

describe('postFromQueue', () => {
  beforeEach(() => { store.saves = []; });

  it('persists after each post, so a crash on the 2nd keeps the 1st recorded', async () => {
    store.queue = [entry('a', 'First headline\nbody'), entry('b', 'Second headline\nbody')];
    let calls = 0;
    // What had been persisted when the 2nd post started. postSkeet swallows a thrown
    // post() and the loop always reaches a final save, so checking store.saves after
    // the run would pass even without the per-post persist. A real crash (runner
    // killed mid-request) never reaches that final save: only what was on disk at
    // this moment survives.
    let savedBeforeSecondPost: string[][] | null = null;
    const agent: any = {
      session: { did: 'did:plc:bot' },
      getAuthorFeed: async () => ({ data: { feed: [] } }),
      post: async () => {
        calls++;
        if (calls === 2) { savedBeforeSecondPost = store.saves.map(s => [...s]); throw new Error('network'); }
        return { uri: `at://${calls}`, cid: 'c' };
      },
    };
    await postFromQueue(false, { getAgent: async () => agent, sleep: async () => {} });
    expect(calls).toBe(2);
    expect(savedBeforeSecondPost).not.toBeNull();
    expect(savedBeforeSecondPost!.length).toBeGreaterThanOrEqual(1);
    expect(savedBeforeSecondPost!.at(-1)).toEqual(['a']);
    expect(store.saves[0]).toEqual(['a']);
    expect(store.queue[0].tweetId).toBe('at://1');
    expect(store.queue[1].status).toBe('approved');
  });

  it('does not re-post an entry already on its own feed; marks it posted with that uri', async () => {
    store.queue = [entry('a', 'First headline\nbody')];
    const posted: unknown[] = [];
    const agent: any = { session: { did: 'did:plc:bot' }, post: async (r: unknown) => { posted.push(r); return { uri: 'at://new', cid: 'c' }; }, getAuthorFeed: async () => ({ data: { feed: [] } }) };
    // First run publishes and captures the exact text that went out.
    await postFromQueue(false, { getAgent: async () => agent, sleep: async () => {} });
    const sentText = (posted[0] as { text: string }).text;
    // Simulate the failed push: the queue on disk is the pre-run one, the feed already has the post.
    store.queue = [entry('a', 'First headline\nbody')];
    posted.length = 0;
    agent.getAuthorFeed = async () => ({ data: { feed: [{ post: { uri: 'at://new', record: { text: sentText, createdAt: new Date().toISOString() } } }] } });
    await postFromQueue(false, { getAgent: async () => agent, sleep: async () => {} });
    expect(posted).toHaveLength(0);
    expect(store.queue[0]).toMatchObject({ status: 'posted', tweetId: 'at://new' });
  });
});
