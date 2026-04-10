import type { Env } from '../index';

export async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.json() as { endpoint: string };
  if (!body?.endpoint) {
    return Response.json({ error: 'Endpoint required' }, { status: 400 });
  }

  const hash = await sha256(body.endpoint);
  const subKey = `sub:${hash}`;

  // Get current subscription to find tracked trackers
  const sub = await env.PUSH_SUBSCRIPTIONS.get(subKey, 'json') as { trackers: string[] } | null;
  
  // Remove from reverse indexes
  if (sub?.trackers) {
    for (const tracker of sub.trackers) {
      const indexKey = `tracker-subs:${tracker}`;
      const existing = await env.PUSH_SUBSCRIPTIONS.get(indexKey, 'json') as string[] | null;
      if (existing) {
        const updated = existing.filter(s => s !== subKey);
        if (updated.length > 0) {
          await env.PUSH_SUBSCRIPTIONS.put(indexKey, JSON.stringify(updated));
        } else {
          await env.PUSH_SUBSCRIPTIONS.delete(indexKey);
        }
      }
    }
  }

  // Delete subscription
  await env.PUSH_SUBSCRIPTIONS.delete(subKey);

  return Response.json({ ok: true });
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}
