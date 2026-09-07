/**
 * live-layers.ts — the single registry of every external map layer.
 *
 * Every layer the globe or the 2D map can draw from data that is not the
 * tracker's own JSON is declared here: what it is, where it comes from,
 * how fresh it can be, and under which license. Toggles, the per-source
 * status chip, the sources page and the CSP test all read this array, so
 * a layer that is not registered cannot be drawn.
 *
 * Two kinds:
 *  - `feed`: fetched at runtime. Must carry a URL, a TTL and whether the
 *    upstream allows CORS (or needs the Worker proxy).
 *  - `snapshot`: curated data checked into the repo. Must carry the date
 *    it was captured and the trackers it applies to. It is rendered with
 *    its date and never with a "live" indicator.
 *
 * See docs/adr/0002-live-layer-registry.md for the rationale.
 */
import { z } from 'zod';

const AttributionSchema = z.object({
  /** Human-readable source name, e.g. "OpenSky Network". */
  source: z.string().min(1),
  /** SPDX id, a short license name, or 'permission-pending' / 'unknown'. */
  license: z.string().min(1),
  url: z.string().url().optional(),
  /** Text the UI must show verbatim when the layer is visible. */
  notice: z.string().optional(),
});

const BaseSpec = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** i18n key or literal label. */
  label: z.string().min(1),
  renderer: z.enum(['cesium', 'leaflet', 'both', 'globe-home']),
  attribution: AttributionSchema,
  /** Trackers where the layer is offered. Empty means all. */
  scope: z.array(z.string()).default([]),
  /** The upstream needs a user-supplied key (e.g. AIS stream). */
  requiresKey: z.boolean().default(false),
});

// `.strict()` on each branch: a snapshot carrying `url`/`ttlMs`, or a feed
// carrying `snapshotDate`, is a category error and must fail, not be
// silently stripped by Zod's default object mode.
const FeedSpec = BaseSpec.extend({
  kind: z.literal('feed'),
  /** Fully-qualified URL, or a template with `{bbox}` / `{date}` tokens. */
  url: z.string().min(1),
  /** How long a fetched response is considered fresh. */
  ttlMs: z.number().int().positive(),
  /** `true` when the upstream sends `Access-Control-Allow-Origin`, `'proxy'`
   *  when the request must go through the Worker, `'same-origin'` when the
   *  file is produced by our own pipeline under `public/`. */
  cors: z.union([z.literal(true), z.literal('proxy'), z.literal('same-origin')]),
  /** WebSocket feeds are push, not polled. */
  transport: z.enum(['http', 'websocket']).default('http'),
}).strict();

const SnapshotSpec = BaseSpec.extend({
  kind: z.literal('snapshot'),
  /** ISO date the data was captured (on or after every item's own
   *  `startDate`); shown next to the toggle instead of a live dot. */
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Where the checked-in data lives, for maintainers. */
  dataPath: z.string().min(1),
}).strict();

