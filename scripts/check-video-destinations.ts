#!/usr/bin/env tsx
/**
 * check-video-destinations.ts — answer "will the video actually publish there?"
 * with read-only calls, before a night is spent finding out.
 *
 * Instagram Reels, the Facebook Page and YouTube Shorts are written, tested
 * and dormant: each no-ops until its credentials exist. A missing secret is an
 * empty string here, so the nightly goes green having published nothing. This
 * reports what is configured and, for anything that is, whether the
 * credentials work.
 *
 * Read-only by design, mirroring x-api-check.ts's `verify` mode: a token
 * introspection for Meta, a refresh-token exchange plus one channel read for
 * YouTube. Nothing is published.
 *
 * Usage: npx tsx scripts/check-video-destinations.ts
 * Exit 1 only when something that IS configured turned out not to work.
 */
import {
  assess,
  exitCodeFor,
  formatReport,
  type CheckOutcome,
} from './lib/video-destinations.js';

const META_API = 'https://graph.facebook.com/v21.0';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

async function json(url: string, init?: RequestInit): Promise<{ ok: boolean; body: any; status: number }> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body, status: res.status };
  } catch (err) {
    return { ok: false, body: { error: { message: err instanceof Error ? err.message : String(err) } }, status: 0 };
  }
}

function metaError(body: any): string {
  return body?.error?.message ?? `HTTP ${body?.status ?? '?'}`;
}

/** Does the page token work, and does it reach the id the variable names? */
async function checkMeta(kind: 'instagram' | 'facebook', token: string, id: string): Promise<CheckOutcome> {
  const me = await json(`${META_API}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  if (!me.ok) return { ok: false, detail: `token rejected: ${metaError(me.body)}` };

  const fields = kind === 'instagram' ? 'username' : 'name';
  const target = await json(`${META_API}/${encodeURIComponent(id)}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
  if (!target.ok) {
    return {
      ok: false,
      detail: `token works (as ${me.body.name ?? me.body.id}) but ${id} is not reachable with it: ${metaError(target.body)}`,
    };
  }
  const name = target.body.username ?? target.body.name ?? id;
  return { ok: true, detail: `token works as ${me.body.name ?? me.body.id}; target is ${name}` };
}

/** Exchange the refresh token and read the channel it belongs to. */
async function checkYouTube(clientId: string, clientSecret: string, refreshToken: string): Promise<CheckOutcome> {
  const tok = await json(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!tok.ok || !tok.body.access_token) {
    return { ok: false, detail: `refresh token rejected: ${tok.body?.error_description ?? tok.body?.error ?? `HTTP ${tok.status}`}` };
  }
  const ch = await json(`${YOUTUBE_API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${tok.body.access_token}` },
  });
  if (!ch.ok) return { ok: false, detail: `token exchanged but the channel read failed: ${ch.body?.error?.message ?? `HTTP ${ch.status}`}` };
  const title = ch.body?.items?.[0]?.snippet?.title;
  if (!title) return { ok: false, detail: 'token exchanged but no channel is attached to it — uploads would have nowhere to go' };
  return { ok: true, detail: `uploads would go to "${title}"` };
}

async function main(): Promise<void> {
  const statuses = assess(process.env);
  const outcomes: Record<string, CheckOutcome> = {};

  for (const s of statuses) {
    if (s.readiness !== 'ready') continue;
    if (s.spec.id === 'instagram') {
      outcomes.instagram = await checkMeta('instagram', process.env.META_PAGE_ACCESS_TOKEN!, process.env.META_IG_USER_ID!);
    } else if (s.spec.id === 'facebook') {
      outcomes.facebook = await checkMeta('facebook', process.env.META_PAGE_ACCESS_TOKEN!, process.env.META_FB_PAGE_ID!);
    } else {
      outcomes.youtube = await checkYouTube(
        process.env.YOUTUBE_CLIENT_ID!,
        process.env.YOUTUBE_CLIENT_SECRET!,
        process.env.YOUTUBE_REFRESH_TOKEN!,
      );
    }
  }

  const report = formatReport(statuses, outcomes);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Video destinations\n\n\`\`\`\n${report}\n\`\`\`\n`);
  }

  const code = exitCodeFor(outcomes);
  if (code !== 0) console.error('::error::a configured destination did not work — see the report above');
  process.exit(code);
}

main().catch((err) => {
  console.error(`::error::check-video-destinations: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
