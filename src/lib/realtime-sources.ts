import type { Candidate } from '../../scripts/hourly-types';
import { normalizeCandidate } from '../../scripts/hourly-types';
import { AtpAgent } from '@atproto/api';

/** Hand-curated public OSINT / breaking-news Bluesky accounts.
 *  Adjust by editing this list — no other code changes required. */
const BLUESKY_ACCOUNTS: { handle: string; tier: 1 | 2 | 3 }[] = [
  { handle: 'bnonews.com',          tier: 2 },
  { handle: 'reuters.com',          tier: 2 },
  { handle: 'apnews.com',           tier: 2 },
  { handle: 'theintercept.com',     tier: 2 },
  { handle: 'aljazeera.com',        tier: 2 },
  { handle: 'osinttechnical.bsky.social', tier: 3 },
];

/** Hand-curated public Telegram channels (read via the public preview;
 *  no bot token required for read-only on public channels). */
const TELEGRAM_CHANNELS: { slug: string; tier: 1 | 2 | 3 }[] = [
  { slug: 'BNONews',          tier: 2 },
  { slug: 'reuters',          tier: 2 },
  { slug: 'insiderpaper',     tier: 3 },
  { slug: 'disclosetv',       tier: 3 },
  { slug: 'sentdefender',     tier: 3 },
];

/** Fetch the latest N posts from each Bluesky account and convert to Candidates.
 *  Errors are isolated per-account; a single failure does not abort the rest. */
export async function pollBluesky(perAccountLimit = 10): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const agent = new AtpAgent({ service: 'https://public.api.bsky.app' });
  for (const acct of BLUESKY_ACCOUNTS) {
    try {
      const res = await agent.app.bsky.feed.getAuthorFeed({ actor: acct.handle, limit: perAccountLimit });
      for (const item of res.data.feed) {
        const post = item.post;
        const text = (post.record as { text?: string }).text;
        if (!text) continue;
        const ts = (post.record as { createdAt?: string }).createdAt ?? new Date().toISOString();
        const url = `https://bsky.app/profile/${acct.handle}/post/${post.uri.split('/').pop()}`;
        out.push(normalizeCandidate(
          { title: text.slice(0, 280), url, source: `bsky:${acct.handle}`, timestamp: ts },
          null,
          'bluesky',
          { sourceTier: acct.tier },
        ));
      }
    } catch (err) {
      console.warn(`[realtime] bluesky fetch failed for ${acct.handle}:`, (err as Error).message);
    }
  }
  return out;
}

/** Fetch latest messages from each public Telegram channel via the
 *  t.me/s/{slug} preview page (no bot token, public channels only).
 *  Parse the inline message text by lightweight regex; not a full HTML parser. */
export async function pollTelegram(perChannelLimit = 10): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const ch of TELEGRAM_CHANNELS) {
    try {
      const res = await fetch(`https://t.me/s/${encodeURIComponent(ch.slug)}`, {
        headers: { 'User-Agent': 'WatchboardHourlyScan/1.0' },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const html = await res.text();
      const re = /<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g;
      const idRe = /data-post="([^"]+)"/g;
      const ids: string[] = [];
      for (const m of html.matchAll(idRe)) ids.push(m[1]);
      let i = 0;
      for (const m of html.matchAll(re)) {
        if (i >= perChannelLimit) break;
        const raw = m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').trim();
        if (raw.length < 10) { i++; continue; }
        const id = ids[i] ?? `${ch.slug}-${i}`;
        const url = `https://t.me/${ch.slug}/${id.split('/').pop()}`;
        out.push(normalizeCandidate(
          { title: raw.slice(0, 280), url, source: `tg:${ch.slug}`, timestamp: new Date().toISOString() },
          null,
          'telegram',
          { sourceTier: ch.tier },
        ));
        i++;
      }
    } catch (err) {
      console.warn(`[realtime] telegram fetch failed for ${ch.slug}:`, (err as Error).message);
    }
  }
  return out;
}

/** Convenience: poll both, return unified Candidate[]. */
export async function pollRealtimeSources(): Promise<Candidate[]> {
  const [bsky, tg] = await Promise.all([pollBluesky(), pollTelegram()]);
  return [...bsky, ...tg];
}
