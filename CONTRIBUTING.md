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

## Code Style

- TypeScript strict mode
- Astro components for static content, React for interactive islands
- CSS custom properties for theming (see `src/styles/global.css`)
- Zod for runtime validation at all data boundaries

## Questions?

Open a [Discussion](https://github.com/ArtemioPadilla/watchboard/discussions) or file an issue.
