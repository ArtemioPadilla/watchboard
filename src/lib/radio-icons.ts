/**
 * radio-icons.ts — custom SVG icons for the radio-towers / radio-stations /
 * radio-stations-global static layers (plan 2026-09-22-radio-coverage-and-icons,
 * Task 3). Option A (badge): dark disc with a colored ring, station glyph =
 * broadcast waves in #ff66cc, tower glyph = lattice mast in #66ffcc.
 * Shared by Leaflet (L.divIcon html), Cesium (billboard data URI) and the
 * homepage globe pin (innerHTML).
 */

export const RADIO_STATION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#0d1117" fill-opacity=".9" stroke="#ff66cc" stroke-width="1.6"/><g fill="none" stroke="#ff66cc" stroke-width="1.8" stroke-linecap="round"><path d="M12.2 12.2a5.4 5.4 0 0 0 0 7.6"/><path d="M19.8 12.2a5.4 5.4 0 0 1 0 7.6"/><path d="M9.2 9.2a9.6 9.6 0 0 0 0 13.6" stroke-opacity=".75"/><path d="M22.8 9.2a9.6 9.6 0 0 1 0 13.6" stroke-opacity=".75"/></g><circle cx="16" cy="16" r="2.4" fill="#ff66cc"/></svg>`;

export const RADIO_TOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#0d1117" fill-opacity=".9" stroke="#66ffcc" stroke-width="1.6"/><g fill="none" stroke="#66ffcc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 11.5 11.3 25M16 11.5 20.7 25"/><path d="M13.2 19.5h5.6M12.3 22.3h7.4M13.2 19.5l6.5 2.8M18.8 19.5l-6.5 2.8"/><path d="M12.9 16.8h6.2"/><path d="M12.6 7.6a4.8 4.8 0 0 0 0 5.6" stroke-opacity=".8"/><path d="M19.4 7.6a4.8 4.8 0 0 1 0 5.6" stroke-opacity=".8"/></g><circle cx="16" cy="10.4" r="1.7" fill="#66ffcc"/></svg>`;

/** URL-encoded data URI for an inline SVG string (works as an <img>/billboard source, no base64 needed). */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Maps a static-layer id to its icon SVG; null for every non-radio layer (nuclear plants, cables, chokepoints, …). */
export function radioIconSvgFor(layerId: string): string | null {
  if (layerId === 'radio-stations' || layerId === 'radio-stations-global') return RADIO_STATION_SVG;
  if (layerId === 'radio-towers') return RADIO_TOWER_SVG;
  return null;
}

export interface LonLatBounds {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/** True when (lon, lat) falls inside `b`, padded by `padDeg` on every side (default 2°). */
export function withinBounds(lon: number, lat: number, b: LonLatBounds, padDeg = 2): boolean {
  return (
    lon >= b.lonMin - padDeg &&
    lon <= b.lonMax + padDeg &&
    lat >= b.latMin - padDeg &&
    lat <= b.latMax + padDeg
  );
}
