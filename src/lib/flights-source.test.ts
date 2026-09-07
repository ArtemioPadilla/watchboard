import { describe, it, expect } from 'vitest';
import { parseOpenSky, isMilitaryCallsign, quantizeBbox, padBbox, bboxAround, openSkyUrl, bboxKey,
  openSkyCredits, pollIntervalForBbox, FLIGHTS_POLL_MS,
} from './flights-source';

describe('parseOpenSky', () => {
  const row = (over: Partial<Record<number, unknown>> = {}) => {
    const base: unknown[] = ['abc123', 'RCH123 ', 'United States', 0, 0, 44.4, 33.3, 9000, false, 250, 90, 0, null, 9100];
    for (const [k, v] of Object.entries(over)) base[Number(k)] = v;
    return base;
  };
  it('keeps airborne, positioned flights and flags military callsigns', () => {
    const out = parseOpenSky({ states: [row()] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ icao24: 'abc123', callsign: 'RCH123', lat: 33.3, lon: 44.4, altitude: 9000, velocity: 250, heading: 90, isMilitary: true });
  });
  it('drops on-ground and unpositioned rows', () => {
    expect(parseOpenSky({ states: [row({ 8: true })] })).toHaveLength(0);
    expect(parseOpenSky({ states: [row({ 5: null })] })).toHaveLength(0);
    expect(parseOpenSky({ states: [row({ 6: 'x' })] })).toHaveLength(0);
  });
  it('tolerates malformed payloads', () => {
    expect(parseOpenSky(null)).toEqual([]);
    expect(parseOpenSky({ states: null })).toEqual([]);
    expect(parseOpenSky({ states: ['nope', 42] })).toEqual([]);
  });
  it('falls back to geo altitude and defaults numbers', () => {
    const out = parseOpenSky({ states: [row({ 7: null, 9: null, 10: null, 1: null })] });
    expect(out[0]).toMatchObject({ altitude: 9100, velocity: 0, heading: 0, callsign: '', isMilitary: false });
  });
});

describe('isMilitaryCallsign', () => {
  it('matches known prefixes case-insensitively', () => {
    expect(isMilitaryCallsign('rch4021')).toBe(true);
    expect(isMilitaryCallsign('IAF001')).toBe(true);
    expect(isMilitaryCallsign('UAE123')).toBe(false);
    expect(isMilitaryCallsign(null)).toBe(false);
  });
});

describe('bbox helpers', () => {
  it('quantises outward to whole degrees and enforces a minimum span', () => {
    expect(quantizeBbox({ latMin: 33.2, latMax: 33.9, lonMin: 44.1, lonMax: 44.2 })).toEqual({ latMin: 32, latMax: 35, lonMin: 43, lonMax: 46 });
    expect(quantizeBbox({ latMin: 12.5, latMax: 41.2, lonMin: 24.9, lonMax: 64.1 })).toEqual({ latMin: 12, latMax: 42, lonMin: 24, lonMax: 65 });
  });
  it('clamps to valid ranges', () => {
    const b = quantizeBbox({ latMin: -95, latMax: 95, lonMin: -190, lonMax: 190 });
    expect(b).toEqual({ latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 });
  });
  it('pads by a fraction and builds a bbox around a centre', () => {
    expect(padBbox({ latMin: 0, latMax: 10, lonMin: 0, lonMax: 10 }, 0.1)).toEqual({ latMin: -1, latMax: 11, lonMin: -1, lonMax: 11 });
    expect(bboxAround({ lat: 19.4, lon: -99.1 }, 10)).toEqual({ latMin: 9, latMax: 30, lonMin: -110, lonMax: -89 });
  });
  it('produces a stable key and a valid OpenSky URL', () => {
    const b = { latMin: 12, latMax: 42, lonMin: 24, lonMax: 65 };
    expect(bboxKey(b)).toBe('12,42,24,65');
    expect(openSkyUrl(b)).toBe('https://opensky-network.org/api/states/all?lamin=12&lamax=42&lomin=24&lomax=65');
  });
});

describe('quota-aware polling', () => {
  it('maps bbox area to OpenSky credit tiers', () => {
    expect(openSkyCredits({ latMin: 0, latMax: 5, lonMin: 0, lonMax: 5 })).toBe(1);
    expect(openSkyCredits({ latMin: 0, latMax: 10, lonMin: 0, lonMax: 10 })).toBe(2);
    expect(openSkyCredits({ latMin: 0, latMax: 20, lonMin: 0, lonMax: 20 })).toBe(3);
    expect(openSkyCredits({ latMin: 0, latMax: 30, lonMin: 0, lonMax: 30 })).toBe(4);
  });
  it('slows the poll for wide views so a day of viewing stays under 400 credits', () => {
    const wide = { latMin: 10, latMax: 40, lonMin: 30, lonMax: 60 };
    const interval = pollIntervalForBbox(wide);
    expect(interval).toBe(FLIGHTS_POLL_MS * 4);
    const creditsPerDay = (86_400_000 / interval) * openSkyCredits(wide);
    expect(creditsPerDay).toBeLessThanOrEqual(400 * 8); // 8 h of continuous viewing
    expect(pollIntervalForBbox(null)).toBe(FLIGHTS_POLL_MS);
  });
});
