import { describe, it, expect } from 'vitest';
import { usgsUrl, parseUsgs, weatherGridFromBounds, openMeteoUrl, parseOpenMeteo, windDirLabel, trackerBbox, nextDay } from './geo-sources';

describe('usgs', () => {
  it('builds a one-day boxed query', () => {
    const u = new URL(usgsUrl('2026-03-05', { latMin: 12, latMax: 42, lonMin: 24, lonMax: 65 }));
    expect(u.searchParams.get('starttime')).toBe('2026-03-05');
    expect(u.searchParams.get('endtime')).toBe('2026-03-06');
    expect(u.searchParams.get('minlatitude')).toBe('12');
    expect(u.searchParams.get('maxlongitude')).toBe('65');
  });
  it('omits the box when none is given', () => {
    expect(usgsUrl('2026-12-31')).not.toContain('minlatitude');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
  it('parses features and skips malformed ones', () => {
    const out = parseUsgs({ features: [
      { id: 'a', geometry: { coordinates: [44, 33, 10] }, properties: { mag: 4.5, place: 'X', time: 5 } },
      { id: 'b', geometry: { coordinates: ['x', 33] }, properties: { mag: 4 } },
      { id: 'c', geometry: { coordinates: [1, 2] }, properties: {} },
    ] });
    expect(out).toEqual([{ id: 'a', mag: 4.5, place: 'X', time: 5, lon: 44, lat: 33, depth: 10 }]);
    expect(parseUsgs(null)).toEqual([]);
  });
});

describe('weather', () => {
  const bounds = { latMin: 20, latMax: 40, lonMin: 40, lonMax: 60 };
  it('lays a 3x3 grid inside the bounds', () => {
    const g = weatherGridFromBounds(bounds);
    expect(g).toHaveLength(9);
    expect(g[4]).toEqual({ lat: 30, lon: 50, label: 'Center' });
    expect(g[0].label).toBe('NW');
    for (const p of g) {
      expect(p.lat).toBeGreaterThan(20); expect(p.lat).toBeLessThan(40);
      expect(p.lon).toBeGreaterThan(40); expect(p.lon).toBeLessThan(60);
    }
  });
  it('builds the archive URL and parses multi- and single-location payloads', () => {
    const pts = [{ lat: 1, lon: 2, label: 'a' }, { lat: 3, lon: 4, label: 'b' }];
    expect(openMeteoUrl(pts, '2026-01-01')).toContain('latitude=1,3&longitude=2,4&start_date=2026-01-01');
    const multi = parseOpenMeteo([{ hourly: { cloudcover: Array(13).fill(50), windspeed_10m: Array(13).fill(10), winddirection_10m: Array(13).fill(90) } }, { nope: true }], pts);
    expect(multi).toEqual([{ lat: 1, lon: 2, label: 'a', cloudCover: 50, windSpeed: 10, windDir: 90 }]);
    const single = parseOpenMeteo({ hourly: { cloudcover: [], windspeed_10m: [], winddirection_10m: [] } }, pts);
    expect(single).toEqual([{ lat: 1, lon: 2, label: 'a', cloudCover: 0, windSpeed: 0, windDir: 0 }]);
    expect(parseOpenMeteo(null, pts)).toEqual([]);
  });
  it('labels wind directions including wraparound', () => {
    expect(windDirLabel(0)).toBe('N');
    expect(windDirLabel(359)).toBe('N');
    expect(windDirLabel(225)).toBe('SW');
    expect(windDirLabel(-90)).toBe('W');
  });
});

describe('trackerBbox', () => {
  it('prefers bounds, then a 10° box around the centre, else null', () => {
    expect(trackerBbox({ lonMin: 1, lonMax: 2, latMin: 3, latMax: 4 })).toEqual({ latMin: 3, latMax: 4, lonMin: 1, lonMax: 2 });
    expect(trackerBbox(null, { lon: -99, lat: 19 })).toEqual({ latMin: 9, latMax: 29, lonMin: -109, lonMax: -89 });
    expect(trackerBbox()).toBeNull();
  });
});
