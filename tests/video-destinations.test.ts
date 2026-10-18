import { describe, it, expect } from 'vitest';
import {
  DESTINATIONS,
  assess,
  exitCodeFor,
  formatReport,
} from '../scripts/lib/video-destinations.js';

const FULL = {
  META_PAGE_ACCESS_TOKEN: 'tok',
  META_IG_USER_ID: '123',
  META_FB_PAGE_ID: '456',
  YOUTUBE_CLIENT_ID: 'cid',
  YOUTUBE_CLIENT_SECRET: 'sec',
  YOUTUBE_REFRESH_TOKEN: 'ref',
};

describe('assess', () => {
  it('reports every destination absent on an empty environment', () => {
    expect(assess({}).map(s => s.readiness)).toEqual(['absent', 'absent', 'absent']);
  });

  it('reports every destination ready when all credentials are set', () => {
    expect(assess(FULL).map(s => s.readiness)).toEqual(['ready', 'ready', 'ready']);
  });

  it('treats a set-but-empty value as missing — the trap this exists for', () => {
    // A secret that is not configured arrives as an empty string, which reads
    // as configured and behaves as absent.
    const s = assess({ ...FULL, META_PAGE_ACCESS_TOKEN: '   ' });
    expect(s.find(x => x.spec.id === 'instagram')?.readiness).toBe('partial');
    expect(s.find(x => x.spec.id === 'instagram')?.missing).toEqual(['META_PAGE_ACCESS_TOKEN']);
  });

  it('calls a half-configured destination partial, not ready', () => {
    const s = assess({ META_PAGE_ACCESS_TOKEN: 'tok' });
    expect(s.find(x => x.spec.id === 'facebook')?.readiness).toBe('partial');
    expect(s.find(x => x.spec.id === 'youtube')?.readiness).toBe('absent');
  });

  it('shares the Meta token between both adapters', () => {
    const s = assess({ META_PAGE_ACCESS_TOKEN: 'tok', META_IG_USER_ID: '1' });
    expect(s.find(x => x.spec.id === 'instagram')?.readiness).toBe('ready');
    expect(s.find(x => x.spec.id === 'facebook')?.readiness).toBe('partial');
  });

  it('requires an OAuth refresh token for YouTube, not an API key', () => {
    const yt = DESTINATIONS.find(d => d.id === 'youtube')!;
    expect(yt.credentials.map(c => c.name)).toContain('YOUTUBE_REFRESH_TOKEN');
    expect(yt.credentials.map(c => c.name)).not.toContain('YOUTUBE_API_KEY');
  });
});

describe('formatReport', () => {
  it('names the missing credential, its kind and what stays off', () => {
    const r = formatReport(assess({}));
    expect(r).toContain('missing secret META_PAGE_ACCESS_TOKEN — both Meta adapters stay off');
    expect(r).toContain('missing variable META_IG_USER_ID');
    expect(r).toContain('Instagram Reels (#234): ABSENT');
    expect(r).toContain('YouTube Shorts (#325)');
  });

  it('says configured-but-unverified rather than claiming it works', () => {
    expect(formatReport(assess(FULL))).toContain('configured, not verified');
  });

  it('reports a verified destination as working, with the detail', () => {
    const r = formatReport(assess(FULL), { instagram: { ok: true, detail: 'target is watchboard_dev' } });
    expect(r).toContain('Instagram Reels (#234): WORKS');
    expect(r).toContain('target is watchboard_dev');
  });

  it('reports a configured destination that failed as broken', () => {
    const r = formatReport(assess(FULL), { youtube: { ok: false, detail: 'refresh token rejected' } });
    expect(r).toContain('YouTube Shorts (#325): BROKEN');
  });
});

describe('exitCodeFor', () => {
  it('is 0 when nothing is configured — not configured is not a failure here', () => {
    expect(exitCodeFor({})).toBe(0);
  });

  it('is 0 when everything checked worked', () => {
    expect(exitCodeFor({ instagram: { ok: true, detail: '' } })).toBe(0);
  });

  it('is 1 when something configured did not work', () => {
    expect(exitCodeFor({ instagram: { ok: true, detail: '' }, youtube: { ok: false, detail: '' } })).toBe(1);
  });
});
