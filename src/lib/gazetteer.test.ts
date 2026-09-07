import { describe, it, expect } from 'vitest';
import { buildGazetteer, geoparse, normalizeName, placeNameFromLabel, type GazetteerTrackerInput } from './gazetteer';

const TRACKERS: GazetteerTrackerInput[] = [
  {
    slug: 'ukraine-war', country: 'UA', map: { center: { lat: 49, lon: 32 } },
    points: [
      { label: 'Kyiv', lat: 50.45, lon: 30.52 },
      { label: 'Kharkiv', lat: 49.99, lon: 36.23 },
      { label: 'Zaporizhzhia NPP', lat: 47.51, lon: 34.58 },
      { label: 'Zaporizhzhia', lat: 47.84, lon: 35.14 },
      { label: 'Kerch Bridge — Strike (Day 500)', lat: 45.3, lon: 36.5 },
      { label: 'Norte', lat: 1, lon: 1 },
      { label: 'Odesa (Port)', lat: 46.48, lon: 30.72 },
    ],
  },
  {
    slug: 'iran-conflict', country: 'IR', map: { center: { lat: 32, lon: 53 } },
    points: [
      { label: 'Tehran', lat: 35.69, lon: 51.39 },
      { label: 'Isfahan — Nuclear Site (Day 3)', lat: 32.65, lon: 51.67 },
      { label: 'Kuwait International Airport — IRGC Strike (Day 96)', lat: 29.22, lon: 47.97 },
      { label: 'Strait of Hormuz — CENTCOM Destroys IRGC Vessels (Day 90)', lat: 26.6, lon: 56.3 },
      { label: 'Kharkiv', lat: 0, lon: 0 }, // deliberately ambiguous with ukraine-war
    ],
  },
  { slug: 'cdmx', country: 'MX', city: 'Ciudad de México', state: 'CDMX', map: { center: { lat: 19.43, lon: -99.13 } }, points: [{ label: 'Zócalo', lat: 19.4326, lon: -99.1332 }] },
  { slug: 'gaza-war', country: 'PS', map: { center: { lat: 31.4, lon: 34.4 } }, points: [{ label: 'Rafah', lat: 31.29, lon: 34.25 }, { label: 'Gaza City', lat: 31.5, lon: 34.47 }] },
  // Foreign map points that collide with country names and ordinary words.
  { slug: 'us-outbreak', country: 'US', points: [{ label: 'Georgia', lat: 32.75, lon: -83.6 }, { label: 'China', lat: 40.5, lon: 105 }, { label: 'US Supreme Court', lat: 38.89, lon: -77.0 }, { label: 'Cargo Vessel Struck', lat: 0, lon: 0 }, { label: 'Este', lat: 1, lon: 1 }, { label: 'With', lat: 2, lon: 2 }] },
  { slug: 'georgia-crisis', country: 'GE', map: { center: { lat: 41.7, lon: 44.8 } }, city: 'Tbilisi', points: [] },
  { slug: 'mexico-history', country: 'MX', points: [{ label: 'Mexico', lat: 20.6, lon: -87.1 }] },
];

const GZ = buildGazetteer(TRACKERS, new Date('2026-09-07T00:00:00Z'));

describe('normalizeName / placeNameFromLabel', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalizeName('Ciudad de México')).toBe('ciudad de mexico');
    expect(normalizeName("Kibbutz Be'eri!")).toBe("kibbutz be'eri");
    expect(normalizeName('  États-Unis ')).toBe('etats-unis');
  });
  it('extracts a place from an event-style label', () => {
    expect(placeNameFromLabel('Kuwait International Airport — IRGC Strike (Day 96)')).toBe('Kuwait International Airport');
    expect(placeNameFromLabel('Odesa (Port)')).toBe('Odesa');
    expect(placeNameFromLabel('Norte')).toBeNull();
    expect(placeNameFromLabel('Kyi')).toBeNull();
    expect(placeNameFromLabel('2024 Election Rally Site Downtown Area Zone')).toBeNull();
  });
});

describe('buildGazetteer', () => {
  it('keeps ambiguous names once per tracker and adds countries with aliases', () => {
    const kharkiv = GZ.entries.filter((e) => e.normalized === 'kharkiv');
    expect(kharkiv).toHaveLength(2);
    expect(kharkiv.map((e) => e.trackers[0]).sort()).toEqual(['iran-conflict', 'ukraine-war']);
    const ua = GZ.entries.find((e) => e.kind === 'country' && e.name === 'Ukraine')!;
    expect(ua.trackers).toEqual(['ukraine-war']);
    expect(ua.aliases).toContain('Ucrania');
    expect(GZ.entries.find((e) => e.normalized === 'norte')).toBeUndefined();
    expect(GZ.entries.find((e) => e.kind === 'center' && e.normalized === 'ciudad de mexico')).toBeTruthy();
    // Longest first so multi-word names are tried before their parts.
    expect(GZ.entries[0].normalized.length).toBeGreaterThanOrEqual(GZ.entries[GZ.entries.length - 1].normalized.length);
  });
});

