import {
  type Env,
  type PushSubscriptionData,
  corsHeaders,
  optionsResponse,
  jsonResponse,
  hashEndpoint,
  addToTrackerIndex,
} from './_shared';

interface SubscribeBody {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  trackers: string[];
  categories?: string[];
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return optionsResponse(request);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: SubscribeBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, request);
  }

  const { subscription, trackers, categories } = body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return jsonResponse({ error: 'Missing subscription data' }, 400, request);
  }

  if (!Array.isArray(trackers) || trackers.length === 0) {
    return jsonResponse({ error: 'At least one tracker required' }, 400, request);
  }

  const subHash = await hashEndpoint(subscription.endpoint);
  const subKey = `sub:${subHash}`;

  const data: PushSubscriptionData = {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    trackers,
    categories: categories || ['breaking', 'daily'],
    createdAt: new Date().toISOString(),
    lastPushAt: null,
  };

  // Store subscription
  await env.PUSH_SUBSCRIPTIONS.put(subKey, JSON.stringify(data));

  // Update tracker reverse indexes
  await Promise.all(trackers.map(t => addToTrackerIndex(env.PUSH_SUBSCRIPTIONS, t, subHash)));

  return jsonResponse({ ok: true, hash: subHash }, 201, request);
};

// GET returns VAPID public key for the client to use
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY }, 200, request);
};
