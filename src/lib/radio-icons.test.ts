import { describe, it, expect } from 'vitest';
import { RADIO_STATION_SVG, RADIO_TOWER_SVG, svgDataUri, radioIconSvgFor, withinBounds } from './radio-icons';

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

describe('withinBounds', () => {
  const b = { lonMin: 20, lonMax: 40, latMin: 10, latMax: 30 };

  it('is true for a point strictly inside the box', () => {
    expect(withinBounds(30, 20, b)).toBe(true);
  });

  it('is true for a point exactly on the box edge', () => {
    expect(withinBounds(20, 10, b)).toBe(true);
    expect(withinBounds(40, 30, b)).toBe(true);
  });

  it('is false for a point well outside the box and its default padding', () => {
    expect(withinBounds(0, 0, b)).toBe(false);
  });

  it('honors the default 2° padding: just outside the raw box but within pad is true', () => {
    expect(withinBounds(41, 20, b)).toBe(true); // 1° past lonMax, within default 2° pad
    expect(withinBounds(30, 9, b)).toBe(true); // 1° below latMin, within default 2° pad
  });

  it('is false just past the padded edge', () => {
    expect(withinBounds(42.5, 20, b)).toBe(false); // 2.5° past lonMax > 2° pad
    expect(withinBounds(20, 7.5, b)).toBe(false); // 2.5° below latMin > 2° pad
  });

  it('honors a custom padDeg of 0 (no padding)', () => {
    expect(withinBounds(40.5, 20, b, 0)).toBe(false);
    expect(withinBounds(40, 20, b, 0)).toBe(true);
  });
});
