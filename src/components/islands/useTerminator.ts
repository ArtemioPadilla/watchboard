import { useMemo } from 'react';

// ────────────────────────────────────────────
//  Solar terminator computation
// ────────────────────────────────────────────

/**
 * Compute the solar terminator as a set of [lat, lon] points.
 * Returns the boundary between day and night for the given date.
 */
function computeTerminatorLine(date: Date): [number, number][] {
  // Day of year
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (date.getTime() - startOfYear.getTime()) / 86_400_000,
  );

  // Solar declination (approximate)
  const declination =
    -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10) * Math.PI) / 180);

  // Hour angle — longitude where the sun is directly overhead
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const sunLon = -(hours - 12) * 15;

  // For each longitude, compute the latitude of the terminator
  const points: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const lonRad = ((lon - sunLon) * Math.PI) / 180;
    const decRad = (declination * Math.PI) / 180;
    const tanDec = Math.tan(decRad);

    // Avoid division by zero
    if (Math.abs(tanDec) < 1e-10) {
      points.push([0, lon]);
      continue;
    }

    const lat =
      (Math.atan(-Math.cos(lonRad) / tanDec) * 180) / Math.PI;
    points.push([lat, lon]);
  }

  return points;
}

/**
 * Build a polygon that covers the "night" hemisphere.
 * The polygon traces the terminator line, then closes along the
 * pole that is currently in darkness.
 *
 * Returns [lat, lon] pairs ready for Leaflet.
 */
function buildNightPolygon(date: Date): [number, number][] {
  const terminatorLine = computeTerminatorLine(date);

  // Determine which pole is in darkness.
  // In the northern hemisphere winter (negative declination), the north pole is darker.
  // We check which side of the terminator the north pole falls on.
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const declination =
    -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10) * Math.PI) / 180);

  // The dark pole is opposite to the subsolar point
  const darkPoleLat = declination > 0 ? -90 : 90;

  // Build the polygon: terminator line + close via the dark pole
  const polygon: [number, number][] = [...terminatorLine];

  // Close the polygon by going along the dark pole edge
  // From the last terminator point to the dark pole, then back
  polygon.push([darkPoleLat, 180]);
  polygon.push([darkPoleLat, -180]);

  return polygon;
}

// ────────────────────────────────────────────
//  Hook
// ────────────────────────────────────────────

/**
 * Compute the day/night terminator polygon for rendering on the 2D map.
 *
 * Uses noon of the `currentDate` as the simulation time.
 * Returns `null` when disabled.
 */
export function useTerminator(
  enabled: boolean,
  currentDate: string,
): [number, number][] | null {
  return useMemo(() => {
    if (!enabled) return null;

    // Use noon UTC of the current date for simulation
    const simDate = new Date(currentDate + 'T12:00:00Z');
    return buildNightPolygon(simDate);
  }, [enabled, currentDate]);
}
