import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDeepState, classifyName, parseDeepStateResponse, DEEPSTATE_MAX_BYTES } from './deepstate';

const SAMPLE = JSON.parse(readFileSync(resolve(__dirname, '../../tests/fixtures/deepstate-sample.json'), 'utf8'));

describe('classifyName', () => {
  it('reads the English segment of the trilingual name', () => {
    expect(classifyName('Окуповано /// Occupied /// geoJSON.status.occupied\n')).toEqual({ status: 'occupied', label: 'Occupied' });
    expect(classifyName('Звільнено /// Liberated 25.03 /// x')).toMatchObject({ status: 'liberated' });
    expect(classifyName('Статус невідомий /// Unknown status /// geoJSON.status.unknown')).toMatchObject({ status: 'unknown', label: 'Unknown status' });
    expect(classifyName("Придністров'я/// Transnistria /// t")).toMatchObject({ status: 'other', label: 'Transnistria' });
    expect(classifyName('')).toEqual({ status: 'other', label: 'Territory' });
  });
});

describe('parseDeepState', () => {
  it('keeps polygons, drops points, classifies and counts', () => {
    const fl = parseDeepState(SAMPLE);
    expect(fl.polygons.length).toBe(SAMPLE.map.features.length);
    expect(fl.counts.occupied + fl.counts.liberated + fl.counts.unknown + fl.counts.other).toBe(fl.polygons.length);
    expect(fl.polygons[0].rings[0][0]).toHaveLength(2);
    expect(fl.polygons.every(p => /^#[0-9a-f]{6}$/i.test(p.fill))).toBe(true);
    const withPoint = { ...SAMPLE, map: { ...SAMPLE.map, features: [...SAMPLE.map.features, { type: 'Feature', properties: { name: 'Direction of attack' }, geometry: { type: 'Point', coordinates: [30, 48] } }] } };
    expect(parseDeepState(withPoint).polygons.length).toBe(SAMPLE.map.features.length);
  });
  it('rejects wrong shapes, out-of-range coordinates and oversized collections', () => {
    expect(() => parseDeepState({})).toThrow();
    expect(() => parseDeepState({ id: 1, datetime: 'x', map: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[200, 0], [0, 0], [1, 1], [200, 0]]] } }] } })).toThrow();
    const huge = { id: 1, datetime: 'x', map: { type: 'FeatureCollection', features: Array.from({ length: 1001 }, () => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } })) } };
    expect(() => parseDeepState(huge)).toThrow();
  });
  it('parseDeepStateResponse refuses oversized bodies', async () => {
    const big = { headers: new Headers({ 'content-length': String(DEEPSTATE_MAX_BYTES + 1) }), text: async () => '' } as unknown as Response;
    await expect(parseDeepStateResponse(big)).rejects.toThrow(/too large/);
    const ok = { headers: new Headers(), text: async () => JSON.stringify(SAMPLE) } as unknown as Response;
    expect((await parseDeepStateResponse(ok)).polygons.length).toBeGreaterThan(0);
  });
});
