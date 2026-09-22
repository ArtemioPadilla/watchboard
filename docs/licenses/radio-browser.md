# radio-browser.info

- Endpoint: `https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/{CC}` (build-time only, `scripts/geo/refresh-layers.ts`)
- License: the directory itself is PDDL 1.0 (public domain). Each listed stream is a link to a third-party broadcaster and is subject to that broadcaster's own terms, which radio-browser.info does not vouch for.
- Implementation: filtered to HTTPS URLs, MP3/AAC codecs, stations with geo coordinates (most rows lack them — roughly 1 in 6 in an initial Ukraine sample) and a passing last-check flag.
- Privacy: playback is a direct browser-to-broadcaster `<audio>` connection — Watchboard does not proxy it. The listener's IP reaches the broadcaster. The UI shows a one-time notice before the first play (`src/lib/radio-station.ts`).
- Attribution shown: "Stations: radio-browser.info community directory (PDDL 1.0)"
