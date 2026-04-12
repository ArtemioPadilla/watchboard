import type { Env } from '../index';
import { sendPushNotification } from '../web-push';

interface RssItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  category: string;
  pubDate: string;
  image: string | null;
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const get = (tag: string) => {
      const m = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, '').trim() : '';
    };
    const rawDescription = get('description');
    const imageUrl = extractImageUrl(rawDescription, content);
    items.push({
      title: get('title'),
      link: get('link'),
      guid: get('guid'),
      description: rawDescription.slice(0, 200),
      category: get('category') || 'daily',
      pubDate: get('pubDate'),
      image: imageUrl,
    });
  }
  return items;
}

function decodeXmlEntities(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractImageUrl(description: string, fullItemXml?: string): string | null {
  // 1. Check for media:content or media:thumbnail in the raw XML
  if (fullItemXml) {
    const mediaMatch = fullItemXml.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i);
    if (mediaMatch) return decodeXmlEntities(mediaMatch[1]);
  }

  // 2. Check for <img> tag in description
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return decodeXmlEntities(imgMatch[1]);

  // 3. Check for <enclosure> with image type in raw XML
  if (fullItemXml) {
    const enclosureMatch = fullItemXml.match(/<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i);
    if (enclosureMatch) return decodeXmlEntities(enclosureMatch[1]);
    // Also try url before type
    const enclosureMatch2 = fullItemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i);
    if (enclosureMatch2) return decodeXmlEntities(enclosureMatch2[1]);
  }

  return null;
}

function extractTrackerSlug(link: string): string | null {
  const m = link.match(/watchboard\.dev\/([a-z0-9-]+)/);
  return m ? m[1] : null;
}

export async function handleCron(env: Env): Promise<Response> {
  // Fetch RSS
  const res = await fetch('https://watchboard.dev/rss.xml', {
    headers: { 'User-Agent': 'Watchboard-Push/1.0' },
  });
  if (!res.ok) {
    return Response.json({ error: `RSS fetch failed: ${res.status}` }, { status: 502 });
  }

  const xml = await res.text();
  const items = parseRssItems(xml);

  // Get last seen GUIDs
  const lastSeen = await env.PUSH_SUBSCRIPTIONS.get('last-seen-guids', 'json') as string[] | null;
  const seenSet = new Set(lastSeen ?? []);

  // Find new items
  const newItems = items.filter(item => !seenSet.has(item.guid));
  if (newItems.length === 0) {
    return Response.json({ ok: true, newItems: 0, pushed: 0 });
  }

  // Update seen GUIDs (keep last 200)
  const allGuids = [...new Set([...items.map(i => i.guid), ...(lastSeen ?? [])])].slice(0, 200);
  await env.PUSH_SUBSCRIPTIONS.put('last-seen-guids', JSON.stringify(allGuids));

  let totalPushed = 0;
  const staleEndpoints: string[] = [];

  for (const item of newItems) {
    const slug = extractTrackerSlug(item.link);
    if (!slug) continue;

    // Get subscribers for this tracker
    const indexKey = `tracker-subs:${slug}`;
    const subKeys = await env.PUSH_SUBSCRIPTIONS.get(indexKey, 'json') as string[] | null;
    if (!subKeys?.length) continue;

    const isBreaking = item.category === 'breaking';
    const notificationPayload: Record<string, string> = {
      title: isBreaking ? `⚡ ${item.title}` : `🔴 ${item.title}`,
      body: item.description,
      icon: '/icons/icon-192.png',
      url: item.link,
      tag: `${slug}-${item.category}-${new Date().toISOString().slice(0, 10)}`,
    };
    if (item.image) {
      notificationPayload.image = item.image;
    }
    const payload = JSON.stringify(notificationPayload);

    for (const subKey of subKeys) {
      const sub = await env.PUSH_SUBSCRIPTIONS.get(subKey, 'json') as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
        categories: string[];
      } | null;
      if (!sub) continue;

      // Check category preference
      if (!sub.categories?.includes(item.category)) continue;

      try {
        const result = await sendPushNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }
        );

        if (result.success) totalPushed++;
        if (result.gone) staleEndpoints.push(subKey);
      } catch (e) {
        console.error(`Push failed for ${subKey}:`, e);
      }
    }
  }

  // Clean stale subscriptions
  for (const subKey of staleEndpoints) {
    await env.PUSH_SUBSCRIPTIONS.delete(subKey);
  }

  return Response.json({ ok: true, newItems: newItems.length, pushed: totalPushed, cleaned: staleEndpoints.length });
}
