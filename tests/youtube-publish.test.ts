import { describe, it, expect } from 'vitest';
import {
  buildShortTitle,
  buildShortDescription,
  buildTokenRequest,
  buildInitRequest,
  parseUploadLocation,
  shortUrl,
  assertShortsEligible,
  publishYouTubeShort,
  redact,
  TITLE_MAX,
  SHORTS_MAX_SECONDS,
  type YouTubeConfig,
  type FetchResponseLike,
} from '../scripts/lib/youtube-publish';

const cfg: YouTubeConfig = {
  clientId: 'cid',
  clientSecret: 'super-secret-value',
  refreshToken: 'refresh-token-value',
  privacyStatus: 'private',
};

const res = (over: Partial<FetchResponseLike> & { body?: string; location?: string } = {}): FetchResponseLike => ({
  ok: over.ok ?? true,
  status: over.status ?? 200,
  text: async () => over.body ?? '{}',
  headers: { get: (n) => (n.toLowerCase() === 'location' ? (over.location ?? null) : null) },
});

describe('buildShortTitle', () => {
  it('appends #Shorts when it fits', () => {
    expect(buildShortTitle('Lebanon war day 220')).toBe('Lebanon war day 220 #Shorts');
  });

  it('omits the tag rather than emitting a truncated one', () => {
    // A cut-off "#Shor" is worse than no tag at all.
    const long = 'x'.repeat(TITLE_MAX - 3);
    const out = buildShortTitle(long);
    expect(out).toBe(long);
    expect(out).not.toContain('#Shor');
  });

  it('never exceeds the API limit, which would reject the whole upload', () => {
    const out = buildShortTitle('y'.repeat(300));
    expect(out.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it('collapses whitespace from headlines', () => {
    expect(buildShortTitle('a\n  b')).toBe('a b #Shorts');
  });
});

describe('buildShortDescription', () => {
  it('puts hashtags after a blank line', () => {
    expect(buildShortDescription('Daily brief', ['#Watchboard', '#Lebanon'])).toBe(
      'Daily brief\n\n#Watchboard #Lebanon',
    );
  });

  it('omits the block entirely with no hashtags', () => {
    expect(buildShortDescription('Daily brief', [])).toBe('Daily brief');
  });

  it('truncates past the limit', () => {
    expect(buildShortDescription('z'.repeat(6000), []).length).toBeLessThanOrEqual(5000);
  });
});

describe('buildTokenRequest', () => {
  it('sends the refresh grant as a form body, not a query string', () => {
    const r = buildTokenRequest(cfg);
    // A secret in a URL ends up in logs and proxies.
    expect(r.url).not.toContain('super-secret-value');
    expect(r.body).toContain('grant_type=refresh_token');
    expect(r.body).toContain('client_secret=super-secret-value');
  });
});

describe('buildInitRequest', () => {
  it('declares the byte length up front for the resumable session', () => {
    const r = buildInitRequest(cfg, 'tok', { title: 't', description: 'd' }, 4242);
    expect(r.headers['x-upload-content-length']).toBe('4242');
    expect(r.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(r.body).status.privacyStatus).toBe('private');
  });

  it('defaults privacy to private when unset', () => {
    const { privacyStatus: _omit, ...bare } = cfg;
    const r = buildInitRequest(bare as YouTubeConfig, 'tok', { title: 't', description: 'd' }, 1);
    expect(JSON.parse(r.body).status.privacyStatus).toBe('private');
  });

  it('refuses an over-length title locally instead of letting the API reject it', () => {
    expect(() =>
      buildInitRequest(cfg, 'tok', { title: 'x'.repeat(TITLE_MAX + 1), description: '' }, 1),
    ).toThrow(/over YouTube/);
  });

  it('refuses an empty title', () => {
    expect(() => buildInitRequest(cfg, 'tok', { title: '  ', description: '' }, 1)).toThrow(
      /title is required/,
    );
  });
});

describe('parseUploadLocation', () => {
  it('reads the session URL', () => {
    expect(parseUploadLocation(res({ location: 'https://upload/session/1' }))).toBe(
      'https://upload/session/1',
    );
  });

  it('throws when absent, because PUTting elsewhere uploads nothing', () => {
    expect(() => parseUploadLocation(res())).toThrow(/no Location header/);
  });
});

describe('assertShortsEligible', () => {
  it('accepts the daily brief length', () => {
    expect(() => assertShortsEligible(30)).not.toThrow();
    expect(() => assertShortsEligible(SHORTS_MAX_SECONDS)).not.toThrow();
  });

  it('rejects anything over a minute', () => {
    expect(() => assertShortsEligible(61)).toThrow(/Shorts requires/);
  });
});

describe('redact', () => {
  it('scrubs secrets from text', () => {
    expect(redact('token=super-secret-value failed', 'super-secret-value')).toBe(
      'token=*** failed',
    );
  });

  it('leaves short strings alone rather than mangling output', () => {
    expect(redact('abc def', 'abc')).toBe('abc def');
  });
});

describe('publishYouTubeShort', () => {
  const deps = (calls: Array<{ url: string; method: string }>, over: Partial<Record<'put' | 'init' | 'token', FetchResponseLike>> = {}) => ({
    log: () => {},
    readFile: async () => new Uint8Array([1, 2, 3]),
    fetch: async (url: string, init: { method: string }) => {
      calls.push({ url, method: init.method });
      if (url.includes('oauth2')) return over.token ?? res({ body: '{"access_token":"at"}' });
      if (init.method === 'POST') return over.init ?? res({ location: 'https://upload/s/1' });
      return over.put ?? res({ body: '{"id":"vid123"}' });
    },
  });

  it('walks token → init → bytes and returns the Shorts URL', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const out = await publishYouTubeShort(
      cfg,
      { videoPath: '/tmp/v.mp4', meta: { title: 't', description: 'd' }, durationSeconds: 30 },
      deps(calls),
    );
    expect(out).toEqual({ url: shortUrl('vid123'), videoId: 'vid123' });
    expect(calls.map((c) => c.method)).toEqual(['POST', 'POST', 'PUT']);
    expect(calls[2].url).toBe('https://upload/s/1');
  });

  it('refuses an empty file instead of opening a session for nothing', async () => {
    await expect(
      publishYouTubeShort(
        cfg,
        { videoPath: '/tmp/v.mp4', meta: { title: 't', description: 'd' } },
        { ...deps([]), readFile: async () => new Uint8Array() },
      ),
    ).rejects.toThrow(/is empty/);
  });

  it('fails before uploading when the video is too long', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    await expect(
      publishYouTubeShort(
        cfg,
        { videoPath: '/tmp/v.mp4', meta: { title: 't', description: 'd' }, durationSeconds: 90 },
        deps(calls),
      ),
    ).rejects.toThrow(/Shorts requires/);
    expect(calls).toHaveLength(0);
  });

  it('never leaks the client secret in an error', async () => {
    const err = res({ ok: false, status: 401, body: '{"error":{"message":"bad super-secret-value"}}' });
    await expect(
      publishYouTubeShort(
        cfg,
        { videoPath: '/tmp/v.mp4', meta: { title: 't', description: 'd' } },
        deps([], { token: err }),
      ),
    ).rejects.toThrow(/\*\*\*/);
  });

  it('throws when the upload completes with no video id', async () => {
    await expect(
      publishYouTubeShort(
        cfg,
        { videoPath: '/tmp/v.mp4', meta: { title: 't', description: 'd' } },
        deps([], { put: res({ body: '{}' }) }),
      ),
    ).rejects.toThrow(/no video id/);
  });
});
