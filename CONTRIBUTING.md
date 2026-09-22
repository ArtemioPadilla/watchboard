# Contributing to Watchboard

Thanks for your interest in contributing! Here's how to get involved.

## Quick Start

```bash
git clone https://github.com/ArtemioPadilla/watchboard.git
cd watchboard
npm install
npm run dev
```

Open [http://localhost:4321/watchboard/](http://localhost:4321/watchboard/)

## Ways to Contribute

### Request a New Tracker

The easiest way to contribute: [open a Tracker Request](https://github.com/ArtemioPadilla/watchboard/issues/new?template=tracker-request.yml) with a topic, region, and why it matters. The team can generate and populate it in ~25 minutes using the automated init workflow.

### Fix Data Errors

Found incorrect data? [Open a Data Correction](https://github.com/ArtemioPadilla/watchboard/issues/new?template=data-correction.yml) with:
- Which tracker and section
- What's wrong
- A source link for the correct information

Or submit a PR directly — data lives in `trackers/{slug}/data/`.

### Fix a Radio Station or Tower

The radio-stations map/globe layer is regenerated weekly from
radio-browser.info and OpenStreetMap, so a fix to the upstream directory
doesn't help until the next refresh — and some fixes (a dead stream that
still passes its own health check, a mis-geocoded pin) need to be corrected
by hand regardless. `src/data/radio-stations-overrides.json` is a curated
list of corrections layered on top of every refresh. Each entry needs:
`stationUuid` (the radio-browser.info id, prefilled by the "Report broken
stream" link in the player), `action` (`add`, `remove`, or `correct`),
`note` (why), and `source` (an issue link or other evidence). A `correct`
entry takes a `patch` with just the fields to change — including `lat`/`lon`
to move the pin. Changes take effect on the next scheduled or manual run of
`refresh-radio-layers.yml`, or locally via
`npx tsx scripts/geo/refresh-layers.ts --layer radio-stations`.

### Improve Code

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make changes
4. Run `npm run build` to verify
5. Submit a PR

### Data Structure

Each tracker has JSON data files validated by Zod schemas in `src/lib/schemas.ts`. Key rules:

- `year` is always a **string** (e.g., `"2026"`, not `2026`)
- `direction` on economic items is `"up"` or `"down"` only
- `pole` on sources: `"western"`, `"middle_eastern"`, `"eastern"`, or `"international"`
- Every data point needs a `sources` array with `name`, `url`, `tier` (1-4)
- Casualty figures should include `contested` field

### Adding a New Section

1. Add Zod schema in `src/lib/schemas.ts`
2. Create component in `src/components/static/` (or `islands/` if interactive)
3. Add section ID to `SectionId` in `src/lib/tracker-config.ts`
4. Add conditional render in `src/pages/[tracker]/index.astro`
5. Add update logic in `scripts/update-data.ts`

## Architecture Decisions (ADRs)

Decisions that change how the code is structured (shared state, data
contracts, external sources) are recorded in `docs/adr/`. Copy
`docs/adr/0000-template.md`, number it sequentially, and link it from
the PR. Existing ADRs:

- `0001-url-view-state-is-island-local.md` — shareable view state lives in each island, no global store
- `0002-live-layer-registry.md` — every external map layer is declared in `src/lib/live-layers.ts`

## Tests

```bash
npm test            # unit tests (vitest), no network
npm run test:live   # also runs tests marked liveIt/liveDescribe (RUN_LIVE_TESTS=1)
npm run test:e2e    # Playwright
```

Tests that talk to a third-party API must use `liveIt` / `liveDescribe`
from `tests/helpers/live.ts` so `npm test` stays green offline.

Adding a live data source? Register it in `src/lib/live-layers.ts` and
add its host to `connect-src` in both `src/layouts/BaseLayout.astro` and
`public/_headers`; `src/lib/live-layers.test.ts` fails otherwise.

## Code Style

- TypeScript strict mode
- Astro components for static content, React for interactive islands
- CSS custom properties for theming (see `src/styles/global.css`)
- Zod for runtime validation at all data boundaries

## Questions?

Open a [Discussion](https://github.com/ArtemioPadilla/watchboard/discussions) or file an issue.
