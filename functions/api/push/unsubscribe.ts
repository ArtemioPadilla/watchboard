import {
  type Env,
  type PushSubscriptionData,
  optionsResponse,
  jsonResponse,
  hashEndpoint,
  removeFromTrackerIndex,
} from './_shared';

interface UnsubscribeBody {
  endpoint: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return optionsResponse(request);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: UnsubscribeBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, request);
  }

  if (!body.endpoint) {
    return jsonResponse({ error: 'Missing endpoint' }, 400, request);
  }

  const subHash = await hashEndpoint(body.endpoint);
  const subKey = `sub:${subHash}`;

  // Get existing subscription to clean up tracker indexes
  const existing = await env.PUSH_SUBSCRIPTIONS.get<PushSubscriptionData>(subKey, 'json');
  if (existing) {
    await Promise.all(
      existing.trackers.map(t => removeFromTrackerIndex(env.PUSH_SUBSCRIPTIONS, t, subHash))
    );
  }

  await env.PUSH_SUBSCRIPTIONS.delete(subKey);

  return jsonResponse({ ok: true }, 200, request);
};
