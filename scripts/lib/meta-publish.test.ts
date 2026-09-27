import { describe, it, expect } from 'vitest';
import {
  buildIgCaption,
  buildIgContainerRequest,
  buildIgStatusRequest,
  buildIgPublishRequest,
  buildFbVideoRequest,
  fbVideoUrl,
  graphCall,
  publishInstagramReel,
  publishFacebookVideo,
  metaConfigFromEnv,
  redact,
  GraphError,
  IG_CAPTION_MAX,
  type FetchLike,
  type FetchResponseLike,
  type MetaConfig,
} from './meta-publish';

const cfg: MetaConfig = { accessToken: 'SECRET-TOKEN', igUserId: '1789', fbPageId: '4242' };
const noSleep = async () => {};

function json(status: number, body: unknown): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

/** A scripted fetch: each call takes the next response; records what was sent. */
function scripted(responses: FetchResponseLike[]) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected call ${init.method} ${url}`);
    return next;
  };
  return { fetchImpl, calls };
}

describe('request builders', () => {
  it('creates a REELS container with the public video url and caption', () => {
    const r = buildIgContainerRequest(cfg, { videoUrl: 'https://example.com/v.mp4', caption: 'hi' });
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://graph.facebook.com/v21.0/1789/media');
    const p = new URLSearchParams(r.body);
    expect(p.get('media_type')).toBe('REELS');
    expect(p.get('video_url')).toBe('https://example.com/v.mp4');
    expect(p.get('caption')).toBe('hi');
    expect(p.get('share_to_feed')).toBe('true');
    expect(p.get('access_token')).toBe('SECRET-TOKEN');
  });

  it('status and publish target the container; page video uses file_url', () => {
    expect(buildIgStatusRequest(cfg, 'c1').url).toContain('/v21.0/c1?fields=status_code%2Cstatus&access_token=SECRET-TOKEN');
    const pub = buildIgPublishRequest(cfg, 'c1');
    expect(pub.url).toBe('https://graph.facebook.com/v21.0/1789/media_publish');
    expect(new URLSearchParams(pub.body).get('creation_id')).toBe('c1');
    const fb = buildFbVideoRequest(cfg, { videoUrl: 'https://example.com/v.mp4', description: 'd' });
    expect(fb.url).toBe('https://graph.facebook.com/v21.0/4242/videos');
    expect(new URLSearchParams(fb.body).get('file_url')).toBe('https://example.com/v.mp4');
    expect(fbVideoUrl('4242', '77')).toBe('https://www.facebook.com/4242/videos/77');
  });

  it('refuses to build without the account id it needs', () => {
    expect(() => buildIgContainerRequest({ accessToken: 't' }, { videoUrl: 'u', caption: 'c' })).toThrow(/igUserId/);
    expect(() => buildFbVideoRequest({ accessToken: 't' }, { videoUrl: 'u', description: 'd' })).toThrow(/fbPageId/);
  });

  it('honours a custom API version and base', () => {
    const r = buildIgStatusRequest({ ...cfg, apiVersion: 'v22.0', apiBase: 'https://graph.example/' }, 'c1');
    expect(r.url.startsWith('https://graph.example/v22.0/c1?')).toBe(true);
  });
});

describe('buildIgCaption', () => {
  it('appends normalised, de-duplicated hashtags', () => {
    expect(buildIgCaption('Body', ['OSINT', '#OSINT', '#Watchboard'])).toBe('Body\n\n#OSINT #Watchboard');
  });
  it('trims the body to keep hashtags whole and stays inside the limit', () => {
    const c = buildIgCaption('x'.repeat(3000), ['#a', '#b']);
    expect(c.length).toBeLessThanOrEqual(IG_CAPTION_MAX);
    expect(c.endsWith('\n\n#a #b')).toBe(true);
    expect(c).toContain('…');
  });
  it('caps hashtags at 30', () => {
    const tags = Array.from({ length: 40 }, (_, i) => `#t${i}`);
    expect(buildIgCaption('b', tags).split('#').length - 1).toBe(30);
  });
});

