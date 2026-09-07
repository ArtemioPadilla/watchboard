# OpenStreetMap / Nominatim

- Endpoint: `https://nominatim.openstreetmap.org/reverse` (browser-side, dossier only)
- License: ODbL. Nominatim usage policy: max 1 request/second, identify the application, cache results.
- Implementation: `src/lib/rate-limiter.ts` (1.1 s), 0.1° cell cache for 24 h, `zoom=5`.
- Attribution shown: "© OpenStreetMap contributors"
