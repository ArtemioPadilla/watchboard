import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  selectTopRadioStations, fetchGlobalRadioStations, readRadioLayerPref, writeRadioLayerPref,
  RADIO_GLOBAL_TOP_N, RADIO_GLOBAL_PATH,
} from './radio-global';

function feature(i: number, votes: number | undefined) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [i, -i / 2] },
    properties: { stationUuid: `s${i}`, name: `Station ${i}`, streamUrl: `https://s${i}.example/stream`, votes },
  };
}

function fc(n: number) {
  return { type: 'FeatureCollection', features: Array.from({ length: n }, (_, i) => feature(i, i)) };
}

function res(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

describe('selectTopRadioStations', () => {
  it('sorts by votes descending and moves coordinates onto the station', () => {
    const out = selectTopRadioStations({ features: [feature(1, 5), feature(2, 50), feature(3, undefined)] });
    expect(out.map(s => s.stationUuid)).toEqual(['s2', 's1', 's3']);
    expect(out[0]).toMatchObject({ lon: 2, lat: -1, name: 'Station 2' });
  });

  it(`caps at ${RADIO_GLOBAL_TOP_N}, keeping the most voted`, () => {
    const out = selectTopRadioStations(fc(500));
    expect(out).toHaveLength(RADIO_GLOBAL_TOP_N);
    expect(out[0].votes).toBe(499);
    expect(out[RADIO_GLOBAL_TOP_N - 1].votes).toBe(500 - RADIO_GLOBAL_TOP_N);
  });

  it('throws on an empty feature list instead of returning an empty layer', () => {
    expect(() => selectTopRadioStations({ features: [] })).toThrow(/no stations/);
  });

  it('throws when the payload is not a FeatureCollection', () => {
    expect(() => selectTopRadioStations(null)).toThrow(/no features/);
    expect(() => selectTopRadioStations({ error: 'x' })).toThrow(/no features/);
  });

  it('skips features without point coordinates', () => {
    const out = selectTopRadioStations({ features: [feature(1, 1), { properties: { stationUuid: 'x' }, geometry: null }] });
    expect(out).toHaveLength(1);
  });
});

describe('fetchGlobalRadioStations', () => {
  it('fetches from the base path and returns the top stations', async () => {
    const fetchImpl = vi.fn(async () => res(fc(3)));
    const out = await fetchGlobalRadioStations('/base/', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(`/base/${RADIO_GLOBAL_PATH}`);
    expect(out.map(s => s.stationUuid)).toEqual(['s2', 's1', 's0']);
  });

  it('rejects on a non-OK HTTP status', async () => {
    const fetchImpl = vi.fn(async () => res(null, { ok: false, status: 404 }));
    await expect(fetchGlobalRadioStations('/', fetchImpl as unknown as typeof fetch)).rejects.toThrow(/HTTP 404/);
  });

  it('rejects on a payload with no features', async () => {
    const fetchImpl = vi.fn(async () => res({ type: 'FeatureCollection', features: [] }));
    await expect(fetchGlobalRadioStations('/', fetchImpl as unknown as typeof fetch)).rejects.toThrow(/no stations/);
  });

  it('rejects on a network failure', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchGlobalRadioStations('/', fetchImpl as unknown as typeof fetch)).rejects.toThrow(/Failed to fetch/);
  });
});

describe('radio layer preference (localStorage, try/catch)', () => {
  let store: Record<string, string> = {};
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is off by default and round-trips', () => {
    expect(readRadioLayerPref()).toBe(false);
    writeRadioLayerPref(true);
    expect(readRadioLayerPref()).toBe(true);
    writeRadioLayerPref(false);
    expect(readRadioLayerPref()).toBe(false);
  });

  it('degrades to off without throwing when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    });
    expect(readRadioLayerPref()).toBe(false);
    expect(() => writeRadioLayerPref(true)).not.toThrow();
  });
});
