import {
  type Env,
  type PushSubscriptionData,
  optionsResponse,
  jsonResponse,
  hashEndpoint,
  addToTrackerIndex,
  removeFromTrackerIndex,
} from './_shared';

interface PreferencesBody {
  endpoint: string;
  trackers: string[];
  categories?: string[];
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return optionsResponse(request);
};

/** GET: retrieve current preferences for a subscription */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');

  if (!endpoint) {
    return jsonResponse({ error: 'Missing endpoint param' }, 400, request);
  }

  const subHash = await hashEndpoint(endpoint);
  const existing = await env.PUSH_SUBSCRIPTIONS.get<PushSubscriptionData>(`sub:${subHash}`, 'json');

  if (!existing) {
    return jsonResponse({ error: 'Subscription not found' }, 404, request);
  }

  return jsonResponse({
    trackers: existing.trackers,
    categories: existing.categories,
    createdAt: existing.createdAt,
  }, 200, request);
};

/** PUT: update tracker selection and categories */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let body: PreferencesBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, request);
  }

  if (!body.endpoint) {
    return jsonResponse({ error: 'Missing endpoint' }, 400, request);
  }

  if (!Array.isArray(body.trackers) || body.trackers.length === 0) {
    return jsonResponse({ error: 'At least one tracker required' }, 400, request);
  }

  const subHash = await hashEndpoint(body.endpoint);
  const subKey = `sub:${subHash}`;
  const existing = await env.PUSH_SUBSCRIPTIONS.get<PushSubscriptionData>(subKey, 'json');

  if (!existing) {
    return jsonResponse({ error: 'Subscription not found' }, 404, request);
  }

  // Diff tracker lists to update reverse indexes
  const oldTrackers = new Set(existing.trackers);
  const newTrackers = new Set(body.trackers);

  const added = body.trackers.filter(t => !oldTrackers.has(t));
  const removed = existing.trackers.filter(t => !newTrackers.has(t));

  await Promise.all([
    ...added.map(t => addToTrackerIndex(env.PUSH_SUBSCRIPTIONS, t, subHash)),
    ...removed.map(t => removeFromTrackerIndex(env.PUSH_SUBSCRIPTIONS, t, subHash)),
  ]);

  // Update subscription
  existing.trackers = body.trackers;
  if (body.categories) {
    existing.categories = body.categories;
  }

  await env.PUSH_SUBSCRIPTIONS.put(subKey, JSON.stringify(existing));

  return jsonResponse({ ok: true, trackers: existing.trackers, categories: existing.categories }, 200, request);
};
