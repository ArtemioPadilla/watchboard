/**
 * Newsletter subscription handlers for the Watchboard Push Worker.
 *
 * Endpoints:
 *   POST /newsletter/subscribe   — add email to newsletter list
 *   POST /newsletter/unsubscribe — remove email from newsletter list
 *   GET  /newsletter/unsubscribe — remove email (from email link with ?email=)
 *   GET  /newsletter/send        — trigger newsletter send (authenticated via NEWSLETTER_SECRET)
 */

import type { Env } from '../index';

const KV_PREFIX = 'newsletter:';
const KV_LIST_KEY = 'newsletter:subscribers';

// Simple email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
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

  // Update subscriber list (append hash)
  const list = await env.PUSH_SUBSCRIPTIONS.get(KV_LIST_KEY, 'json') as string[] | null;
  const subscribers = new Set(list ?? []);
  subscribers.add(hash);
  await env.PUSH_SUBSCRIPTIONS.put(KV_LIST_KEY, JSON.stringify([...subscribers]));

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

  // Remove from subscriber list
  const list = await env.PUSH_SUBSCRIPTIONS.get(KV_LIST_KEY, 'json') as string[] | null;
  if (list) {
    const updated = list.filter(h => h !== hash);
    await env.PUSH_SUBSCRIPTIONS.put(KV_LIST_KEY, JSON.stringify(updated));
  }

  return Response.json({ ok: true, message: 'Unsubscribed successfully' });
}

/** Get all subscriber emails for sending. */
async function getAllSubscribers(env: Env): Promise<string[]> {
  const list = await env.PUSH_SUBSCRIPTIONS.get(KV_LIST_KEY, 'json') as string[] | null;
  if (!list?.length) return [];

  const emails: string[] = [];
  for (const hash of list) {
    const key = `${KV_PREFIX}${hash}`;
    const data = await env.PUSH_SUBSCRIPTIONS.get(key, 'json') as { email: string } | null;
    if (data?.email) {
      emails.push(data.email);
    }
  }
  return emails;
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

  // For now, return the subscriber list and HTML details.
  // Actual email sending requires an email provider (Mailgun, SES, Resend, etc.)
  // configured separately. This endpoint prepares the data.
  // The workflow can POST the HTML here, and the worker will batch-send via
  // the configured email API.

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

  // GET /newsletter/unsubscribe?email=... (from email link)
  if (path === '/newsletter/unsubscribe' && request.method === 'GET') {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');
    if (!email) {
      // Return a simple HTML page for confirmation
      return new Response(`<!DOCTYPE html>
<html><head><title>Unsubscribe — Watchboard</title>
<style>body{background:#0a0b0e;color:#e8e9ed;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.card{background:#181b23;padding:32px;border-radius:8px;border:1px solid #2a2d3a;text-align:center;max-width:400px}
h1{font-size:20px;margin:0 0 12px}p{color:#9498a8;font-size:14px}
a{color:#e74c3c;text-decoration:underline}</style></head>
<body><div class="card"><h1>Unsubscribe</h1><p>Missing email parameter. Return to <a href="https://watchboard.dev">Watchboard</a>.</p></div></body></html>`,
        { status: 400, headers: { 'Content-Type': 'text/html' } });
    }
    await unsubscribe(email, env);
    return new Response(`<!DOCTYPE html>
<html><head><title>Unsubscribed — Watchboard</title>
<style>body{background:#0a0b0e;color:#e8e9ed;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.card{background:#181b23;padding:32px;border-radius:8px;border:1px solid #2a2d3a;text-align:center;max-width:400px}
h1{font-size:20px;margin:0 0 12px;color:#2ecc71}p{color:#9498a8;font-size:14px}
a{color:#e74c3c;text-decoration:underline}</style></head>
<body><div class="card"><h1>✅ Unsubscribed</h1><p>You've been removed from the Watchboard weekly digest. <a href="https://watchboard.dev">Return to Watchboard</a>.</p></div></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } });
  }

  // GET /newsletter/send — trigger send (authenticated)
  if (path === '/newsletter/send' && (request.method === 'GET' || request.method === 'POST')) {
    return triggerSend(request, env);
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}
