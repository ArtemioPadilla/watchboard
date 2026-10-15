/**
 * youtube-publish.ts — YouTube Shorts upload for the daily brief video.
 *
 * Closes the last manual destination in #234. Bluesky and Telegram were
 * already automated; Instagram and Facebook landed with meta-publish.ts; the
 * YouTube adapter was a stub returning `null`.
 *
 * Shape mirrors meta-publish.ts on purpose: pure request builders plus one
 * orchestrator with fetch, sleep and file reads injected, so the whole upload
 * path is testable without credentials and without touching the network.
 *
 * Why OAuth and not an API key: `videos.insert` writes to a channel, so it
 * needs a user-authorised token. An API key is only good for reads — which is
 * why backfill-youtube.ts gets by with `YOUTUBE_API_KEY` and this cannot. The
 * refresh-token grant is the only flow that works unattended in CI.
 *
 * Env (all three required, else the adapter stays disabled):
 *   YOUTUBE_CLIENT_ID
 *   YOUTUBE_CLIENT_SECRET
 *   YOUTUBE_REFRESH_TOKEN
 *
 * Shorts eligibility is a property of the file, not the request: vertical and
 * 60s or under. The daily brief renders 1080x1920 at ~30s, so it qualifies —
 * `assertShortsEligible` guards that rather than trusting it.
 */

export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

/** YouTube rejects titles over 100 characters outright. */
export const TITLE_MAX = 100;
/** Description limit is 5000; captions here are far shorter. */
export const DESCRIPTION_MAX = 5000;
/** Shorts must be 60s or under. */
export const SHORTS_MAX_SECONDS = 60;

export interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** 'private' while verifying the pipeline; 'public' once trusted. */
  privacyStatus?: 'public' | 'unlisted' | 'private';
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers: { get(name: string): string | null };
}

export type FetchLike = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string | Uint8Array },
) => Promise<FetchResponseLike>;

export interface PublishDeps {
  fetch: FetchLike;
  readFile: (path: string) => Promise<Uint8Array>;
  log?: (line: string) => void;
}

export class YouTubeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'YouTubeError';
  }
}

/**
 * Reads config from the environment, or null when incomplete.
 *
 * Each key is read as a literal `process.env.X` so scripts/list-env-vars.ts
 * discovers it and docs/self-hosting.md stays accurate — the same trap that
 * silently hid CLAUDE_MODEL in #324.
 */
export function youtubeConfigFromEnv(): YouTubeConfig | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN?.trim();
  const privacy = process.env.YOUTUBE_PRIVACY_STATUS?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    privacyStatus:
      privacy === 'public' || privacy === 'unlisted' || privacy === 'private'
        ? privacy
        : 'private',
  };
}

/** Never let a token reach a log line or an error message. */
export function redact(text: string, ...secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length > 6) out = out.split(s).join('***');
  }
  return out;
}

/**
 * Title for the Short. `#Shorts` is appended because YouTube still uses it as
 * a hint, but only when it fits — a truncated hashtag is worse than none, and
 * silently exceeding TITLE_MAX makes the API reject the whole upload.
 */
export function buildShortTitle(headline: string, max = TITLE_MAX): string {
  const tag = ' #Shorts';
  const clean = headline.replace(/\s+/g, ' ').trim();
  if (clean.length + tag.length <= max) return clean + tag;
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

export function buildShortDescription(
  caption: string,
  hashtags: readonly string[],
  max = DESCRIPTION_MAX,
): string {
  const tags = hashtags.filter(Boolean).join(' ');
  const body = tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
  return body.length <= max ? body : body.slice(0, max - 1).trimEnd() + '…';
}

/** Refresh-token grant. Returns the form body, not a URL-encoded secret in a query string. */
export function buildTokenRequest(cfg: YouTubeConfig): {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
} {
  return {
    url: OAUTH_TOKEN_URL,
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  };
}

export interface ShortMetadata {
  title: string;
  description: string;
  tags?: string[];
}

/** The resumable-upload init request: metadata now, bytes second. */
export function buildInitRequest(
  cfg: YouTubeConfig,
  accessToken: string,
  meta: ShortMetadata,
  contentLength: number,
): { url: string; method: string; headers: Record<string, string>; body: string } {
  if (!meta.title.trim()) throw new Error('title is required');
  if (meta.title.length > TITLE_MAX) {
    throw new Error(`title is ${meta.title.length} chars, over YouTube's ${TITLE_MAX}`);
  }
  return {
    url: UPLOAD_URL,
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-upload-content-type': 'video/mp4',
      'x-upload-content-length': String(contentLength),
    },
    body: JSON.stringify({
      snippet: { title: meta.title, description: meta.description, tags: meta.tags ?? [] },
      status: { privacyStatus: cfg.privacyStatus ?? 'private', selfDeclaredMadeForKids: false },
    }),
  };
}

