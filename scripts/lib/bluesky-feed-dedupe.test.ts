import { describe, it, expect } from 'vitest';
import { postKey, recentOwnPostIndex, type FeedAgentLike } from './bluesky-feed-dedupe';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const agent = (feed: Array<{ uri: string; text: string; createdAt: string }>): FeedAgentLike => ({
  getAuthorFeed: async () => ({ data: { feed: feed.map(f => ({ post: { uri: f.uri, record: { text: f.text, createdAt: f.createdAt } } })) } }),
});

describe('postKey', () => {
  it('collapses whitespace, lower-cases and cuts at 120 chars', () => {
    expect(postKey('  🔴 Gaza   War\n\nDetails ')).toBe('🔴 gaza war details');
    expect(postKey('x'.repeat(300))).toHaveLength(120);
  });
});

describe('recentOwnPostIndex', () => {
  it('indexes posts inside the window only', async () => {
    const idx = await recentOwnPostIndex(agent([
      { uri: 'at://1', text: 'Fresh post', createdAt: '2026-09-24T08:00:00Z' },
      { uri: 'at://2', text: 'Old post', createdAt: '2026-09-22T08:00:00Z' },
    ]), 'did:plc:bot', NOW, 24 * 3600_000);
    expect(idx.get(postKey('Fresh post'))).toBe('at://1');
    expect(idx.has(postKey('Old post'))).toBe(false);
  });
  it('returns an empty index when the feed call fails (it never blocks posting)', async () => {
    const failing: FeedAgentLike = { getAuthorFeed: async () => { throw new Error('503'); } };
    expect((await recentOwnPostIndex(failing, 'did:plc:bot', NOW, 24 * 3600_000)).size).toBe(0);
  });
});