export const LiveLayerSpecSchema = z.discriminatedUnion('kind', [FeedSpec, SnapshotSpec]);
export type LiveLayerSpec = z.infer<typeof LiveLayerSpecSchema>;
export type LiveLayerId = LiveLayerSpec['id'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Registered layers. Order is display order in toggles.
 *
 * Snapshot entries reflect what the hooks contain today: hand-written
 * arrays scoped to the Iran conflict. `snapshotDate` is the capture date
 * (2026-03-01, the latest `startDate` any of them carries), not the
 * earliest event. Registering them is the first step of E2.H5, which
 * moves the data into `src/data/snapshots/` and deletes the duplicates.
 */
export const LIVE_LAYERS: LiveLayerSpec[] = [
  {
    id: 'flights',
    label: 'layers.flights',
    kind: 'feed',
    renderer: 'both',
    url: 'https://opensky-network.org/api/states/all?lamin={latMin}&lamax={latMax}&lomin={lonMin}&lomax={lonMax}',
    ttlMs: 30_000,
    cors: true,
    attribution: {
      source: 'OpenSky Network',
      license: 'CC BY-SA 4.0 (non-commercial API terms)',
      url: 'https://opensky-network.org/',
    },
    scope: [],
    requiresKey: false,
    transport: 'http',
  },
  {
    id: 'earthquakes',
    label: 'layers.earthquakes',
    kind: 'feed',
    renderer: 'both',
    url: 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=2.5&starttime={date}',
    ttlMs: 5 * MINUTE,
    cors: true,
    attribution: {
      source: 'USGS Earthquake Hazards Program',
      license: 'Public domain (US Government)',
      url: 'https://earthquake.usgs.gov/',
    },
    scope: [],
    requiresKey: false,
    transport: 'http',
  },
  {
    id: 'satellites',
    label: 'layers.satellites',
    kind: 'feed',
    renderer: 'cesium',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle',
    ttlMs: 6 * HOUR,
    cors: true,
    attribution: {
      source: 'CelesTrak',
      license: 'Free for non-commercial use with attribution',
      url: 'https://celestrak.org/',
    },
    scope: [],
    requiresKey: false,
    transport: 'http',
  },
  {
    id: 'weather',
    label: 'layers.weather',
    kind: 'feed',
    renderer: 'both',
    url: 'https://archive-api.open-meteo.com/v1/archive?latitude={lats}&longitude={lons}&start_date={date}&end_date={date}&hourly=cloudcover,windspeed_10m,winddirection_10m&timezone=UTC',
    ttlMs: HOUR,
    cors: true,
    attribution: {
      source: 'Open-Meteo',
      license: 'CC BY 4.0',
      url: 'https://open-meteo.com/',
    },
    scope: [],
    requiresKey: false,
    transport: 'http',
  },
  {
    id: 'ships',
    label: 'layers.ships',
    kind: 'feed',
    renderer: 'cesium',
    url: 'wss://stream.aisstream.io/v0/stream',
    ttlMs: 5 * MINUTE,
    cors: true,
    transport: 'websocket',
    attribution: {
      source: 'AISStream',
      license: 'Per AISStream terms; user-supplied API key',
      url: 'https://aisstream.io/',
    },
    scope: [],
    requiresKey: true,
  },
  {
    id: 'nfz',
    label: 'layers.nfz',
    kind: 'snapshot',
    renderer: 'both',
    snapshotDate: '2026-03-01',
    dataPath: 'src/components/islands/CesiumGlobe/useNoFlyZones.ts',
    attribution: {
      source: 'NOTAM summaries, hand-curated',
      license: 'Watchboard curated data (MIT)',
    },
    scope: ['iran-conflict'],
    requiresKey: false,
  },
  {
    id: 'gps-jamming',
    label: 'layers.gpsJam',
    kind: 'snapshot',
    renderer: 'both',
    snapshotDate: '2026-03-01',
    dataPath: 'src/components/islands/CesiumGlobe/useGpsJamming.ts',
    attribution: {
      source: 'ADS-B anomaly reports, hand-curated',
      license: 'Watchboard curated data (MIT)',
    },
    scope: ['iran-conflict'],
    requiresKey: false,
  },
  {
    id: 'internet-blackouts',
    label: 'layers.internetBlackout',
    kind: 'snapshot',
    renderer: 'both',
    snapshotDate: '2026-03-01',
    dataPath: 'src/components/islands/CesiumGlobe/useInternetBlackout.ts',
    attribution: {
      source: 'NetBlocks / IODA reports, hand-curated',
      license: 'Watchboard curated data (MIT)',
    },
    scope: ['iran-conflict'],
    requiresKey: false,
  },
];

const byId = new Map(LIVE_LAYERS.map((l) => [l.id, l]));

export function getLiveLayer(id: string): LiveLayerSpec | undefined {
  return byId.get(id);
}

/** Layers offered to a tracker: global ones plus those scoped to it. */
export function layersForTracker(slug: string): LiveLayerSpec[] {
  return LIVE_LAYERS.filter((l) => l.scope.length === 0 || l.scope.includes(slug));
}

/** Network hosts a feed layer talks to; used by the CSP test. */
export function feedUrls(): { id: string; url: string }[] {
  return LIVE_LAYERS.flatMap((l) =>
    l.kind === 'feed' && l.cors !== 'same-origin' ? [{ id: l.id, url: l.url }] : [],
  );
}
