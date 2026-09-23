import { describe, it, expect } from 'vitest';
import { RADIO_STATION_SVG, RADIO_TOWER_SVG, svgDataUri, radioIconSvgFor, filterByCountry } from './radio-icons';
import type { GeoLayer } from './geo-layer-schema';

describe('radioIconSvgFor', () => {
  it('returns the station glyph for radio-stations and radio-stations-global', () => {
    expect(radioIconSvgFor('radio-stations')).toBe(RADIO_STATION_SVG);
    expect(radioIconSvgFor('radio-stations-global')).toBe(RADIO_STATION_SVG);
  });

  it('returns the tower glyph for radio-towers', () => {
    expect(radioIconSvgFor('radio-towers')).toBe(RADIO_TOWER_SVG);
  });

  it('returns null for non-radio layers', () => {
    expect(radioIconSvgFor('nuclear-plants')).toBeNull();
    expect(radioIconSvgFor('submarine-cables')).toBeNull();
    expect(radioIconSvgFor('maritime-chokepoints')).toBeNull();
    expect(radioIconSvgFor('unknown-layer')).toBeNull();
  });
});

describe('svgDataUri', () => {
  it('round-trips: decodeURIComponent of the payload equals the original SVG', () => {
    const uri = svgDataUri(RADIO_STATION_SVG);
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const payload = uri.slice('data:image/svg+xml;charset=utf-8,'.length);
    expect(decodeURIComponent(payload)).toBe(RADIO_STATION_SVG);
  });

  it('round-trips the tower glyph too', () => {
    const uri = svgDataUri(RADIO_TOWER_SVG);
    const payload = uri.slice('data:image/svg+xml;charset=utf-8,'.length);
    expect(decodeURIComponent(payload)).toBe(RADIO_TOWER_SVG);
  });
});

describe('filterByCountry', () => {
  const feature = (id: string, countryCode: unknown): GeoLayer['features'][number] => ({
    type: 'Feature' as const,
    id,
    properties: countryCode === undefined ? {} : { countryCode },
    geometry: { type: 'Point' as const, coordinates: [0, 0] },
  });

  it('keeps features whose countryCode is in the allowed list', () => {
    const features = [feature('a', 'UA'), feature('b', 'UA')];
    expect(filterByCountry(features, ['UA']).map(f => f.id)).toEqual(['a', 'b']);
  });

  it('drops features whose countryCode is not in the allowed list', () => {
    const features = [feature('own', 'UA'), feature('foreign', 'RU')];
    expect(filterByCountry(features, ['UA']).map(f => f.id)).toEqual(['own']);
  });

  it('drops features with a missing or null countryCode, even when the allowed list is non-empty', () => {
    const features = [feature('has-code', 'UA'), feature('missing', undefined), feature('null-code', null)];
    expect(filterByCountry(features, ['UA']).map(f => f.id)).toEqual(['has-code']);
  });

  it('returns empty for an empty codes list, even if features have matching-looking codes', () => {
    const features = [feature('a', 'UA')];
    expect(filterByCountry(features, [])).toEqual([]);
  });

  it('returns empty for an undefined/null codes list (no radioCountryCodes declared ≠ show everything)', () => {
    const features = [feature('a', 'UA')];
    expect(filterByCountry(features, undefined)).toEqual([]);
    expect(filterByCountry(features, null)).toEqual([]);
  });

  it('matches against every code in a multi-code list', () => {
    const features = [feature('il', 'IL'), feature('ps', 'PS'), feature('eg', 'EG')];
    expect(filterByCountry(features, ['IL', 'PS']).map(f => f.id)).toEqual(['il', 'ps']);
  });
});