describe('geoparse', () => {
  const cases: [string, string | null, string | undefined, number?][] = [
    ['Explosión en Kharkiv esta madrugada', 'ukraine-war', 'Kharkiv', 0.9],
    ['Explosion in Kharkiv overnight', 'ukraine-war', 'Kharkiv', 0.9],
    ['Explosion à Kharkiv cette nuit', 'ukraine-war', 'Kharkiv', 0.9],
    ['Explosão em Kharkiv durante a madrugada', 'ukraine-war', 'Kharkiv', 0.9],
    ['Drones hit Kyiv suburbs', 'ukraine-war', 'Kyiv'],
    ['Ataque a la central de Zaporizhzhia NPP', 'ukraine-war', 'Zaporizhzhia NPP'],
    ['Shelling reported near Zaporizhzhia', 'ukraine-war', 'Zaporizhzhia'],
    ['Kerch bridge closed again', 'ukraine-war', 'Kerch Bridge'],
    ['Irán amenaza con cerrar el estrecho de Ormuz', 'iran-conflict', 'Iran', 0.6],
    ['Strait of Hormuz shipping halted', 'iran-conflict', 'Strait of Hormuz'],
    ['Missile intercepted over Kuwait International Airport', 'iran-conflict', 'Kuwait International Airport'],
    ['Protests in Tehran continue', 'iran-conflict', 'Tehran'],
    ['Manifestations à Téhéran', 'iran-conflict', undefined], // "Téhéran" is not an alias of Tehran here
    ['Sismo sacude la Ciudad de México', 'cdmx', 'Ciudad de México', 0.85],
    ['Marcha en el Zócalo', 'cdmx', 'Zócalo'],
    ['Israel strikes Rafah crossing', 'gaza-war', 'Rafah'],
    ['Estados Unidos anuncia sanciones', null, 'United States', 0.6],
    ['Les États-Unis annoncent des sanctions', null, 'United States', 0.6],
    ['Os Estados Unidos anunciam sanções', null, 'United States', 0.6],
    ['Markets rally on rate decision', 'ukraine-war', undefined],
    ['Nothing here', null, undefined],
  ];
  for (const [text, tracker, place, conf] of cases) {
    it(`${JSON.stringify(text)} → ${place ?? 'none'}`, () => {
      const r = geoparse(text, tracker, GZ);
      if (place === undefined) { expect(r).toBeUndefined(); return; }
      expect(r?.place).toBe(place);
      expect(r?.method).toBe('gazetteer');
      if (conf !== undefined) expect(r!.confidence).toBeGreaterThanOrEqual(conf);
    });
  }

  it('an owned country outranks a foreign map point of the same name', () => {
    const ge = geoparse('Georgia protests continue', 'georgia-crisis', GZ)!;
    expect(ge).toMatchObject({ kind: 'country', place: 'Georgia' });
    expect(ge.lat).toBeCloseTo(42.3, 0);
    expect(ge.confidence).toBeGreaterThanOrEqual(0.8);
    const cn = geoparse("China's tech sector booms", 'cdmx', GZ)!; // no owner: the foreign point still loses to the country
    expect(cn.kind).toBe('country');
    // With no matched tracker, the plain country name resolves to the country centroid.
    const mx = geoparse('Mexico announces new tariffs', null, GZ)!;
    expect(mx.kind).toBe('country');
    expect(mx.lat).toBeCloseTo(23.6, 0);
  });
  it('never geolocates ordinary words or event-title labels', () => {
    expect(GZ.entries.find(e => e.normalized === 'este')).toBeUndefined();
    expect(GZ.entries.find(e => e.normalized === 'with')).toBeUndefined();
    expect(GZ.entries.find(e => e.normalized === 'us supreme court')).toBeUndefined();
    expect(GZ.entries.find(e => e.normalized === 'cargo vessel struck')).toBeUndefined();
    expect(geoparse('Este es un texto con palabras comunes', 'us-outbreak', GZ)).toBeUndefined();
    expect(geoparse('They left with nothing after the talks', 'us-outbreak', GZ)).toBeUndefined();
  });
  it('prefers the matched tracker for an ambiguous name', () => {
    expect(geoparse('Blast in Kharkiv', 'ukraine-war', GZ)?.lat).toBeCloseTo(49.99);
    expect(geoparse('Blast in Kharkiv', 'iran-conflict', GZ)?.lat).toBe(0);
    // No tracker: still a real coordinate, lower confidence, deterministic.
    const r = geoparse('Blast in Kharkiv', null, GZ)!;
    expect(r.confidence).toBeLessThan(0.9);
  });
  it('a point in the matched tracker beats the country of the same headline', () => {
    const r = geoparse('Ukraine: drones hit Kyiv', 'ukraine-war', GZ)!;
    expect(r.place).toBe('Kyiv');
    expect(r.kind).toBe('point');
  });
  it('never returns a default centre', () => {
    expect(geoparse('', 'ukraine-war', GZ)).toBeUndefined();
    expect(geoparse('war', 'ukraine-war', GZ)).toBeUndefined();
  });
  it('does not match inside longer words', () => {
    expect(geoparse('Kyivan Rus history lecture', 'ukraine-war', GZ)).toBeUndefined();
  });
});
