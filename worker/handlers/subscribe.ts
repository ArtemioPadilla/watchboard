import type { Env } from '../index';

export async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  // GET → return VAPID public key
  if (request.method === 'GET') {
    return Response.json({ publicKey: env.VAPID_PUBLIC_KEY });
  }
  
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.json() as {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    trackers: string[];
    categories?: string[];
  };
  
  const { subscription, trackers, categories } = body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  if (!Array.isArray(trackers) || trackers.length === 0) {
    return Response.json({ error: 'At least one tracker required' }, { status: 400 });
  }

  // Hash endpoint for key
  const hash = await sha256(subscription.endpoint);
  const subKey = `sub:${hash}`;

  // Store subscription
  await env.PUSH_SUBSCRIPTIONS.put(subKey, JSON.stringify({
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    trackers,
    categories: categories ?? ['breaking', 'daily'],
    createdAt: new Date().toISOString(),
    lastPushAt: null,
  }));

  // Update reverse indexes
  for (const tracker of trackers) {
    const indexKey = `tracker-subs:${tracker}`;
    const existing = await env.PUSH_SUBSCRIPTIONS.get(indexKey, 'json') as string[] | null;
    const subs = new Set(existing ?? []);
    subs.add(subKey);
    await env.PUSH_SUBSCRIPTIONS.put(indexKey, JSON.stringify([...subs]));
  }

  return Response.json({ ok: true, subKey });
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}