/**
 * The init response carries the one-shot upload target in `Location`.
 * Missing it is fatal: PUTting bytes anywhere else silently uploads nothing.
 */
export function parseUploadLocation(res: FetchResponseLike): string {
  const loc = res.headers.get('location') ?? res.headers.get('Location');
  if (!loc) {
    throw new YouTubeError('resumable init returned no Location header', res.status);
  }
  return loc;
}

export function shortUrl(videoId: string): string {
  return `https://www.youtube.com/shorts/${videoId}`;
}

/** Shorts eligibility, checked rather than assumed. */
export function assertShortsEligible(durationSeconds: number): void {
  if (durationSeconds > SHORTS_MAX_SECONDS) {
    throw new Error(
      `video is ${durationSeconds}s; Shorts requires ${SHORTS_MAX_SECONDS}s or less`,
    );
  }
}

async function parseJson<T>(res: FetchResponseLike, cfg: YouTubeConfig): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new YouTubeError(
      `non-JSON response (HTTP ${res.status}): ${redact(text.slice(0, 200), cfg.clientSecret, cfg.refreshToken)}`,
      res.status,
    );
  }
  if (!res.ok) {
    const err = (parsed as { error?: { message?: string } })?.error?.message ?? text.slice(0, 200);
    throw new YouTubeError(
      `HTTP ${res.status}: ${redact(err, cfg.clientSecret, cfg.refreshToken)}`,
      res.status,
    );
  }
  return parsed as T;
}

export async function getAccessToken(cfg: YouTubeConfig, deps: PublishDeps): Promise<string> {
  const req = buildTokenRequest(cfg);
  const res = await deps.fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  const json = await parseJson<{ access_token?: string }>(res, cfg);
  if (!json.access_token) throw new YouTubeError('token response had no access_token', res.status);
  return json.access_token;
}

/**
 * Uploads one Short and returns its URL.
 *
 * Deliberately not retried: a half-uploaded video republished on the next
 * attempt would post the day's brief twice, and the daily workflow already
 * treats a failed destination as non-fatal.
 */
export async function publishYouTubeShort(
  cfg: YouTubeConfig,
  input: { videoPath: string; meta: ShortMetadata; durationSeconds?: number },
  deps: PublishDeps,
): Promise<{ url: string; videoId: string }> {
  const log = deps.log ?? (() => {});
  if (typeof input.durationSeconds === 'number') assertShortsEligible(input.durationSeconds);

  const bytes = await deps.readFile(input.videoPath);
  if (!bytes.length) throw new Error(`${input.videoPath} is empty — nothing to upload`);

  const token = await getAccessToken(cfg, deps);
  log('[youtube] access token acquired');

  const init = buildInitRequest(cfg, token, input.meta, bytes.length);
  const initRes = await deps.fetch(init.url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
  });
  if (!initRes.ok) await parseJson(initRes, cfg);
  const location = parseUploadLocation(initRes);
  log(`[youtube] resumable session opened (${bytes.length} bytes)`);

  const putRes = await deps.fetch(location, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) },
    body: bytes,
  });
  const done = await parseJson<{ id?: string }>(putRes, cfg);
  if (!done.id) throw new YouTubeError('upload finished with no video id', putRes.status);

  log(`[youtube] published ${done.id} (${cfg.privacyStatus ?? 'private'})`);
  return { url: shortUrl(done.id), videoId: done.id };
}
