/**
 * Newsletter subscription handlers for the Watchboard Push Worker.
 *
 * Endpoints:
 *   POST /newsletter/subscribe   — add email to newsletter list
 *   POST /newsletter/unsubscribe — remove email from newsletter list
 *   GET  /newsletter/unsubscribe — remove email (from email link with ?token=HMAC)
 *   POST /newsletter/send        — trigger newsletter send (authenticated via NEWSLETTER_SECRET)
 */

import type { Env } from '../index';

const KV_PREFIX = 'newsletter:';

// Simple email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate HMAC-SHA256 token for unsubscribe links. */
async function hmacToken(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase().trim()));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Subscribe an email to the newsletter. */
async function subscribe(email: string, env: Env): Promise<Response> {
  const normalized = email.toLowerCase().trim();
  if (!isValidEmail(normalized)) {
    return Response.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const hash = await sha256(normalized);
  const key = `${KV_PREFIX}${hash}`;

  // Check if already subscribed
  const existing = await env.PUSH_SUBSCRIPTIONS.get(key);
  if (existing) {
    return Response.json({ ok: true, message: 'Already subscribed' });
  }

  // Store subscriber
  await env.PUSH_SUBSCRIPTIONS.put(key, JSON.stringify({
    email: normalized,
    subscribedAt: new Date().toISOString(),
  }));

  return Response.json({ ok: true, message: 'Subscribed successfully' });
}

/** Unsubscribe an email from the newsletter. */
async function unsubscribe(email: string, env: Env): Promise<Response> {
  const normalized = email.toLowerCase().trim();
  if (!isValidEmail(normalized)) {
    return Response.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const hash = await sha256(normalized);
  const key = `${KV_PREFIX}${hash}`;

  // Remove subscriber record
  await env.PUSH_SUBSCRIPTIONS.delete(key);

  return Response.json({ ok: true, message: 'Unsubscribed successfully' });
}

/** Unsubscribe by HMAC token — iterate subscribers to find the matching email. */
async function unsubscribeByToken(token: string, env: Env): Promise<Response> {
  const secret = getUnsubscribeSecret(env);
  if (!secret) {
    return Response.json({ error: 'Unsubscribe not configured' }, { status: 501 });
  }

  const subscribers = await getAllSubscriberRecords(env);
  for (const { key, email } of subscribers) {
    const expected = await hmacToken(email, secret);
    if (expected === token) {
      await env.PUSH_SUBSCRIPTIONS.delete(key);
      return new Response(unsubscribeSuccessHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
  }

  return new Response(unsubscribeInvalidHtml, { status: 400, headers: { 'Content-Type': 'text/html' } });
}

function getUnsubscribeSecret(env: Env): string | undefined {
  const e = env as unknown as Record<string, string>;
  return e.UNSUBSCRIBE_SECRET || e.NEWSLETTER_SECRET;
}

/** Get all subscriber emails for sending. Uses KV list with prefix iteration. */
async function getAllSubscribers(env: Env): Promise<string[]> {
  const records = await getAllSubscriberRecords(env);
  return records.map(r => r.email);
}

/** Get all subscriber records (key + email) via KV prefix listing. */
async function getAllSubscriberRecords(env: Env): Promise<Array<{ key: string; email: string }>> {
  const results: Array<{ key: string; email: string }> = [];
  let cursor: string | undefined;

  do {
    const list = await env.PUSH_SUBSCRIPTIONS.list({ prefix: KV_PREFIX, cursor });
    for (const { name } of list.keys) {
      const data = await env.PUSH_SUBSCRIPTIONS.get(name, 'json') as { email: string } | null;
      if (data?.email) {
        results.push({ key: name, email: data.email });
      }
    }
    cursor = list.list_complete ? undefined : (list as unknown as { cursor: string }).cursor;
  } while (cursor);

  return results;
}

/** Trigger newsletter send. Requires NEWSLETTER_SECRET header for authentication. */
async function triggerSend(request: Request, env: Env): Promise<Response> {
  // Authenticate
  const secret = (env as unknown as Record<string, string>).NEWSLETTER_SECRET;
  if (!secret) {
    return Response.json({ error: 'Newsletter sending not configured' }, { status: 501 });
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get newsletter HTML from request body
  const body = await request.json().catch(() => null) as { html?: string; subject?: string } | null;
  if (!body?.html) {
    return Response.json({ error: 'Missing html in request body' }, { status: 400 });
  }

  const subscribers = await getAllSubscribers(env);
  if (subscribers.length === 0) {
    return Response.json({ ok: true, sent: 0, message: 'No subscribers' });
  }

  // Generate per-subscriber HTML with unsubscribe tokens
  const unsubSecret = getUnsubscribeSecret(env);
  const personalizedHtmls: Array<{ email: string; html: string }> = [];
  for (const email of subscribers) {
    let html = body.html;
    if (unsubSecret) {
      const token = await hmacToken(email, unsubSecret);
      html = html.replace(/\{\{UNSUBSCRIBE_TOKEN\}\}/g, token);
    }
    html = html.replace(/\{\{EMAIL\}\}/g, email);
    personalizedHtmls.push({ email, html });
  }

  // Placeholder: log the intent (actual sending to be wired to email provider)
  const subject = body.subject || 'Watchboard Weekly Digest';
  console.log(`Newsletter send triggered: "${subject}" → ${subscribers.length} subscribers`);

  return Response.json({
    ok: true,
    subject,
    subscriberCount: subscribers.length,
    message: `Newsletter queued for ${subscribers.length} subscribers`,
  });
}

// --- HTML templates ---
const unsubscribeSuccessHtml = `<!DOCTYPE html>
<html><head><title>Unsubscribed — Watchboard</title>
<style>body{background:#0a0b0e;color:#e8e9ed;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.card{background:#181b23;padding:32px;border-radius:8px;border:1px solid #2a2d3a;text-align:center;max-width:400px}
h1{font-size:20px;margin:0 0 12px;color:#2ecc71}p{color:#9498a8;font-size:14px}
a{color:#e74c3c;text-decoration:underline}</style></head>
<body><div class="card"><h1>Unsubscribed</h1><p>You've been removed from the Watchboard weekly digest. <a href="https://watchboard.dev">Return to Watchboard</a>.</p></div></body></html>`;

const unsubscribeInvalidHtml = `<!DOCTYPE html>
<html><head><title>Invalid Link — Watchboard</title>
<style>body{background:#0a0b0e;color:#e8e9ed;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.card{background:#181b23;padding:32px;border-radius:8px;border:1px solid #2a2d3a;text-align:center;max-width:400px}
h1{font-size:20px;margin:0 0 12px}p{color:#9498a8;font-size:14px}
a{color:#e74c3c;text-decoration:underline}</style></head>
<body><div class="card"><h1>Invalid Link</h1><p>This unsubscribe link is invalid or expired. Return to <a href="https://watchboard.dev">Watchboard</a>.</p></div></body></html>`;

const unsubscribeMissingHtml = `<!DOCTYPE html>
<html><head><title>Unsubscribe — Watchboard</title>
<style>body{background:#0a0b0e;color:#e8e9ed;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.card{background:#181b23;padding:32px;border-radius:8px;border:1px solid #2a2d3a;text-align:center;max-width:400px}
h1{font-size:20px;margin:0 0 12px}p{color:#9498a8;font-size:14px}
a{color:#e74c3c;text-decoration:underline}</style></head>
<body><div class="card"><h1>Unsubscribe</h1><p>Missing token parameter. Return to <a href="https://watchboard.dev">Watchboard</a>.</p></div></body></html>`;

/** Main handler for /newsletter/* routes */
export async function handleNewsletter(request: Request, env: Env, path: string): Promise<Response> {
  // POST /newsletter/subscribe
  if (path === '/newsletter/subscribe' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { email?: string } | null;
    if (!body?.email) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }
    return subscribe(body.email, env);
  }

  // POST /newsletter/unsubscribe
  if (path === '/newsletter/unsubscribe' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { email?: string } | null;
    if (!body?.email) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }
    return unsubscribe(body.email, env);
  }

  // GET /newsletter/unsubscribe?token=... (from email link, HMAC-based)
  if (path === '/newsletter/unsubscribe' && request.method === 'GET') {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return new Response(unsubscribeMissingHtml, { status: 400, headers: { 'Content-Type': 'text/html' } });
    }
    return unsubscribeByToken(token, env);
  }

  // POST /newsletter/send — trigger send (authenticated)
  if (path === '/newsletter/send' && request.method === 'POST') {
    return triggerSend(request, env);
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}
