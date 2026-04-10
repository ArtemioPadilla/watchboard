import type { Env } from '../index';

export async function handlePreferences(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint');
    if (!endpoint) return Response.json({ error: 'endpoint param required' }, { status: 400 });
    
    const hash = await sha256(endpoint);
    const sub = await env.PUSH_SUBSCRIPTIONS.get(`sub:${hash}`, 'json') as { trackers: string[]; categories: string[] } | null;
    if (!sub) return Response.json({ error: 'Not found' }, { status: 404 });
    
    return Response.json({ trackers: sub.trackers, categories: sub.categories });
  }

  if (request.method === 'PUT') {
    const body = await request.json() as { endpoint: string; trackers: string[]; categories?: string[] };
    if (!body?.endpoint || !Array.isArray(body?.trackers)) {
      return Response.json({ error: 'endpoint and trackers required' }, { status: 400 });
    }

    const hash = await sha256(body.endpoint);
    const subKey = `sub:${hash}`;
    const existing = await env.PUSH_SUBSCRIPTIONS.get(subKey, 'json') as any;
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const oldTrackers = new Set(existing.trackers as string[]);
    const newTrackers = new Set(body.trackers);

    // Remove from old tracker indexes
    for (const tracker of oldTrackers) {
      if (!newTrackers.has(tracker)) {
        const indexKey = `tracker-subs:${tracker}`;
        const subs = await env.PUSH_SUBSCRIPTIONS.get(indexKey, 'json') as string[] | null;
        if (subs) {
          const updated = subs.filter(s => s !== subKey);
          if (updated.length > 0) await env.PUSH_SUBSCRIPTIONS.put(indexKey, JSON.stringify(updated));
          else await env.PUSH_SUBSCRIPTIONS.delete(indexKey);
        }
      }
    }

    // Add to new tracker indexes
    for (const tracker of newTrackers) {
      if (!oldTrackers.has(tracker)) {
        const indexKey = `tracker-subs:${tracker}`;
        const subs = await env.PUSH_SUBSCRIPTIONS.get(indexKey, 'json') as string[] | null;
        const set = new Set(subs ?? []);
        set.add(subKey);
        await env.PUSH_SUBSCRIPTIONS.put(indexKey, JSON.stringify([...set]));
      }
    }

    // Update subscription
    existing.trackers = body.trackers;
    if (body.categories) existing.categories = body.categories;
    await env.PUSH_SUBSCRIPTIONS.put(subKey, JSON.stringify(existing));

    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}
