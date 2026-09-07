import { describe, it, expect } from 'vitest';
import { firstThumbnail, usableMedia } from './media-utils';
import { MediaItemSchema } from './schemas';

describe('usableMedia', () => {
  it('drops suspect items and keeps order', () => {
    const items = [
      { type: 'image' as const, url: 'a', thumbnail: 'ta', suspect: true },
      { type: 'image' as const, url: 'b', thumbnail: 'tb' },
      { type: 'video' as const, url: 'c', thumbnail: 'tc', suspect: false },
    ];
    expect(usableMedia(items).map((m) => m.url)).toEqual(['b', 'c']);
    expect(firstThumbnail(items)?.url).toBe('b');
  });
  it('handles missing arrays', () => {
    expect(usableMedia(undefined)).toEqual([]);
    expect(firstThumbnail(null)).toBeUndefined();
  });
  it('returns nothing when every thumbnail is suspect', () => {
    expect(firstThumbnail([{ type: 'image', url: 'a', thumbnail: 't', suspect: true }])).toBeUndefined();
  });
});

describe('MediaItemSchema fingerprint fields', () => {
  it('accepts hash, fetchedAt, etag, contentLength, suspect', () => {
    const m = MediaItemSchema.parse({
      type: 'image', url: 'https://x/a', thumbnail: 'https://x/t.jpg',
      hash: 'abc', fetchedAt: '2026-09-07T00:00:00Z', etag: '"e"', contentLength: 1234, suspect: true, suspectReason: 'etag',
    });
    expect(m.suspect).toBe(true);
    expect(m.contentLength).toBe(1234);
  });
  it('rejects a negative content length', () => {
    expect(MediaItemSchema.safeParse({ type: 'image', url: 'u', contentLength: -1 }).success).toBe(false);
  });
});
