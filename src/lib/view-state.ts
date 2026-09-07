/**
 * view-state.ts — the one place that knows how a shareable view is written
 * to and read from the URL.
 *
 * Globe, 2D map and homepage each own their view (camera, zoom, layer
 * toggles, open event, scrubber date, selected tracker). None of that state
 * is shared between islands, so no global store is involved: each island
 * calls `decodeViewState` on mount and a debounced writer after changes.
 * See docs/adr/0001-url-view-state-is-island-local.md.
 *
 * Rules:
 *  - Every key that is written is also read. The competitor this was
 *    modelled on generated lat/lon/zoom/layers and read back only layers,
 *    so every shared link silently lost its location. The round-trip test
 *    in view-state.test.ts exists to make that regression impossible.
 *  - Invalid or unknown values are dropped, never thrown. A broken URL must
 *    never break the page.
 *  - Writers use history.replaceState, never pushState: a camera move is
 *    not a navigation and must not pollute the back button.
 *  - Parameters that are not ours are preserved; the section hash
 *    (#map, #timeline) is preserved.
 */
import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-02-31` matches the regex and would still throw downstream. */
function isCalendarDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export const ViewStateSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    /** Cesium camera height in metres. */
    alt: z.number().positive().max(100_000_000),
    /** Leaflet zoom level. */
    zoom: z.number().min(0).max(24),
    /** Degrees, normalised to [0, 360). */
    heading: z.number().min(0).max(360),
    /** Degrees, -90 (straight down) to 90. */
    pitch: z.number().min(-90).max(90),
    /** Active layer ids; an empty array means "all layers off". */
    layers: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/)),
    /** Event slug from event-slug.ts ({YYYY-MM-DD}-{kebab-id}). */
    event: z.string().regex(SLUG).max(200),
    /** Scrubber date. */
    date: z.string().regex(ISO_DATE).refine(isCalendarDate, 'not a calendar date'),
    /** Selected tracker slug (homepage). */
    tracker: z.string().regex(SLUG).max(100),
  })
  .partial();

export type ViewState = z.infer<typeof ViewStateSchema>;

export const VIEW_STATE_KEYS = [
  'lat', 'lon', 'alt', 'zoom', 'heading', 'pitch', 'layers', 'event', 'date', 'tracker',
] as const satisfies readonly (keyof ViewState)[];

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/** Normalises a heading in degrees into [0, 360). */
export function normalizeHeading(deg: number): number {
  const h = deg % 360;
  return h < 0 ? h + 360 : h;
}

/**
 * Serialises a view state. Numbers are rounded so two cameras that differ
 * by less than the rounding produce identical URLs (stable share links,
 * no jitter while the camera settles): lat/lon 4 decimals (~11 m), alt to
 * the metre, zoom 2 decimals, heading/pitch 1 decimal.
 */
export function encodeViewState(state: ViewState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.lat !== undefined) params.set('lat', String(round(state.lat, 4)));
  if (state.lon !== undefined) params.set('lon', String(round(state.lon, 4)));
  if (state.alt !== undefined) params.set('alt', String(Math.round(state.alt)));
  if (state.zoom !== undefined) params.set('zoom', String(round(state.zoom, 2)));
  if (state.heading !== undefined) params.set('heading', String(round(normalizeHeading(state.heading), 1)));
  if (state.pitch !== undefined) params.set('pitch', String(round(state.pitch, 1)));
  if (state.layers !== undefined) params.set('layers', state.layers.join(','));
  if (state.event !== undefined) params.set('event', state.event);
  if (state.date !== undefined) params.set('date', state.date);
  if (state.tracker !== undefined) params.set('tracker', state.tracker);
  return params;
}

function num(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parses a query string into a view state. Each field is validated on its
 * own: a bad `lat` does not discard a good `layers`. When `allowedLayers`
 * is given, unknown layer ids are dropped (a layer that does not exist on
 * this page cannot be toggled on). `layers=` (present but empty) decodes
 * to `[]`, which callers must honour as "everything off".
 */
export function decodeViewState(
  search: string | URLSearchParams,
  allowedLayers?: readonly string[],
): ViewState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const candidate: Record<string, unknown> = {};

  const lat = num(params.get('lat'));
  const lon = num(params.get('lon'));
  const alt = num(params.get('alt'));
  const zoom = num(params.get('zoom'));
  const heading = num(params.get('heading'));
  const pitch = num(params.get('pitch'));
  if (lat !== undefined) candidate.lat = lat;
  if (lon !== undefined) candidate.lon = lon;
  if (alt !== undefined) candidate.alt = alt;
  if (zoom !== undefined) candidate.zoom = zoom;
  if (heading !== undefined) candidate.heading = normalizeHeading(heading);
  if (pitch !== undefined) candidate.pitch = pitch;

  const layersRaw = params.get('layers');
  if (layersRaw !== null) {
    let ids = layersRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowedLayers) ids = ids.filter((id) => allowedLayers.includes(id));
    candidate.layers = [...new Set(ids)];
  }

  for (const key of ['event', 'date', 'tracker'] as const) {
    const v = params.get(key);
    if (v !== null && v !== '') candidate[key] = v;
  }

  // Validate field by field so one bad value does not sink the rest.
  const out: ViewState = {};
  for (const key of VIEW_STATE_KEYS) {
    if (!(key in candidate)) continue;
    const parsed = ViewStateSchema.safeParse({ [key]: candidate[key] });
    if (parsed.success && parsed.data[key] !== undefined) {
      (out as Record<string, unknown>)[key] = parsed.data[key];
    }
  }
  // lat and lon only make sense together.
  if ((out.lat === undefined) !== (out.lon === undefined)) {
    delete out.lat;
    delete out.lon;
  }
  return out;
}

export interface LocationLike {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Builds the URL for `state` on top of the current location: our keys are
 * replaced wholesale (a key absent from `state` is removed), every other
 * query parameter and the hash survive untouched.
 */
export function mergeIntoUrl(state: ViewState, current: LocationLike): string {
  const params = new URLSearchParams(current.search);
  for (const key of VIEW_STATE_KEYS) params.delete(key);
  for (const [k, v] of encodeViewState(state)) params.set(k, v);
  const qs = params.toString();
  return `${current.pathname}${qs ? `?${qs}` : ''}${current.hash}`;
}

/** Reads the current view state from `window.location`; `{}` during SSR. */
export function readViewState(allowedLayers?: readonly string[]): ViewState {
  if (typeof window === 'undefined') return {};
  return decodeViewState(window.location.search, allowedLayers);
}

export interface ViewStateWriter {
  /** Schedules a write; consecutive calls within `delayMs` collapse into one. */
  write(state: ViewState): void;
  /** Writes immediately and returns the resulting URL (used by "Share"). */
  flush(state?: ViewState): string;
  cancel(): void;
}

/**
 * Debounced `history.replaceState` writer. `replaceState` only: a camera
 * move is not a navigation. Safe to construct during SSR; every method is
 * a no-op without `window`.
 */
export function createViewStateWriter(delayMs = 500): ViewStateWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ViewState | null = null;

  const apply = (state: ViewState): string => {
    if (typeof window === 'undefined') return '';
    const url = mergeIntoUrl(state, window.location);
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      try {
        window.history.replaceState(window.history.state, '', url);
      } catch {
        /* some embedded contexts forbid history access */
      }
    }
    return window.location.origin + url;
  };

  return {
    write(state) {
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (pending) apply(pending);
        pending = null;
      }, delayMs);
    },
    flush(state) {
      if (timer) clearTimeout(timer);
      timer = null;
      const s = state ?? pending;
      pending = null;
      if (s) return apply(s);
      return typeof window === 'undefined' ? '' : window.location.href;
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
