/**
 * meta-publish.ts — Instagram Reels + Facebook Page video via the Meta Graph API.
 *
 * Both destinations were "manual" in post-video-social.ts (#234): the script
 * wrote a queue JSON for a human to upload. This module is the adapter body,
 * kept pure where it can be (request builders, response parsing) with fetch
 * and sleep injectable so the flow is unit-tested without touching Meta.
 *
 * Prerequisites the repo cannot create (see docs/self-hosting.md and #234):
 *   - an Instagram professional account linked to a Facebook Page;
 *   - a Meta app with `instagram_content_publish` (Reels) and
 *     `pages_manage_posts` (Page video), reviewed;
 *   - a long-lived Page access token → META_PAGE_ACCESS_TOKEN.
 *
 * The Graph API does not accept a file upload for Reels: `video_url` must be
 * a public URL Meta's servers can fetch. daily-video.yml publishes the MP4 as
 * a GitHub release asset first (scripts/ci/host-release-asset.ts) and passes
 * that URL in META_VIDEO_URL.
 *
 * Reels constraints (Meta docs): MP4/MOV, H.264, 9:16, 3–90 s, ≤ 1 GB.
 * The daily brief is 1080×1920, ~25 s, ~12–20 MB — inside every limit.
 */

export const DEFAULT_API_VERSION = 'v21.0';
export const DEFAULT_API_BASE = 'https://graph.facebook.com';
/** Instagram caption limit. Hashtags count toward it; ≤ 30 hashtags. */
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAG_MAX = 30;

export interface MetaConfig {
  accessToken: string;
  igUserId?: string;
  fbPageId?: string;
  apiVersion?: string;
  apiBase?: string;
}

export interface GraphRequest {
  method: 'GET' | 'POST';
  url: string;
  /** application/x-www-form-urlencoded body for POST. */
  body?: string;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => Promise<FetchResponseLike>;
export type SleepLike = (ms: number) => Promise<void>;

export interface PublishDeps {
  fetch: FetchLike;
  sleep: SleepLike;
  /** Container status polls before giving up (default 40 × 5 s ≈ 3.3 min). */
  maxAttempts?: number;
  intervalMs?: number;
  log?: (line: string) => void;
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

function base(cfg: MetaConfig): string {
  return `${(cfg.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, '')}/${cfg.apiVersion ?? DEFAULT_API_VERSION}`;
}

function form(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, v);
  return p.toString();
}

/** Never let the token reach a log line or an error message. */
export function redact(text: string, token: string): string {
  return token ? text.split(token).join('***') : text;
}

/** Trim a caption to Instagram's limit, keeping the hashtags whole. */
export function buildIgCaption(text: string, hashtags: readonly string[], max = IG_CAPTION_MAX): string {
  const tags = hashtags
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, IG_HASHTAG_MAX);
  const tail = tags.length ? `\n\n${tags.join(' ')}` : '';
  const budget = max - tail.length;
  const body = text.length > budget ? `${text.slice(0, Math.max(0, budget - 1)).trimEnd()}…` : text;
  return `${body}${tail}`;
}

// ── Request builders (pure) ──────────────────────────────────────────────────

export function buildIgContainerRequest(cfg: MetaConfig, input: { videoUrl: string; caption: string; shareToFeed?: boolean }): GraphRequest {
  if (!cfg.igUserId) throw new Error('igUserId is required for Instagram');
  return {
    method: 'POST',
    url: `${base(cfg)}/${cfg.igUserId}/media`,
    body: form({
      media_type: 'REELS',
      video_url: input.videoUrl,
      caption: input.caption,
      share_to_feed: String(input.shareToFeed ?? true),
      access_token: cfg.accessToken,
    }),
  };
}

export function buildIgStatusRequest(cfg: MetaConfig, containerId: string): GraphRequest {
  return { method: 'GET', url: `${base(cfg)}/${containerId}?${form({ fields: 'status_code,status', access_token: cfg.accessToken })}` };
}

export function buildIgPublishRequest(cfg: MetaConfig, containerId: string): GraphRequest {
  if (!cfg.igUserId) throw new Error('igUserId is required for Instagram');
  return { method: 'POST', url: `${base(cfg)}/${cfg.igUserId}/media_publish`, body: form({ creation_id: containerId, access_token: cfg.accessToken }) };
}

export function buildIgPermalinkRequest(cfg: MetaConfig, mediaId: string): GraphRequest {
  return { method: 'GET', url: `${base(cfg)}/${mediaId}?${form({ fields: 'permalink', access_token: cfg.accessToken })}` };
}

export function buildFbVideoRequest(cfg: MetaConfig, input: { videoUrl: string; description: string; title?: string }): GraphRequest {
  if (!cfg.fbPageId) throw new Error('fbPageId is required for Facebook');
  return {
    method: 'POST',
    url: `${base(cfg)}/${cfg.fbPageId}/videos`,
    body: form({ file_url: input.videoUrl, description: input.description, title: input.title, access_token: cfg.accessToken }),
  };
}

export function fbVideoUrl(pageId: string, videoId: string): string {
  return `https://www.facebook.com/${pageId}/videos/${videoId}`;
}

