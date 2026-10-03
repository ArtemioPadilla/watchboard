/**
 * Bluesky has a readable author feed, so the platform itself is the record of
 * truth for "did we already post this?" — it survives a failed git push of
 * queue-*.json, which the file-based state does not (spec §6 F3c).
 */
export interface FeedAgentLike {
  getAuthorFeed(p: { actor: string; limit: number }): Promise<{ data: { feed: Array<{ post: { uri: string; record: unknown } }> } }>;
}

/** Normalised comparison key for a post's text. */
export function postKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
}

/**
 * Index of the account's own posts created within `windowMs` of `nowMs`,
 * keyed by `postKey(text)` → AT URI. A failing feed call yields an empty
 * index: the dedupe is a safety net and must never block posting.
 */
export async function recentOwnPostIndex(
  agent: FeedAgentLike,
  actor: string,
  nowMs: number,
  windowMs: number,
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  try {
    const res = await agent.getAuthorFeed({ actor, limit: 50 });
    for (const { post } of res.data.feed) {
      const rec = post.record as { text?: unknown; createdAt?: unknown } | null;
      if (typeof rec?.text !== 'string' || typeof rec.createdAt !== 'string') continue;
      const created = Date.parse(rec.createdAt);
      if (Number.isNaN(created) || nowMs - created > windowMs) continue;
      index.set(postKey(rec.text), post.uri);
    }
  } catch (err) {
    console.warn(`::warning::[bluesky] own-feed dedupe unavailable (${(err as Error).message}) — posting without it`);
  }
  return index;
}
