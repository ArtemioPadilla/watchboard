/**
 * Shared utilities for push notification Cloudflare Workers.
 * Prefixed with _ so Cloudflare Pages doesn't treat it as a route.
 */

export interface Env {
  PUSH_SUBSCRIPTIONS: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string; // e.g. "mailto:admin@watchboard.dev"
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  trackers: string[];
  categories: string[]; // "breaking" | "daily"
  createdAt: string;
  lastPushAt: string | null;
}

export interface TrackerSubsIndex {
  tracker: string;
  subscribers: string[];
}

const ALLOWED_ORIGINS = [
  'https://watchboard.dev',
  'https://www.watchboard.dev',
  'http://localhost:4321',
  'http://localhost:3000',
];

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export function optionsResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(data: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

/** SHA-256 hash of the subscription endpoint, used as KV key */
export async function hashEndpoint(endpoint: string): Promise<string> {
  const encoded = new TextEncoder().encode(endpoint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Add a subscriber hash to a tracker's reverse index */
export async function addToTrackerIndex(kv: KVNamespace, tracker: string, subHash: string): Promise<void> {
  const key = `tracker-subs:${tracker}`;
  const existing = await kv.get<TrackerSubsIndex>(key, 'json');
  const subscribers = existing?.subscribers || [];
  if (!subscribers.includes(subHash)) {
    subscribers.push(subHash);
  }
  await kv.put(key, JSON.stringify({ tracker, subscribers }));
}

/** Remove a subscriber hash from a tracker's reverse index */
export async function removeFromTrackerIndex(kv: KVNamespace, tracker: string, subHash: string): Promise<void> {
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