describe('graphCall', () => {
  it('throws a GraphError with Meta’s message and code, token redacted', async () => {
    const { fetchImpl } = scripted([json(400, { error: { message: 'Invalid OAuth access token SECRET-TOKEN', code: 190, error_subcode: 463, fbtrace_id: 'abc' } })]);
    const p = graphCall(buildIgStatusRequest(cfg, 'c1'), cfg, fetchImpl);
    await expect(p).rejects.toBeInstanceOf(GraphError);
    await expect(p).rejects.toMatchObject({ status: 400, code: 190, subcode: 463, fbtraceId: 'abc' });
    await expect(p).rejects.toThrow(/\*\*\*/);
    await expect(p).rejects.not.toThrow(/SECRET-TOKEN/);
  });

  it('treats an error body with HTTP 200 as an error too', async () => {
    const { fetchImpl } = scripted([json(200, { error: { message: 'nope', code: 1 } })]);
    await expect(graphCall(buildIgStatusRequest(cfg, 'c1'), cfg, fetchImpl)).rejects.toThrow(/nope/);
  });

  it('reports non-JSON bodies without leaking the token', async () => {
    const { fetchImpl } = scripted([{ ok: false, status: 502, json: async () => { throw new Error('bad'); }, text: async () => '<html>SECRET-TOKEN</html>' }]);
    await expect(graphCall(buildIgStatusRequest(cfg, 'c1'), cfg, fetchImpl)).rejects.toThrow(/non-JSON.*\*\*\*/);
  });
});

describe('publishInstagramReel', () => {
  it('creates → polls until FINISHED → publishes → resolves the permalink', async () => {
    const { fetchImpl, calls } = scripted([
      json(200, { id: 'c1' }),
      json(200, { status_code: 'IN_PROGRESS' }),
      json(200, { status_code: 'FINISHED' }),
      json(200, { id: 'm9' }),
      json(200, { permalink: 'https://www.instagram.com/reel/ABC/' }),
    ]);
    const logs: string[] = [];
    const r = await publishInstagramReel(cfg, { videoUrl: 'https://example.com/v.mp4', caption: 'c' }, { fetch: fetchImpl, sleep: noSleep, log: (l) => logs.push(l) });
    expect(r).toEqual({ id: 'm9', url: 'https://www.instagram.com/reel/ABC/' });
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'GET', 'POST', 'GET']);
    expect(calls[3].url).toContain('/media_publish');
    expect(logs.some((l) => l.includes('processing'))).toBe(true);
  });

  it('fails fast when the container ends in ERROR and never publishes', async () => {
    const { fetchImpl, calls } = scripted([json(200, { id: 'c1' }), json(200, { status_code: 'ERROR', status: 'Media is too long' })]);
    await expect(publishInstagramReel(cfg, { videoUrl: 'u', caption: 'c' }, { fetch: fetchImpl, sleep: noSleep })).rejects.toThrow(/ERROR.*too long/);
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxAttempts polls', async () => {
    const { fetchImpl } = scripted([json(200, { id: 'c1' }), json(200, { status_code: 'IN_PROGRESS' }), json(200, { status_code: 'IN_PROGRESS' })]);
    await expect(publishInstagramReel(cfg, { videoUrl: 'u', caption: 'c' }, { fetch: fetchImpl, sleep: noSleep, maxAttempts: 2 })).rejects.toThrow(/not ready after 2/);
  });

  it('falls back to a constructed URL when the permalink lookup fails', async () => {
    const { fetchImpl } = scripted([json(200, { id: 'c1' }), json(200, { status_code: 'FINISHED' }), json(200, { id: 'm9' }), json(500, { error: { message: 'x' } })]);
    const r = await publishInstagramReel(cfg, { videoUrl: 'u', caption: 'c' }, { fetch: fetchImpl, sleep: noSleep });
    expect(r.url).toBe('https://www.instagram.com/reel/m9/');
  });
});

describe('publishFacebookVideo', () => {
  it('posts once and returns the page video url', async () => {
    const { fetchImpl, calls } = scripted([json(200, { id: '555' })]);
    const r = await publishFacebookVideo(cfg, { videoUrl: 'https://example.com/v.mp4', description: 'd' }, { fetch: fetchImpl });
    expect(r).toEqual({ id: '555', url: 'https://www.facebook.com/4242/videos/555' });
    expect(calls).toHaveLength(1);
  });
});

describe('metaConfigFromEnv / redact', () => {
  it('is null without a token and picks up the ids and video url', () => {
    expect(metaConfigFromEnv({})).toBeNull();
    expect(metaConfigFromEnv({ META_PAGE_ACCESS_TOKEN: 't', META_IG_USER_ID: '1', META_FB_PAGE_ID: '2', META_VIDEO_URL: 'https://x/v.mp4' })).toEqual({
      accessToken: 't', igUserId: '1', fbPageId: '2', apiVersion: undefined, videoUrl: 'https://x/v.mp4',
    });
  });
  it('redact removes every occurrence', () => {
    expect(redact('a SECRET b SECRET', 'SECRET')).toBe('a *** b ***');
    expect(redact('plain', '')).toBe('plain');
  });
});
