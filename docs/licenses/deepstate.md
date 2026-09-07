# DeepStateMAP frontline

- Endpoint: `https://deepstatemap.live/api/history/last` (CORS `*`, ~630 KB, `max-age=300`)
- Terms: none published for the API or the data as of 2026-09-07.
- Attribution shown: "Frontline data © DeepStateMAP".
- Status: **permission requested** (contact form on deepstatemap.live and
  the project's public Telegram, 2026-09-07). Until a written answer is
  recorded here, the layer only renders when the site is built with
  `PUBLIC_ENABLE_DEEPSTATE=true`; the default build hides the toggle.
- Fallback if declined: ISW/CTP daily assessment shapefiles (public,
  attribution required), to be added as a static layer via
  `scripts/geo/refresh-layers.ts`.
