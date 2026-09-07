# Third-party data licenses

One file per external layer or dataset Watchboard redistributes. Each
records the terms, the retrieval method, the attribution the UI shows,
and, where terms are missing, the permission request and its status.
Registry: `src/lib/live-layers.ts` (feeds) and `src/lib/geo-layer-schema.ts`
(static GeoJSON under `public/geo/layers/`).

| Dataset | License | Status | File |
|---|---|---|---|
| DeepStateMAP frontline | not published | permission requested, layer behind `PUBLIC_ENABLE_DEEPSTATE` | `deepstate.md` |
| GDACS alerts | CC BY 4.0 | attribution shown | `gdacs.md` |
| Wikidata nuclear plants | CC0 1.0 | attribution shown | `wikidata.md` |
| TeleGeography submarine cables | CC BY-NC-SA 3.0 | attribution shown; non-commercial use only | `telegeography.md` |
| Nominatim / OpenStreetMap (dossier) | ODbL; Nominatim usage policy | 1 req/s, cached | `openstreetmap.md` |
