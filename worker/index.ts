/**
 * Watchboard Push Notifications Worker
 * Standalone Cloudflare Worker at push.watchboard.dev
 * 
 * Routes:
 *   GET  /subscribe              → returns VAPID public key
 *   POST /subscribe              → register push subscription
 *   POST /unsubscribe            → remove push subscription
 *   GET  /preferences            → get subscription preferences
 *   PUT  /preferences            → update subscription preferences
 *   POST /cron                   → manual trigger for RSS poll (also runs on cron)
 *   POST /newsletter/subscribe   → add email to newsletter list
 *   POST /newsletter/unsubscribe → remove email from newsletter list
 *   GET  /newsletter/unsubscribe → unsubscribe via email link
 *   POST /newsletter/send        → trigger newsletter send (authenticated)
 */

export interface Env {
  PUSH_SUBSCRIPTIONS: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

// Import handler modules
import { handleSubscribe } from './handlers/subscribe';
import { handleUnsubscribe } from './handlers/unsubscribe';
import { handlePreferences } from './handlers/preferences';
import { handleCron } from './handlers/cron';
import { handleNewsletter } from './handlers/newsletter';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://watchboard.dev',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return corsResponse(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      switch (path) {
        case '/subscribe':
          return corsResponse(await handleSubscribe(request, env));
        case '/unsubscribe':
          return corsResponse(await handleUnsubscribe(request, env));
        case '/preferences':
          return corsResponse(await handlePreferences(request, env));
        case '/cron':
          if (request.method === 'POST') {
            return corsResponse(await handleCron(env));
          }
          return jsonResponse({ error: 'Method not allowed' }, 405);
        case '/':
          return jsonResponse({
            service: 'Watchboard Push Notifications',
            endpoints: ['/subscribe', '/unsubscribe', '/preferences', '/cron', '/newsletter/subscribe', '/newsletter/unsubscribe', '/newsletter/send'],
          });
        default:
          // Newsletter routes (all under /newsletter/*)
          if (path.startsWith('/newsletter')) {
            return corsResponse(await handleNewsletter(request, env, path));
          }
          return jsonResponse({ error: 'Not found' }, 404);
      }
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  // Cron handler — runs every 15 minutes
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await handleCron(env);
  },
};
