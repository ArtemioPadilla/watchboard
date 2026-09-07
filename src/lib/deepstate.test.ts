import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDeepState, classifyName, parseDeepStateResponse, byteLength, DEEPSTATE_MAX_BYTES } from './deepstate';

const SAMPLE = JSON.parse(readFileSync(resolve(__dirname, '../../tests/fixtures/deepstate-sample.json'), 'utf8'));

describe('classifyName', () => {
  it('reads the English segment of the trilingual name', () => {
    expect(classifyName('Окуповано /// Occupied /// geoJSON.status.occupied\n')).toEqual({ status: 'occupied', label: 'Occupied' });
    expect(classifyName('Звільнено /// Liberated 25.03 /// x')).toMatchObject({ status: 'liberated' });
    expect(classifyName('Статус невідомий /// Unknown status /// geoJSON.status.unknown')).toMatchObject({ status: 'unknown', label: 'Unknown status' });
    expect(classifyName("Придністров'я/// Transnistria /// geoJSON.territories.transnistria")).toMatchObject({ status: 'other', label: 'Transnistria' });
    expect(classifyName('')).toEqual({ status: 'other', label: 'Territory' });
  });
  it('trusts the taxonomy key over the English label', () => {
    // A worldwide "territories" claim whose label starts with "Occupied" is not frontline.
    expect(classifyName('Окупований Цхінвальський район\n///\nOccupied Tskhinvali district /// geoJSON.territories.tskhinvali-district')).toEqual({ status: 'other', label: 'Occupied Tskhinvali district' });
    expect(classifyName('x /// Occupied Southern Kuril islands /// geoJSON.territories.kuril')).toMatchObject({ status: 'other' });
    // And a status polygon whose label was translated oddly still counts.
    expect(classifyName('x /// Temporarily lost /// geoJSON.status.occupied')).toMatchObject({ status: 'occupied' });
    // Payloads without the key fall back to the label prefix.
    expect(classifyName('x /// Liberated village')).toMatchObject({ status: 'liberated' });
  });
});

describe('parseDeepState', () => {
  it('keeps polygons, drops points, classifies and counts', () => {
    const fl = parseDeepState(SAMPLE);
    expect(fl.polygons.length).toBe(SAMPLE.map.features.length);
    // Counts follow the taxonomy key, not the total: recompute independently.
    const expected = { occupied: 0, liberated: 0, unknown: 0, other: 0 } as Record<string, number>;
    for (const f of SAMPLE.map.features) expected[classifyName(f.properties.name).status] += 1;
    expect(fl.counts).toEqual(expected);
    expect(expected.other).toBeGreaterThan(0); // the fixture carries territories.* claims
    expect(fl.polygons[0].rings[0][0]).toHaveLength(2);
    expect(fl.polygons.every(p => /^#[0-9a-f]{6}$/i.test(p.fill))).toBe(true);
    // fill and stroke come from their own properties, not from each other.
    const styled = { id: 1, datetime: 'x', map: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'a /// Occupied /// geoJSON.status.occupied', fill: '#112233', stroke: '#445566', 'fill-opacity': 0.5 }, geometry: { type: 'Polygon', coordinates: [[[30, 48], [31, 48], [31, 49], [30, 48]]] } }] } };
    expect(parseDeepState(styled).polygons[0]).toMatchObject({ fill: '#112233', stroke: '#445566', fillOpacity: 0.5 });
    const withPoint = { ...SAMPLE, map: { ...SAMPLE.map, features: [...SAMPLE.map.features, { type: 'Feature', properties: { name: 'Direction of attack' }, geometry: { type: 'Point', coordinates: [30, 48] } }] } };
    expect(parseDeepState(withPoint).polygons.length).toBe(SAMPLE.map.features.length);
  });
  it('splits MultiPolygons into one polygon per part and drops lines and collections', () => {
    const mp = { id: 7, datetime: 'x', map: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: 'a /// Occupied /// geoJSON.status.occupied' }, geometry: { type: 'MultiPolygon', coordinates: [[[[30, 48], [31, 48], [31, 49], [30, 48]]], [[[32, 48], [33, 48], [33, 49], [32, 48]], [[32.2, 48.2], [32.4, 48.2], [32.4, 48.4], [32.2, 48.2]]]] } },
      { type: 'Feature', properties: { name: 'b /// Direction /// geoJSON.arrows' }, geometry: { type: 'LineString', coordinates: [[30, 48], [31, 49]] } },
      { type: 'Feature', properties: { name: 'c /// Group /// geoJSON.x' }, geometry: { type: 'GeometryCollection', coordinates: [] } },
    ] } };
    const fl = parseDeepState(mp);
    expect(fl.polygons.map(p => p.id)).toEqual(['ds-7-0-p0', 'ds-7-0-p1']);
    expect(fl.polygons[0].rings).toHaveLength(1);
    expect(fl.polygons[1].rings).toHaveLength(2); // exterior + its own hole, not the other part's
    expect(fl.counts).toEqual({ occupied: 1, liberated: 0, unknown: 0, other: 0 });
  });
  it('measures the cap in UTF-8 bytes', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('Окуповано')).toBe(18);
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
