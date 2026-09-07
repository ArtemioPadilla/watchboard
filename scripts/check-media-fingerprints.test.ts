import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectJobs } from './check-media-fingerprints';

function tracker(): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-fp-'));
  const d = join(root, 't', 'data', 'events');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, '2026-09-01.json'), JSON.stringify([
    { id: 'dup', media: [{ type: 'image', url: 'https://a/x', thumbnail: 'https://cdn/same.jpg', etag: 'a' }, { type: 'video', url: 'https://v', thumbnail: 'https://cdn/same.jpg', etag: 'b' }] },
    { id: 'dup', media: [{ type: 'image', url: 'https://a/y', thumbnail: 'https://cdn/y.jpg', contentLength: 5 }] },
    { media: [{ type: 'image', url: 'https://cdn/z.jpg', etag: 'z' }, { type: 'image', url: 'https://cdn/no-record.jpg' }] },
    'not an event', null,
  ]));
  writeFileSync(join(root, 't', 'data', 'timeline.json'), JSON.stringify([{ era: 'x', events: [{ id: 'tl', media: [{ type: 'image', url: 'https://a', thumbnail: 'https://cdn/t.jpg', etag: 't' }] }] }, { era: 'no events' }]));
  return root;
}

describe('collectJobs', () => {
  it('addresses every recorded item by document + indices, tolerating shared URLs, duplicate and missing ids', () => {
    const { jobs, docs } = collectJobs('t', tracker());
    expect(docs).toHaveLength(2);
    expect(jobs.map(j => j.eventLabel)).toEqual(['dup[0]', 'dup[1]', 'dup[0]', '#2[0]', 'tl[0]']);
    // Two distinct item objects even though they share a URL.
    expect(jobs[0].item).not.toBe(jobs[1].item);
    expect(jobs[0].url).toBe(jobs[1].url);
    // Mutating a job's item mutates the parsed document that will be written.
    jobs[3].item.suspect = true;
    const evs = jobs[3].doc.root as { media: { suspect?: boolean }[] }[];
    expect(evs[2].media[0].suspect).toBe(true);
  });
  it('skips items without a saved record and unreadable files', () => {
    const { jobs } = collectJobs('t', tracker());
    expect(jobs.some(j => j.url === 'https://cdn/no-record.jpg')).toBe(false);
    expect(collectJobs('missing', '/nonexistent').jobs).toEqual([]);
  });
});
