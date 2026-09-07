import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  encodeViewState, decodeViewState, mergeIntoUrl, normalizeHeading, createViewStateWriter,
  VIEW_STATE_KEYS, type ViewState,
} from './view-state';

const FULL: ViewState = {
  lat: 33.31234567, lon: 44.36123456, alt: 250000.7, heading: 90.04, pitch: -45.06,
  layers: ['flights', 'quakes'], event: '2026-03-05-strike-on-natanz', date: '2026-03-05', tracker: 'iran-conflict',
};

describe('encode/decode round trip', () => {
  it('every key written is read back (rounded)', () => {
    const qs = encodeViewState(FULL).toString();
    const back = decodeViewState(qs);
    expect(back).toEqual({
      lat: 33.3123, lon: 44.3612, alt: 250001, heading: 90, pitch: -45.1,
      layers: ['flights', 'quakes'], event: FULL.event, date: FULL.date, tracker: FULL.tracker,
    });
    // Guard against a key being added to the schema but not to encode/decode.
    for (const key of VIEW_STATE_KEYS) {
      if (key === 'zoom') continue; // zoom and alt are alternatives, tested below
      expect(back, `key ${key} lost in round trip`).toHaveProperty(key);
    }
  });

  it('zoom round-trips for the 2D map', () => {
    const back = decodeViewState(encodeViewState({ lat: 1, lon: 2, zoom: 6.123 }).toString());
    expect(back).toEqual({ lat: 1, lon: 2, zoom: 6.12 });
  });

  it('an empty layers array survives as "all off"', () => {
    const qs = encodeViewState({ layers: [] }).toString();
    expect(qs).toBe('layers=');
    expect(decodeViewState(qs)).toEqual({ layers: [] });
  });

  it('is stable: encoding a decoded state yields the same string', () => {
    const once = encodeViewState(FULL).toString();
    const twice = encodeViewState(decodeViewState(once)).toString();
    expect(twice).toBe(once);
  });
});

describe('decodeViewState validation (BVA)', () => {
  it('ignores non-numeric and out-of-range values without throwing', () => {
    expect(decodeViewState('lat=abc&lon=10')).toEqual({});
    expect(decodeViewState('lat=90.0001&lon=10')).toEqual({});
    expect(decodeViewState('lat=-90&lon=180')).toEqual({ lat: -90, lon: 180 });
    expect(decodeViewState('lat=10&lon=180.5')).toEqual({});
    expect(decodeViewState('alt=0&lat=1&lon=1')).toEqual({ lat: 1, lon: 1 });
    expect(decodeViewState('alt=-5')).toEqual({});
    expect(decodeViewState('zoom=25')).toEqual({});
    expect(decodeViewState('pitch=91')).toEqual({});
    expect(decodeViewState('lat=NaN&lon=Infinity')).toEqual({});
  });

  it('drops lat without lon and lon without lat', () => {
    expect(decodeViewState('lat=10')).toEqual({});
    expect(decodeViewState('lon=10')).toEqual({});
  });

  it('normalises heading into [0, 360)', () => {
    expect(decodeViewState('heading=-90')).toEqual({ heading: 270 });
    expect(decodeViewState('heading=720')).toEqual({ heading: 0 });
    expect(normalizeHeading(360)).toBe(0);
  });

  it('keeps good fields when a sibling is bad', () => {
    expect(decodeViewState('lat=oops&lon=1&layers=flights&date=2026-01-02')).toEqual({
      layers: ['flights'], date: '2026-01-02',
    });
  });

  it('filters unknown layer ids against the allowlist and dedupes', () => {
    expect(decodeViewState('layers=flights,quakes,flights,bogus', ['flights', 'quakes'])).toEqual({
      layers: ['flights', 'quakes'],
    });
    expect(decodeViewState('layers=bogus', ['flights'])).toEqual({ layers: [] });
  });

  it('rejects malformed event/date/tracker', () => {
    expect(decodeViewState('event=<script>')).toEqual({});
    expect(decodeViewState('date=2026-1-2')).toEqual({});
    expect(decodeViewState('date=2026-02-31')).toEqual({});
    expect(decodeViewState('date=2026-13-01')).toEqual({});
    expect(decodeViewState('date=2024-02-29')).toEqual({ date: '2024-02-29' });
    expect(decodeViewState('tracker=Iran_Conflict')).toEqual({});
    expect(decodeViewState('tracker=iran-conflict')).toEqual({ tracker: 'iran-conflict' });
  });

  it('accepts URLSearchParams input', () => {
    expect(decodeViewState(new URLSearchParams('zoom=4'))).toEqual({ zoom: 4 });
  });
});

describe('mergeIntoUrl', () => {
  const loc = { pathname: '/iran-conflict/', search: '?utm_source=x&lat=1&lon=1&layers=old', hash: '#map' };

  it('replaces our keys, preserves foreign params and the hash', () => {
    const url = mergeIntoUrl({ lat: 5, lon: 6, layers: ['flights'] }, loc);
    expect(url).toBe('/iran-conflict/?utm_source=x&lat=5&lon=6&layers=flights#map');
  });

  it('removes our keys that are absent from the new state', () => {
    expect(mergeIntoUrl({}, loc)).toBe('/iran-conflict/?utm_source=x#map');
  });

  it('emits no "?" when nothing remains', () => {
    expect(mergeIntoUrl({}, { pathname: '/x/', search: '?lat=1&lon=2', hash: '' })).toBe('/x/');
  });
});

describe('createViewStateWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      location: { pathname: '/g/', search: '?a=1', hash: '#h', origin: 'https://w.dev', href: 'https://w.dev/g/?a=1#h' },
      history: { state: null, replaceState: vi.fn() },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('collapses rapid writes into one replaceState after the delay', () => {
    const w = createViewStateWriter(500);
    w.write({ lat: 1, lon: 1 });
    w.write({ lat: 2, lon: 2 });
    expect(window.history.replaceState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(window.history.replaceState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
    expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/g/?a=1&lat=2&lon=2#h');
  });

  it('flush writes immediately and returns an absolute URL', () => {
    const w = createViewStateWriter(500);
    w.write({ zoom: 3 });
    const url = w.flush();
    expect(url).toBe('https://w.dev/g/?a=1&zoom=3#h');
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
  });

  it('cancel drops the pending write', () => {
    const w = createViewStateWriter(100);
    w.write({ zoom: 3 });
    w.cancel();
    vi.advanceTimersByTime(500);
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it('never uses pushState', () => {
    const w = createViewStateWriter(10);
    w.write({ zoom: 3 });
    vi.advanceTimersByTime(20);
    expect((window.history as unknown as Record<string, unknown>).pushState).toBeUndefined();
  });
});