// ── Transport ────────────────────────────────────────────────────────────────

export async function graphCall<T = Record<string, unknown>>(req: GraphRequest, cfg: MetaConfig, fetchImpl: FetchLike): Promise<T> {
  const res = await fetchImpl(req.url, {
    method: req.method,
    headers: req.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: req.body,
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    throw new GraphError(`Graph API returned non-JSON (HTTP ${res.status}): ${redact(text.slice(0, 200), cfg.accessToken)}`, res.status);
  }
  const err = (parsed as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } })?.error;
  if (!res.ok || err) {
    throw new GraphError(
      `Graph API HTTP ${res.status}: ${redact(err?.message ?? 'unknown error', cfg.accessToken)}`,
      res.status,
      err?.code,
      err?.error_subcode,
      err?.fbtrace_id,
    );
  }
  return parsed as T;
}

// ── Flows ────────────────────────────────────────────────────────────────────

export type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

export interface PublishResult {
  id: string;
  url: string;
}

/**
 * Create the Reels container from a public video URL, wait until Meta has
 * transcoded it, publish, and resolve the permalink. Every failure is thrown;
 * nothing is retried here beyond the status poll (the caller decides).
 */
export async function publishInstagramReel(
  cfg: MetaConfig,
  input: { videoUrl: string; caption: string; shareToFeed?: boolean },
  deps: PublishDeps,
): Promise<PublishResult> {
  const log = deps.log ?? (() => {});
  const maxAttempts = deps.maxAttempts ?? 40;
  const intervalMs = deps.intervalMs ?? 5000;

  const created = await graphCall<{ id: string }>(buildIgContainerRequest(cfg, input), cfg, deps.fetch);
  if (!created?.id) throw new GraphError('container creation returned no id', 200);
  log(`[instagram] container ${created.id} created, waiting for processing`);

  let status: ContainerStatus | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const s = await graphCall<{ status_code?: ContainerStatus; status?: string }>(buildIgStatusRequest(cfg, created.id), cfg, deps.fetch);
    status = s.status_code;
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new GraphError(`container ${created.id} ended in ${status}: ${redact(s.status ?? '', cfg.accessToken)}`, 200);
    }
    log(`[instagram] processing… (${attempt}/${maxAttempts}, ${status ?? 'unknown'})`);
    await deps.sleep(intervalMs);
  }
  if (status !== 'FINISHED') throw new GraphError(`container ${created.id} not ready after ${maxAttempts} polls`, 200);

  const published = await graphCall<{ id: string }>(buildIgPublishRequest(cfg, created.id), cfg, deps.fetch);
  if (!published?.id) throw new GraphError('media_publish returned no id', 200);

  let url = `https://www.instagram.com/reel/${published.id}/`;
  try {
    const p = await graphCall<{ permalink?: string }>(buildIgPermalinkRequest(cfg, published.id), cfg, deps.fetch);
    if (p.permalink) url = p.permalink;
  } catch (e) {
    log(`[instagram] permalink lookup failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }
  return { id: published.id, url };
}

/** One call: Meta fetches `file_url` and processes asynchronously; the id is final. */
export async function publishFacebookVideo(
  cfg: MetaConfig,
  input: { videoUrl: string; description: string; title?: string },
  deps: Pick<PublishDeps, 'fetch' | 'log'>,
): Promise<PublishResult> {
  if (!cfg.fbPageId) throw new Error('fbPageId is required for Facebook');
  const created = await graphCall<{ id: string }>(buildFbVideoRequest(cfg, input), cfg, deps.fetch);
  if (!created?.id) throw new GraphError('page video upload returned no id', 200);
  deps.log?.(`[facebook] video ${created.id} accepted`);
  return { id: created.id, url: fbVideoUrl(cfg.fbPageId, created.id) };
}

/** Read the adapter configuration from the environment; `null` when Meta is not set up. */
export interface MetaEnv {
  META_PAGE_ACCESS_TOKEN?: string;
  META_IG_USER_ID?: string;
  META_FB_PAGE_ID?: string;
  META_GRAPH_API_VERSION?: string;
  META_VIDEO_URL?: string;
}

/** Literal reads so scripts/list-env-vars.ts documents every variable. */
export function readMetaEnv(): MetaEnv {
  return {
    META_PAGE_ACCESS_TOKEN: process.env.META_PAGE_ACCESS_TOKEN,
    META_IG_USER_ID: process.env.META_IG_USER_ID,
    META_FB_PAGE_ID: process.env.META_FB_PAGE_ID,
    META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
    META_VIDEO_URL: process.env.META_VIDEO_URL,
  };
}

export function metaConfigFromEnv(env: MetaEnv = readMetaEnv()): (MetaConfig & { videoUrl?: string }) | null {
  const accessToken = env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) return null;
  return {
    accessToken,
    igUserId: env.META_IG_USER_ID || undefined,
    fbPageId: env.META_FB_PAGE_ID || undefined,
    apiVersion: env.META_GRAPH_API_VERSION || undefined,
    videoUrl: env.META_VIDEO_URL || undefined,
  };
}
