import { describe, it, expect } from 'vitest';
import { RadioOverrideSchema, applyRadioOverrides, loadRadioOverrides } from './radio-overrides';
import type { GeoLayer } from './geo-layer-schema';

const feature = (id: string, name = 'X'): GeoLayer['features'][number] => ({
  type: 'Feature', id, properties: { stationUuid: id, name }, geometry: { type: 'Point', coordinates: [0, 0] },
});

describe('RadioOverrideSchema', () => {
  it('accepts add/remove/correct actions and rejects an unknown one', () => {
    expect(RadioOverrideSchema.safeParse({ stationUuid: 'a', action: 'remove', note: 'dead stream', source: 'issue #1' }).success).toBe(true);
    expect(RadioOverrideSchema.safeParse({ stationUuid: 'a', action: 'bogus', note: 'x', source: 'x' }).success).toBe(false);
  });
});

describe('applyRadioOverrides', () => {
  it('removes a station', () => {
    const out = applyRadioOverrides([feature('a'), feature('b')], [{ stationUuid: 'a', action: 'remove', note: 'dead', source: 'issue #1' }]);
    expect(out.map(f => f.id)).toEqual(['b']);
  });
  it('corrects fields via a shallow patch', () => {
    const out = applyRadioOverrides([feature('a')], [{ stationUuid: 'a', action: 'correct', patch: { name: 'Renamed' }, note: 'wrong name', source: 'issue #2' }]);
    expect(out[0].properties.name).toBe('Renamed');
  });
  it('corrects a station location by moving geometry.coordinates, not just stamping properties.lat/lon', () => {
    const out = applyRadioOverrides([feature('a')], [{ stationUuid: 'a', action: 'correct', patch: { lat: 51.5, lon: -0.13 }, note: 'wrong location', source: 'issue #4' }]);
    expect(out[0].geometry).toEqual({ type: 'Point', coordinates: [-0.13, 51.5] });
    expect(out[0].properties).not.toHaveProperty('lat');
    expect(out[0].properties).not.toHaveProperty('lon');
  });
  it('adds a station not present in the upstream fetch', () => {
    const added = { stationUuid: 'z', action: 'add' as const, note: 'curated', source: 'issue #3', patch: { name: 'Manual', stationUuid: 'z', streamUrl: 'https://s.example/z', codec: 'MP3', votes: 0, country: null, countryCode: null, language: null, freqLabel: null, lat: 50.1, lon: 30.5 } };
    const out = applyRadioOverrides([feature('a')], [added]);
    expect(out.map(f => f.id)).toEqual(['a', 'z']);
    expect(out[1].geometry.type).toBe('Point');
    expect(out[1].geometry.coordinates).toEqual([30.5, 50.1]);
  });
});

describe('loadRadioOverrides', () => {
  it('the checked-in overrides file parses', () => { expect(() => loadRadioOverrides()).not.toThrow(); });
});
