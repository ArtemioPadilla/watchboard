import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDossier, type Dossier, type DossierTracker, type GeoIndexPoint } from '../../../lib/dossier';
import { useLiveSource } from '../../../lib/use-live-source';

interface GeoIndex {
  generated: string;
  trackers: DossierTracker[];
  points: GeoIndexPoint[];
}

export interface DossierTarget {
  lat: number;
  lon: number;
  /** When the click came from a country polygon, skip geocoding. */
  countryCode?: string | null;
}

export interface DossierState {
  target: DossierTarget | null;
  dossier: Dossier | null;
  loading: boolean;
  error: string | null;
}

function basePath(): string {
  const raw = (import.meta as any).env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * Owns the dossier lifecycle for one surface: `open(lat, lon)` fetches the
 * geo index (once, cached) and composes the dossier; `close()` clears it.
 * A newer click supersedes an older in-flight one (sequence check), so a
 * slow Nominatim reply never overwrites a later selection.
 */
export function useDossier(overrideTrackers?: DossierTracker[]) {
  const [state, setState] = useState<DossierState>({ target: null, dossier: null, loading: false, error: null });
  const seq = useRef(0);

  const indexSpec = useMemo(() => ({
    key: 'geo-index',
    url: `${basePath()}api/geo-index.json`,
    ttlMs: 60 * 60_000,
    parse: async (res: Response): Promise<GeoIndex> => {
      const j = (await res.json()) as GeoIndex;
      if (!Array.isArray(j?.trackers) || !Array.isArray(j?.points)) throw new Error('geo-index: unexpected shape');
      return j;
    },
    isEmpty: () => false,
  }), []);
  const index = useLiveSource<GeoIndex>(indexSpec, { enabled: state.target !== null });
  const indexRef = useRef(index.data);
  indexRef.current = index.data;
  const indexStatusRef = useRef(index.status);
  indexStatusRef.current = index.status;

  const run = useCallback(async (target: DossierTarget, mySeq: number) => {
    // Wait briefly for the index if it is still loading; the dossier can
    // still be built without it (fewer trackers/nearby events).
    let idx = indexRef.current;
    // Stop waiting as soon as the request has settled: a failed index must
    // not cost every dossier a fixed 3 s stall.
    // Right after open() the index hook may not have enabled itself yet
    // ('disabled'/'idle'), so only a definite failure ends the wait early.
    for (let i = 0; !idx && i < 20 && indexStatusRef.current !== 'error'; i++) {
      await new Promise(r => setTimeout(r, 150));
      idx = indexRef.current;
    }
    if (mySeq !== seq.current) return;
    try {
      const d = await buildDossier(target.lat, target.lon, {
        trackers: overrideTrackers ?? idx?.trackers ?? [],
        points: idx?.points ?? [],
        countryCode: target.countryCode ?? null,
      });
      if (mySeq !== seq.current) return;
      setState({ target, dossier: d, loading: false, error: null });
    } catch (err) {
      if (mySeq !== seq.current) return;
      setState({ target, dossier: null, loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  }, [overrideTrackers]);

  const open = useCallback((target: DossierTarget) => {
    seq.current += 1;
    setState({ target, dossier: null, loading: true, error: null });
    void run(target, seq.current);
  }, [run]);

  const close = useCallback(() => {
    seq.current += 1;
    setState({ target: null, dossier: null, loading: false, error: null });
  }, []);

  useEffect(() => () => { seq.current += 1; }, []);

  return { ...state, open, close, indexStatus: index.status };
}
