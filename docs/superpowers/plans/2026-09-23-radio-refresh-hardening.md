# Radio Refresh Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the radio-towers refresh survive a flaky Overpass without going stale silently: merge per country, bound and surface staleness, fail loudly with an ops alert, and stop one layer's failure from blocking another.

**Architecture:** `scripts/geo/refresh-layers.ts` keeps the previous `radio-towers.geojson` as the fallback per country instead of all-or-nothing. Per-country freshness lives in `_provenance.countries`. A pure staleness check decides whether the run is healthy; the script writes the best merged file and then exits non-zero if unhealthy. The workflow splits fetches (no lock) from a single commit job (holds `main-commits`), refreshes towers monthly and stations weekly, and alerts the private ops chat on failure.

**Tech Stack:** TypeScript (`tsx`), Zod, Vitest, GitHub Actions.

**Spec:** Approved by the owner in conversation ("go" on the adversarial review's improved plan, item 3). The binding requirements are restated in Global Constraints.

## Global Constraints

- **Per-country merge.** When a country's fetch fails (network error, 429/504/runtime-error remark after its retry, area not resolved) or the time budget runs out before it's reached, keep that country's features from the previous `radio-towers.geojson` and mark it stale. Never drop a country's previous data because of a failed fetch.
- **Suspicious drop = failure.** If a country's new tower count is less than 20% of its previous count, and the previous count was at least 10, treat the fetch as failed (keep old, mark stale).
- **Provenance.** `GeoLayerProvenanceSchema` gains optional `countries: Record<ISO2, { retrievedAt: string | null; count: number; status: 'fresh' | 'stale' }>` (inner object `.strict()`). `retrievedAt` is the last successful fetch for that country (carried forward unchanged when stale; `null` if it has never succeeded). The top-level `retrievedAt` stays the run time.
- **Health rule.** A run is unhealthy if any country's `retrievedAt` is `null` or older than **35 days**, or more than **20%** of countries are `stale` in this run. Unhealthy runs still write the merged file (it is strictly better than the old one), then the script exits 1 with a `::error::` line naming the offending countries.
- **Mirror.** Primary `https://overpass-api.de/api/interpreter`. The one retry for a retryable failure goes to the fallback `https://maps.mail.ru/osm/tools/overpass/api/interpreter` (verified live on 2026-09-22; `overpass.kumi.systems` and `overpass.private.coffee` failed and must not be used).
- **Time budget.** Towers stop starting new country queries after **20 minutes** of wall time; remaining countries go stale with their previous data. Budget and clock are injectable for tests.
- **Workflow.** Stations (`radio-stations`, `radio-stations-global`) refresh weekly (Mondays 06:00 UTC); towers monthly (1st of month 07:00 UTC) and on manual dispatch with a `towers` boolean input. Fetch jobs hold no concurrency lock. One commit job holds `concurrency: main-commits` and keeps PR #289's `pushed`-flag push loop. A `notify-failure` job alerts `TELEGRAM_ALERT_CHAT_ID` (private ops chat) — **never** `TELEGRAM_CHANNEL_ID`.
- No new secrets, keys, or paid services.

---

### Task 1: Per-country merge, staleness, mirror, budget (script)

**Files:**
- Modify: `src/lib/geo-layer-schema.ts` (provenance `countries` field)
- Modify: `scripts/geo/refresh-layers.ts`
- Modify: `scripts/geo/refresh-layers.test.ts`

**Interfaces (all exported, pure unless noted):**
- `isSuspiciousDrop(prevCount: number, nextCount: number): boolean` — true when `prevCount >= 10 && nextCount < prevCount * 0.2`.
- `mergeCountryTowers(args: { previous: GeoLayer | null; results: Map<string, { ok: true; features: GeoLayer['features'] } | { ok: false; reason: string }>; codes: string[]; now: string }): { features: GeoLayer['features']; countries: Record<string, CountryProvenance>; staleReasons: Record<string, string> }` — for each code: ok and not a suspicious drop → fresh (new features, `retrievedAt = now`); otherwise stale (previous features for that `countryCode`, previous `retrievedAt` or `null`, reason recorded). Codes absent from `results` (budget exhausted) are stale with reason `"time budget exhausted"`.
- `assessRadioTowerHealth(countries: Record<string, CountryProvenance>, now: string): { ok: boolean; problems: string[] }` — applies the health rule.
- `fetchOverpassCountryTowers(cc, sleepFn?, opts?)` — the single retry now targets the fallback mirror URL (keep the existing 30 s wait before the retry). Keep its existing tests passing; add one asserting the retry request goes to the fallback host.
- `radioTowers.run(now)` — reads the previous file from disk (if valid), loops codes with the 20-min budget (injectable clock), calls `mergeCountryTowers`, applies `capTowersPerCountry(…, 800)`, stamps `_provenance.countries`, and attaches the health result so `main()` can act on it (e.g. adapter returns `{ layer, health }` or `main()` calls `assessRadioTowerHealth` on the written layer — implementer's choice, documented).
- `main()` — after writing a radio-towers file, if unhealthy: print `::error::radio-towers unhealthy: <problems>` and set a non-zero exit code (other adapters in the same run still complete).

Steps (TDD):
- [ ] Tests first: `isSuspiciousDrop` boundaries (prev 9 → never; prev 100 → 19 true / 20 false); `mergeCountryTowers` — fresh country replaced, failed country keeps previous features with previous `retrievedAt`, never-succeeded country gets `retrievedAt: null` and 0 features, suspicious drop kept old, budget-missing code stale; `assessRadioTowerHealth` — 36-day-old country unhealthy, `null` unhealthy, 1 of 5 stale (20%) healthy, 2 of 5 (40%) unhealthy; fallback mirror host on retry; `GeoLayerSchema` accepts the new `countries` field and rejects an unknown status. Run; confirm failing.
- [ ] Implement. Keep `--check` passing on the existing committed `radio-towers.geojson` (it has no `countries` field — the field is optional).
- [ ] Do NOT run a live regeneration (Overpass rate-limits; the monthly job will). `npx vitest run scripts/geo/refresh-layers.test.ts src/lib/live-layers.test.ts` green; `npx tsx scripts/geo/refresh-layers.ts --check` green. Commit.

### Task 2: Workflow split, schedules, lock scope, ops alert

**Files:**
- Modify: `.github/workflows/refresh-radio-layers.yml`

Structure:
- `on.schedule`: `'0 6 * * 1'` (stations) and `'0 7 1 * *'` (towers); `workflow_dispatch` with inputs `stations` (boolean, default true) and `towers` (boolean, default false).
- Job `fetch-stations` (runs on the weekly cron or dispatch with `stations`): checkout, setup-node@v5 with npm cache, `npm ci`, run both station layers, `--check`, upload the two files as an artifact. `timeout-minutes: 15`. No concurrency group.
- Job `fetch-towers` (runs on the monthly cron or dispatch with `towers`): same setup, `npx tsx scripts/geo/refresh-layers.ts --layer radio-towers`, capture its exit code without aborting (the file may be written even when unhealthy), `--check`, upload the file as an artifact, then fail the job if the refresh exit code was non-zero. `timeout-minutes: 30`.
- Job `commit` (`needs: [fetch-stations, fetch-towers]`, `if: ${{ !cancelled() }}`, `concurrency: { group: main-commits, cancel-in-progress: false }`): checkout, download whatever artifacts exist, `git add` only files that were produced, commit if changed, PR #289's `pushed`-flag retry loop with `exit 1` on failure. `timeout-minutes: 5`.
- Job `notify-failure` (`needs: [fetch-stations, fetch-towers, commit]`, `if: ${{ failure() }}`): copy the pattern from `light-scan.yml`'s `notify-failure` job verbatim in spirit (same env var names, `TELEGRAM_ALERT_CHAT_ID`), message naming the workflow run URL.
- `permissions: contents: write` kept.

Steps:
- [ ] Rewrite the workflow per the structure. Read `light-scan.yml`'s `notify-failure` and PR #289's loop in the current file and reuse them.
- [ ] Validate: `SHELLCHECK_OPTS="-S warning" actionlint` (install via brew if missing) and YAML parse. Reason through: weekly run (towers job skipped → commit still runs with station artifacts only), monthly run (stations skipped), towers unhealthy (file committed, run red, alert fires), stations fetch fails (towers unaffected on its own schedule; run red, alert). Commit.

### Task 3: Per-country freshness on `/sources/`

**Files:**
- Modify: `src/pages/sources.astro`

Steps:
- [ ] Under the static-layers table, when a layer's `_provenance.countries` exists, render a compact table: country code, towers count, last successful fetch date (or "never"), status (fresh/stale), with stale rows visually flagged (reuse existing tier/amber classes from `global.css`, e.g. the freshness `.stale` styling). Sorted stale-first, then by code.
- [ ] Verify with `npm run build` (≈25 min; run in background and poll) and check `dist/sources/index.html` contains the table when fed a fixture: since the committed file has no `countries` yet, add a small unit-testable helper (e.g. `src/lib/radio-freshness.ts` → `countryFreshnessRows(prov, now)`) with tests, and have the page use it. Commit.
