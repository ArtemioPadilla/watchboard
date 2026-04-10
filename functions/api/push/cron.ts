/**
 * Push notification dispatch worker.
 * Called by Cloudflare Cron Trigger every 15 minutes.
 * Polls the site RSS feed, diffs against last-seen GUIDs, and
 * sends push notifications to subscribers of affected trackers.
 *
 * Can also be triggered manually via GET /api/push/cron (with ?key= auth).
 */

import type { Env, PushSubscriptionData, TrackerSubsIndex } from './_shared';
import { jsonResponse, corsHeaders } from './_shared';
import { sendPushNotification } from './_web-push';

const SITE_URL = 'https://watchboard.dev';
const RSS_URL = `${SITE_URL}/rss.xml`;
const MAX_PUSHES_PER_RUN = 500;

interface RssItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  category: string; // "daily" or "breaking"
  pubDate: string;
  tracker: string;  // extracted from link
}

// ─── Entry points ───

/** Cron trigger handler (Cloudflare scheduled event) */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // Simple auth for manual triggers
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (key && key !== env.VAPID_SUBJECT) {
    return jsonResponse({ error: 'Unauthorized' }, 401, request);
  }

  const result = await processRssAndNotify(env);
  return jsonResponse(result, 200, request);
};

// ─── Core logic ───

async function processRssAndNotify(env: Env) {
  // 1. Fetch RSS
  const rssResponse = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'Watchboard-Push/1.0' },
  });

  if (!rssResponse.ok) {
    return { error: 'Failed to fetch RSS', status: rssResponse.status };
  }

  const rssText = await rssResponse.text();
  const items = parseRssItems(rssText);

  if (items.length === 0) {
    return { processed: 0, pushed: 0, message: 'No RSS items found' };
  }

  // 2. Get last-seen GUIDs
  const lastSeenRaw = await env.PUSH_SUBSCRIPTIONS.get('meta:last-seen-guids');
  const lastSeenGuids: Set<string> = lastSeenRaw ? new Set(JSON.parse(lastSeenRaw)) : new Set();

  // 3. Find new items
  const newItems = items.filter(item => !lastSeenGuids.has(item.guid));

  if (newItems.length === 0) {
    return { processed: items.length, newItems: 0, pushed: 0 };
  }

  // 4. Send push notifications for each new item
  let totalPushed = 0;
  let totalGone = 0;
  const goneSubscriptions: string[] = [];

  for (const item of newItems) {
    if (totalPushed >= MAX_PUSHES_PER_RUN) break;

    const trackerKey = `tracker-subs:${item.tracker}`;
    const trackerIndex = await env.PUSH_SUBSCRIPTIONS.get<TrackerSubsIndex>(trackerKey, 'json');

    if (!trackerIndex || trackerIndex.subscribers.length === 0) continue;

    const isBreaking = item.category === 'breaking';
    const payload = JSON.stringify({
      title: isBreaking
        ? `\u26A1 BREAKING: ${item.title}`
        : `\uD83D\uDD34 ${item.title}`,
      body: item.description.slice(0, 200),
      icon: '/icons/icon-192.png',
      url: item.link,
      tag: `${item.tracker}-${item.category}-${item.guid.slice(-10)}`,
      tracker: item.tracker,
    });

    const vapid = {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    };

    // Fan out to all subscribers of this tracker
    for (const subHash of trackerIndex.subscribers) {
      if (totalPushed >= MAX_PUSHES_PER_RUN) break;

      const subData = await env.PUSH_SUBSCRIPTIONS.get<PushSubscriptionData>(`sub:${subHash}`, 'json');
      if (!subData) continue;

      // Check category preference
      if (!subData.categories.includes(item.category)) continue;

      try {
        const result = await sendPushNotification(subData, payload, vapid);
        if (result.success) {
          totalPushed++;
        } else if (result.gone) {
          totalGone++;
          goneSubscriptions.push(subHash);
        }
      } catch {
        // Individual push failure — continue with others
      }
    }
  }

  // 5. Clean up gone subscriptions
  for (const subHash of goneSubscriptions) {
    const subData = await env.PUSH_SUBSCRIPTIONS.get<PushSubscriptionData>(`sub:${subHash}`, 'json');
    if (subData) {
      for (const tracker of subData.trackers) {
        await removeFromTrackerIndexSimple(env.PUSH_SUBSCRIPTIONS, tracker, subHash);
      }
      await env.PUSH_SUBSCRIPTIONS.delete(`sub:${subHash}`);
    }
  }

  // 6. Update last-seen GUIDs (keep last 200 to prevent unbounded growth)
  const allGuids = [...lastSeenGuids, ...items.map(i => i.guid)];
  const trimmedGuids = allGuids.slice(-200);
  await env.PUSH_SUBSCRIPTIONS.put('meta:last-seen-guids', JSON.stringify(trimmedGuids));

  return {
    processed: items.length,
    newItems: newItems.length,
    pushed: totalPushed,
    staleRemoved: totalGone,
  };
}

// ─── RSS Parsing ───

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const guid = extractTag(itemXml, 'guid') || link;
    const description = extractTag(itemXml, 'description');
    const category = extractTag(itemXml, 'category') || 'daily';
    const pubDate = extractTag(itemXml, 'pubDate');

    if (!title || !link) continue;

    // Extract tracker slug from link: /tracker-slug/#digest-...
    const trackerMatch = link.match(/\/([a-z0-9-]+)\/?#/);
    const tracker = trackerMatch?.[1] || '';

    if (!tracker) continue;

    items.push({ title, link, guid, description: description || '', category, pubDate: pubDate || '', tracker });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`);
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(regex);
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ─── KV helpers (inline to avoid import issues with cron context) ───

async function removeFromTrackerIndexSimple(kv: KVNamespace, tracker: string, subHash: string) {
  const key = `tracker-subs:${tracker}`;
  const existing = await kv.get<TrackerSubsIndex>(key, 'json');
  if (!existing) return;
  const subscribers = existing.subscribers.filter(s => s !== subHash);
  if (subscribers.length === 0) {
    await kv.delete(key);
  } else {
    await kv.put(key, JSON.stringify({ tracker, subscribers }));
  }
}
