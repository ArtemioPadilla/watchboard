import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGdacsRss, buildGdacsFile, gdacsToCandidates, GDACS_MAX_ALERTS } from './gdacs';

const XML = readFileSync(resolve(__dirname, '../../tests/fixtures/gdacs-sample.xml'), 'utf8');

describe('parseGdacsRss', () => {
  const alerts = parseGdacsRss(XML);
  it('maps the fields of every well-formed item', () => {
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    const eq = alerts.find(a => a.eventType === 'EQ')!;
    expect(eq.id).toMatch(/^EQ\d+$/);
    expect(eq.url).toContain('gdacs.org/report.aspx');
    expect(Math.abs(eq.lat)).toBeLessThanOrEqual(90);
    expect(eq.severityUnit).toBe('M');
    expect(typeof eq.severityValue).toBe('number');
    expect(eq.published).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(['Green', 'Orange', 'Red']).toContain(eq.level);
  });
  it('returns [] for junk and skips items without coordinates or level', () => {
    expect(parseGdacsRss('not xml at all <')).toEqual([]);
    expect(parseGdacsRss('<rss><channel><item><title>x</title><link>https://a</link><guid>ID1</guid></item></channel></rss>')).toEqual([]);
    const one = parseGdacsRss('<rss><channel><item><title>t</title><link>https://a</link><guid>EQ1</guid><gdacs:alertlevel>Red</gdacs:alertlevel><georss:point>10 20</georss:point><pubDate>Sun, 06 Sep 2026 04:25:39 GMT</pubDate></item></channel></rss>');
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ id: 'EQ1', lat: 10, lon: 20, level: 'Red', eventType: 'OTHER' });
  });
});

describe('buildGdacsFile', () => {
  const base = parseGdacsRss(XML);
  it('drops Green, keeps the window, caps and sorts newest first', () => {
    const now = new Date(Math.max(...base.map(a => Date.parse(a.modified))) + 3_600_000);
    const f = buildGdacsFile(base, now);
    expect(f.alerts.every(a => a.level !== 'Green')).toBe(true);
    expect(f.license).toBe('CC BY 4.0');
    const many = Array.from({ length: GDACS_MAX_ALERTS + 10 }, (_, i) => ({ ...base[0], id: `X${i}`, level: 'Orange' as const, modified: new Date(now.getTime() - i * 60_000).toISOString(), published: new Date(now.getTime() - i * 60_000).toISOString() }));
    expect(buildGdacsFile(many, now).alerts).toHaveLength(GDACS_MAX_ALERTS);
    const old = { ...base[0], level: 'Red' as const, modified: new Date(now.getTime() - 10 * 86_400_000).toISOString(), published: new Date(now.getTime() - 10 * 86_400_000).toISOString() };
    expect(buildGdacsFile([old], now).alerts).toHaveLength(0);
  });
});

describe('gdacsToCandidates', () => {
  it('produces geo-tagged tier-1 candidates for non-Green alerts only', () => {
    const c = gdacsToCandidates(parseGdacsRss(XML));
    expect(c.every(x => x.feedOrigin === 'gdacs' && x.sourceTier === 1 && x.geo.method === 'georss')).toBe(true);
    expect(c.every(x => /^GDACS (Orange|Red) /.test(x.title))).toBe(true);
    expect(c.length).toBe(parseGdacsRss(XML).filter(a => a.level !== 'Green').length);
  });
});

describe('E5 review fixes', () => {
  it('escalations become new candidates: the level is part of the URL', () => {
    const alerts = parseGdacsRss(readFileSync(resolve(__dirname, '../../tests/fixtures/gdacs-sample.xml'), 'utf8'));
    const a = alerts.find(x => x.level !== 'Green')!;
    const orange = gdacsToCandidates([{ ...a, level: 'Orange' }])[0];
    const red = gdacsToCandidates([{ ...a, level: 'Red' }])[0];
    expect(orange.url).not.toBe(red.url);
    expect(red.url.startsWith(a.url)).toBe(true);
    expect(red.url.endsWith('#red')).toBe(true);
  });
  it('falls back to geo:Point when georss:point is absent', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item>
      <title>Fallback quake</title><link>https://www.gdacs.org/report.aspx?eventid=9</link><guid>EQ9</guid>
      <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
      <gdacs:eventid xmlns:gdacs="x">9</gdacs:eventid><gdacs:eventtype xmlns:gdacs="x">EQ</gdacs:eventtype><gdacs:alertlevel xmlns:gdacs="x">Orange</gdacs:alertlevel>
      <geo:Point xmlns:geo="x"><geo:lat>49.84</geo:lat><geo:long>24.03</geo:long></geo:Point>
    </item></channel></rss>`;
    const out = parseGdacsRss(xml);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'EQ9', lat: 49.84, lon: 24.03, level: 'Orange' });
    // No coordinates at all → the item is skipped, not placed at 0,0.
    expect(parseGdacsRss(xml.replace(/<geo:Point[\s\S]*?<\/geo:Point>/, ''))).toHaveLength(0);
  });
});
