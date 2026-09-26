# Tech-debt cleanups (radio, i18n, public re-send) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The hourly pipeline stops losing breaking updates and the daily video job stops going red (PR-0). No retry, cancellation or failed push can post twice to the public Telegram channel or to Bluesky. A radio layer that is empty for a tracker says so instead of showing a silent toggle. The mobile 3D globe gets the same layers as desktop. Dead code and the four TS1117 errors go away; which sort label survives is the owner's call (Q5).

**Architecture:** A hotfix PR-0 first (the hourly pipeline has been losing most breaking updates on every run since 2026-09-23, and the daily video job is red every day), then four independent PRs, each branched from `origin/main`, merged in severity order. PR-0 owns the hourly-scan conflict resolver (with a metrics-index union and a structural merge for tracker JSON) and the daily-video dirty-tree fix. PR-1 adds two shell helpers under `scripts/ci/`: `push-state.sh` (rebase + retry + backoff, then a private ops alert on final failure) and `resolve-rebase-conflicts.sh` (the hourly-scan conflict policy, with the `ours`/`theirs` sides corrected). It also adds a pure Telegram send loop that saves after every publish (`scripts/lib/telegram-send-loop.ts`), a Bluesky own-feed dedupe (`scripts/lib/bluesky-feed-dedupe.ts`) with persist-after-each-post in `bluesky-post.ts`, and an idempotent Telegram video poster (`scripts/lib/telegram-video.ts`). PR-2 adds a pure `emptyScopeReason()` to `src/lib/geo-layer-schema.ts`, which both toggle surfaces read; it also adds a `::notice::` for zero-tower countries and one shared `layerProps` object in `MobileMapTab.tsx`. PR-3 and PR-4 are deletions and small refactors.

**Tech Stack:** Astro 5 static site (`output: 'static'`), React islands, TypeScript, Zod, Leaflet/react-leaflet, Cesium, `@atproto/api` (scripts only), Vitest (`environment: 'node'`, no DOM library, only `*.test.ts` is collected: `vitest.config.ts:10-11`), Playwright (`playwright.config.ts`, run by `.github/workflows/e2e.yml:37` with an explicit spec list), GitHub Actions, bash + git 2.53.

**Spec:** `docs/superpowers/specs/2026-09-24-tech-debt-cleanups-design.md`

## Revision after adversarial review (2026-09-25)

Every finding was re-checked against code, `gh run` logs and `origin/main` history; the full table is at the end of the spec ("Adversarial review log"). What changed in this plan:

- **New PR-0 (hotfix, ships first, alone).** Evidence: all 9 `hourly-scan` runs since `35810420279` (2026-09-23T02:27Z) concluded `failure`; run `36086706261` logs 44× `Merge conflict in public/_metrics/index.json`, 44× `unknown option 'no-edit'` and 9× `Failed to push hourly update for <tracker>`. Every matrix job appends to `public/_metrics/index.json` (`hourly-scan.yml:988-1001`), so every job after the first conflicts, and the Claude-generated tracker update exists only on the runner. Task 2 moves to PR-0 with a changed policy (metrics index = union, tracker JSON arrays = structural union, other tracker files = job side **with a warning**, `today-updates.json` handling dropped). New Task 2b fixes the daily-video dirty tree.
- **Daily video, corrected diagnosis.** Runs `36090465310`, `35950367253`, `35814001800` all fail at "Fail job if a state commit/push failed": `commit_social` hits `error: cannot pull with rebase: You have unstaged changes.` on all 5 attempts. The record is **not** lost: `commit_video_state` does `git reset --hard HEAD` after its first failed attempt and its second attempt pushes both commits (`526c002..a5a7a74 main -> main`; `git log origin/main -- 'public/_social/video-post-*'` shows the 09-23, 09-24 and 09-25 records). So the harm is a red job every day that invites exactly the "Re-run" the spec fears. `push-state.sh` gains `--autostash` and a dirty-tree report (Task 1).
- **The telegram-notify path is dead, not merely stale.** Both callers of `hourly-post.ts` are `if: false` (`hourly-scan.yml:594`, `:682`); `today-updates.json` on `main` is dated `2026-08-09`; the last `telegram-sent.json` commit is `f3bc2060a` (2026-08-09); the last 6 `telegram-notify` runs are `skipped`. Tasks 3 and the telegram-notify half of Task 4 are **held** behind owner question 6 (re-wire or retire). The `today-updates.json` union is removed from Task 2.
- **Light scan, the one live public publisher, now saves state after each alert** (new Task 4b). `saveState(state)` runs only at `hourly-light-scan.ts:462`, after the loop that posts at `:385-386`, so the old rationale for `if: always()` was wrong.
- **Re-runs check out the original SHA.** Every publishing job uses a bare `actions/checkout@v5` (`daily-video.yml:26`, `:394`; `post-social-queue.yml:26`; `light-scan.yml:20`), and a GitHub re-run reuses the original `GITHUB_SHA`, so a record pushed by attempt 1 is invisible to attempt 2. Tasks 5 and 6 add `ref: main`.
- **Radio UX.** Text states the tag filter ("No radio-tagged towers…"), is visible without hover (`aria-label` + visible short label), uses localized country names (`Intl.DisplayNames`), is computed at build time so the toggle says so before it is clicked, and is rendered by `GlobeMobileSheet` as well. The key is per layer (`emptyStateKey` on `radio-towers` only). e2e specs use fixture GeoJSON via `page.route`, plus mobile-viewport cases.
- **Task 11** keys the notice on the merged per-country status. **Task 12**'s phone check is an owner gate. **Q5** (sort label) now blocks PR-3.

---

## Verification log (what was re-checked for this plan)

Every claim below was re-read on 2026-09-25 against `docs/next-steps-specs`. That branch is 20 commits behind `origin/main`, but all 20 are `chore(...)` bot commits, and `git diff --stat HEAD origin/main -- scripts src .github` is empty, so the line numbers are also valid on `main`.

| Item | Evidence re-checked | Result |
|---|---|---|
| a | `src/i18n/translations.ts:515` `'Sort'`, `:536` `'Sort by'`, `:1221` `'Orden'`, `:1242` `'Ordenar por'`, `:1920` `'Tri'`, `:1941` `'Trier par'`, `:2619` `'Ordem'`, `:2640` `'Ordenar por'`. Locale blocks: `en` `:9`, `es` `:735-1432`, `fr` `:1434-2131`, `pt` `:2133-2830`. Only consumer: `SidebarPanel.tsx:692-693`. `package.json:11` build = `generate-api && copy-cesium && astro build` (no type-check), but `CLAUDE.md:15` says "Type-check + build". | Real |
| b | `grep -rn TrackerDirectory src CLAUDE.md` finds only the component itself (`TrackerDirectory.tsx:862`), the comment at `tracker-directory-utils.ts:2` and `CLAUDE.md:108`. The React Islands list does not mention it. | Real. The CLAUDE.md fix is one line, not two. |
| c | Live Overpass run of the exact filter from `refresh-layers.ts:246-249` for IL (strict area): area count `1`, towers `0`. `origin/main:public/geo/layers/radio-towers.geojson` `_provenance.countries`: IL/PS/YE/BF/NE `{count: 0, status: 'fresh', retrievedAt: 2026-09-24T03:41:10.558Z}`; RW `{9, stale}`, TH `{52, stale}`. Trackers whose codes are **all** zero: `gaza-war` (PS, IL), `israel-palestine` (IL, PS), `yemen-conflict` (YE). Counts are hidden when 0 in `MapLayerToggles.tsx:128` and `CesiumControls.tsx:392`. | Not a query bug: OSM has no `communication:radio` towers there. It is a UX bug. |
| d | `MobileMapTab.tsx:141-153` passes 11 props to `<CesiumGlobe>` and omits `trackerSlug`, `mapBounds`, `liveLayers`, `staticLayers` and `radioCountryCodes`, all of which it already receives (`:22-27`, `:40`) and passes to `<IntelMap>` (`:100-111`). `CesiumGlobe.tsx:131` defaults both layer lists to `[]`. | Real |
| e1 | `refresh-layers.ts:743-754` (`radioTowers` adapter) is only reached through `ADAPTERS` (`:924`). `main()` skips it (`:950-956`). | Real |
| e2 | `refresh-layers.ts:796` `'previous' in deps ? deps.previous! : …`. The `runAndWriteRadioTowers` tests (`refresh-layers.test.ts:740-820`) never pass `previous`, so they read the real file from disk. | Real |
| e3 | `GeoLayersLeaflet.tsx:53-54` builds one `L.divIcon` per feature. | Real (minor) |
| f | `telegram-notify.yml:16-18` `cancel-in-progress: true`, `:107` admits the re-send. `light-scan.yml:9-10` `cancel-in-progress: true`, 3-try push `:61-72`. `post-social-queue.yml:55-66` 3-try push. `bluesky-post.ts:589-592` saves once at the end. `telegram-channel.ts:449-453` logs failed sends; `:476` saves once. `daily-video.yml:330-368` Telegram `curl -s` without `-f`, **after** the record commit (`:193-218`), and never written to any record; `:547-548` single-try push in `video-progress`. | Real |
| f/N1 | Reproduced in a scratch repo with git 2.53.0: during `git pull --rebase`, `--ours` = `origin/main` (`MAIN`), `--theirs` = the job's commit (`JOB`). `git rebase --continue --no-edit` exits **129** (`error: unknown option 'no-edit'`); `GIT_EDITOR=true git rebase --continue` exits 0. | Real, with a correction (below) |
| g | `gh run view 35952452042`: `✓ fetch-towers`, `✓ commit`, `notify-failure` skipped. The only annotations are 2 warnings (RW, TH: Overpass 504). `assessRadioTowerHealth` (`refresh-layers.ts:518-548`): 2/34 = 5.9 % < 20 %, and both keep `retrievedAt` 2026-09-22 (< 35 days). | **False: dropped** |

## Items dropped or corrected

- **g is dropped.** The run was green and the rule behaved as designed (see table). There is nothing to fix. The optional `--check` wording change ("fresh 32/34, oldest …") is not planned: the spec marks it optional and it changes no behaviour.
- **N1 is more subtle than the spec says.** The spec says the inverted flags "silently discard this job's update". In practice, `--no-edit` makes `git rebase --continue` fail every time (exit 129), so `|| git rebase --abort` runs on every conflict. The resolution block is **dead code**: a conflict is never resolved. Since #289 (2026-09-23) made the loop fail loudly, this is a **live outage**: `public/_metrics/index.json` conflicts on every matrix job after the first, all 5 attempts fail identically, and that job's tracker update is lost (run `36086706261`: 1 of 10 `act` jobs pushed; 9 consecutive runs red). It is loud but it loses data on every run, so it ships alone as PR-0 (Task 2). The trap remains: fixing only `--no-edit` would switch the inverted flags on and **start** silent data loss, so Task 2 fixes both and tests the surviving contents. Updates lost since 2026-09-23T02:27Z are not replayed automatically: Task 2 Step 9 lists them for the owner.
- **`today-updates.json` has not been committed since 2026-08-09, because its writers are disabled.** `hourly-post.ts` (`saveManifest`, `:155/:191/:228/:265`) is called only from the two X steps at `hourly-scan.yml:594` and `:682`, both `if: false` since X posting was retired (`local-hourly.ts:704` also writes it, but only on a developer machine). `telegram-channel.ts` reads nothing else, so no per-update Telegram post has gone out since 2026-08-09. That is the real silent failure; open question 6 now asks the owner to re-wire or retire the path, and Tasks 3 and 4 (telegram-notify part) wait for the answer.
- **Component render tests from the spec's Testing section are replaced.** Vitest only collects `*.test.ts` in a node environment with no DOM library, so it cannot render `MapLayerToggles`, `CesiumControls` or `MobileMapTab`. The plan covers them instead with pure-helper unit tests, a source-scan guard test (`MobileMapTab`), and Playwright specs added to the `e2e.yml:37` list.

## Global Constraints

- **Branches:** `fix/hourly-scan-conflicts` (PR-0, Tasks 1, 2, 2b), `fix/no-public-resend` (PR-1), `fix/radio-empty-state-mobile-globe` (PR-2), `chore/tech-debt-cleanup` (PR-3), `perf/leaflet-radio-icons` (PR-4). Create each with `git fetch origin && git switch -c <branch> origin/main`, never from `docs/next-steps-specs`.
- **Merging:** `main` has no required checks (CLAUDE.md "Merging"). Before merging each PR, run `gh pr checks <n> --watch --fail-fast` and merge by hand only when it is green. Never enable auto-merge before the checks pass.
- **Public vs private Telegram:** ops alerts go only to `TELEGRAM_ALERT_CHAT_ID`. `push-state.sh` must refuse to send, and print `::error::`, when `TELEGRAM_ALERT_CHAT_ID` equals `TELEGRAM_CHANNEL_ID`. Nothing new may send to `TELEGRAM_CHANNEL_ID` except the existing publishers.
- **Push policy:** `scripts/ci/push-state.sh <label> [attempts]`, default `attempts=5`. The backoff before attempt `i+1` is `2**i + RANDOM%3` seconds, skipped when `PUSH_STATE_NO_SLEEP=1` (tests only). It pulls with `git pull --rebase --autostash origin main` (a dirty tree is what fails daily-video today) and pushes with `git push origin HEAD:main`. When a pull stops on a content conflict it prints `::error::push-state: content conflict in <paths>` and stops retrying at once (a recurring conflict fails identically 5 times; retries only help against push races). On final failure it prints `::error::push-state: failed to push <label> after <n> attempts`, sends the private alert and exits 1.
- **Alert endpoint:** `${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`. `TELEGRAM_API_BASE` exists only so tests can point it at a local server.
- **Conflict policy (hourly-scan, Task 2, PR-0):** during a rebase `--ours` = `origin/main`, `--theirs` = this job's commit.
  - `public/_metrics/index.json` → union of both arrays keyed by `file`, sorted by `timestamp`, 90-day prune (`scripts/ci/merge-json.mjs metrics-index`). Other `public/_metrics/**` (per-run files never collide) → `--theirs`.
  - `trackers/<TRACKER>/data/events/*.json` → union of both arrays keyed by `id`, main's entry order first, then the job's new ids (`merge-json.mjs by-id`); an id present on both sides keeps the **job's** version (the job just re-verified it).
  - `trackers/<TRACKER>/data/digests.json` → union keyed by `date + '::' + title`, sorted by `date` descending (`merge-json.mjs digests`).
  - Any other `trackers/<TRACKER>/**` → `--theirs`, and print `::warning::resolve-rebase-conflicts: took the job's whole <path>; main's concurrent edits to it are discarded` so the loss is never silent.
  - `public/_hourly/state.json` → `--ours`.
  - Any other conflicted path (including another tracker's files and `today-updates.json`, which has no live writer) → `git rebase --abort`, exit 1.
  - Continue with `GIT_EDITOR=true git rebase --continue`, never `--no-edit`.
- **Telegram send outcomes:** `sent` (HTTP 2xx with a numeric `result.message_id`), `rejected` (HTTP 4xx: Telegram did not publish), `unknown` (network error, timeout, HTTP 5xx, or 2xx without an id: it may have published). Only `rejected` stays out of the sent-log. `unknown` is logged with `telegramMessageId: null, uncertain: true` and is not re-sent automatically; this is a **provisional** default (loss over duplicate) that owner question 7 must confirm, and every `unknown` also sends a private `TELEGRAM_ALERT_CHAT_ID` notice naming the key. A thrown fetch whose `err.cause?.code` is `ENOTFOUND`, `EAI_AGAIN` or `ECONNREFUSED` never reached Telegram, so `sendTelegramMessage` maps it to `{ status: 'rejected', httpStatus: 0 }` (retried next run, counts toward the 3-strike limit); any other thrown error (timeouts, resets after connect) stays `unknown`. A photo send falls back to text **only** on `rejected`; a photo `unknown` stops there. A key `rejected` 3 times (counted in `rejectedAttempts` on the log) becomes terminal and triggers a private alert.
- **Bluesky dedupe window:** 24 h of the bot's own feed (`getAuthorFeed`, `limit: 50`). The key is `postKey(text)` = the first 120 characters of the whitespace-collapsed, lower-cased text.
- **Empty-scope rule:** `emptyScopeReason(layer, codes, meta)` returns the sorted list of codes only when all of these hold: `meta.emptyStateKey` is set (only `radio-towers` has it), `meta.filterByCountry` is true, the layer is loaded, zero features match `codes`, and **every** code has a `_provenance.countries[cc]` entry with `count === 0 && status === 'fresh'`. Otherwise it returns `null`. A stale or missing country is not "none mapped". Partial emptiness (sahel-insurgency: ML 74, BF/NE 0) returns `null` by default; owner question 8 decides whether to disclose it.
- **Build-time empty scopes:** `src/pages/[tracker]/index.astro` and `src/pages/[tracker]/globe.astro` read `public/geo/layers/<id>.geojson` for each `map.staticLayers` id at build time (`readFileSync`, parsed with `GeoLayerSchema`) and pass `emptyScopes: Record<string, string[]>` (id → codes from `emptyScopeReason`) down to `IntelMap`, `MobileTabShellLoader` and `CesiumGlobe`. The toggle is marked before the reader clicks it; the runtime value (after fetch) wins when present.
- **i18n keys** (no interpolation in `t()`, `translations.ts:2834-2836`, so `{codes}` is filled with `.replace`): `layers.radioTowersNoneShort` en `'none tagged'`, es `'sin etiquetar'`, fr `'aucune étiquetée'`, pt `'nenhuma etiquetada'`; `layers.radioTowersNone` en `'No radio-tagged towers in OpenStreetMap for {codes}'`, es `'No hay torres con etiqueta de radio en OpenStreetMap para {codes}'`, fr `'Aucune tour étiquetée radio dans OpenStreetMap pour {codes}'`, pt `'Nenhuma torre com etiqueta de rádio no OpenStreetMap para {codes}'`. `{codes}` is the localized country names, `new Intl.DisplayNames([locale], { type: 'region' }).of(cc)`, joined with `', '` (en: "Israel, Palestinian Territories").
- **Accessibility:** the short label is visible text next to the toggle; the full sentence is the toggle's `aria-describedby` target (a visually hidden span) **and** its `title`. No information lives only in `title`.
- **Zero-country notice:** `::notice::radio-towers <CC>: 0 radio-tagged towers in OSM`, once per country whose **final** provenance is `status === 'fresh' && count === 0` (not the raw fetch result, so a suspicious drop that was kept stale gets only its warning). It is a notice, not a warning.
- **`staticLayers` ceiling:** `.max(3)` in `tracker-config.ts:46`, matching the three fixed slots in `CesiumGlobe.tsx:641-643` and `IntelMap.tsx:163-165`.
- **Kept texts (a):** decided by owner question 5. Default "Sort by" / "Ordenar por" / "Trier par" / "Ordenar por" (no visible change); alternative E7's "Sort" / "Orden" / "Tri" / "Ordem".
- **Type check:** `astro check` runs out of memory locally. Use `npx tsc --noEmit -p . 2>&1 | grep -E '<touched files>'` and compare with the same grep on `origin/main`: there must be no new errors in touched files. Baseline measured for this plan: 117 errors in total. Among touched files, the only pre-existing ones are `CesiumGlobe.tsx(922,13)` and `(1064,15)` (TS2322, mission trajectory), `useGeoLayers.ts(173,11)`, `(182,11)`, `(189,13)` and `(197,13)` (TS2322, `string | null` names), and the four TS1117 in `translations.ts` that Task 15 removes. All other touched files are clean today and must stay clean.

## File Structure

| File | PR | Action | Responsibility |
|---|---|---|---|
| `scripts/ci/push-state.sh` | 0 | create | rebase (`--autostash`) + push with retry/backoff, conflict fast-fail, private alert on failure |
| `scripts/ci/resolve-rebase-conflicts.sh` | 0 | create | hourly-scan conflict policy |
| `scripts/ci/merge-json.mjs` | 0 | create | structural unions: `metrics-index`, `by-id`, `digests` (called by the resolver) |
| `tests/ci/push-state.test.ts` | 0 | create | temp-repo tests for push, dirty tree, conflict fast-fail, alert guard |
| `tests/ci/resolve-rebase-conflicts.test.ts` | 0 | create | temp-repo conflict tests (both sides survive) |
| `.github/workflows/daily-video.yml` | 0, 1 | modify | dirty-tree fix (0); idempotent Telegram, `ref: main`, gate on Telegram outcome (1) |
| `scripts/hourly-light-scan.ts` (+ `scripts/hourly-light-scan.test.ts`) | 1 | modify/create | `saveState` right after each successful alert |
| `src/components/islands/CesiumGlobe/GlobeMobileSheet.tsx` | 2 | modify | same empty-state chip as `CesiumControls` |
| `src/pages/[tracker]/index.astro`, `src/pages/[tracker]/globe.astro`, `src/lib/empty-scopes-node.ts` | 2 | modify/create | build-time `emptyScopes` |
| `e2e/fixtures/radio-towers-empty.geojson` | 2 | create | fixture for the empty-state specs |
| `scripts/lib/telegram-send-loop.ts` (+ `.test.ts`) | 1 | create | per-update send, tri-state outcome, save after each |
| `scripts/telegram-channel.ts` | 1 | modify | tri-state `sendTelegramMessage`, delegate the loop |
| `scripts/lib/bluesky-feed-dedupe.ts` (+ `.test.ts`) | 1 | create | `postKey`, `recentOwnPostIndex` |
| `scripts/bluesky-post.ts`, `scripts/bluesky-post.test.ts` | 1 | modify/create | direct-run guard, exported `postFromQueue` with injectable agent, feed dedupe, persist after each publish |
| `scripts/lib/telegram-video.ts` (+ `.test.ts`) | 1 | create | idempotent `sendVideo` against the video post record |
| `scripts/telegram-video-post.ts` | 1 | create | CLI wrapper for the workflow |
| `scripts/post-video-social.ts` | 1 | modify | tolerate a partial record written by the Telegram step |
| `.github/workflows/{telegram-notify,light-scan,post-social-queue,daily-video,hourly-scan}.yml` | 1 | modify | F1, F3a, F4, F5 wiring |
| `src/lib/geo-layer-schema.ts` (+ `.test.ts`) | 2 | modify | `emptyScopeReason` |
| `src/i18n/translations.ts` | 2, 3 | modify | add `layers.radioTowersNone` + `layers.radioTowersNoneShort` (2); delete 4 duplicate lines (3) |
| `src/components/islands/IntelMap.tsx`, `MapLayerToggles.tsx` | 2 | modify | pass/render `emptyCodes` |
| `src/components/islands/CesiumGlobe/{useGeoLayers.ts,CesiumGlobe.tsx,CesiumControls.tsx}` | 2 | modify | same for the globe |
| `src/styles/global.css`, `src/styles/globe.css` | 2 | modify | `.map-layer-empty`, `.globe-filter-empty` |
| `e2e/geo-layers.spec.ts` | 2, 4 | modify | empty-state and radio-icon specs |
| `scripts/geo/refresh-layers.ts` (+ `.test.ts`) | 2, 3 | modify | notice (2); `LAYER_IDS`, adapter removal, `previous` removal (3) |
| `src/components/islands/mobile/mobile-layer-props.ts` (+ `.test.ts`) | 2 | create | `LAYER_PROP_KEYS`, `pickLayerProps` |
| `src/components/islands/mobile/MobileMapTab.tsx` | 2 | modify | spread `layerProps` into both maps |
| `src/lib/tracker-config.ts`, `src/lib/tracker-config.test.ts` | 2 | modify/create | `.max(3)` |
| `src/i18n/translations-source.test.ts` | 3 | create | duplicate-key guard over the source text |
| `src/components/islands/TrackerDirectory.tsx` | 3 | delete | dead component |
| `src/lib/tracker-directory-utils.ts` | 3 | modify | header comment only |
| `CLAUDE.md` | 3 | modify | `:15` build wording, `:108` dead surface |
| `src/components/islands/GeoLayersLeaflet.tsx` | 4 | modify | one `divIcon` per layer id |

## PR-0 · Hotfix: hourly-scan loses updates; daily-video red every day (N1, F5, dirty tree)

Branch `fix/hourly-scan-conflicts`. Ships first and alone, independent of every owner question. Tasks 1, 2 and 2b. Merge by hand after `gh pr checks <n> --watch --fail-fast` is green, then run Task 2 Step 9 (verify on the next hourly run).

### Task 1: `scripts/ci/push-state.sh` — retry, backoff, private alert

**Files:** create `scripts/ci/push-state.sh`, `tests/ci/push-state.test.ts`.

**Interfaces:**
- Produces: `bash scripts/ci/push-state.sh <label> [attempts=5]`. It reads env `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`, `TELEGRAM_CHANNEL_ID` (guard only), `PUSH_STATE_DETAIL` (free text added to the alert), `TELEGRAM_API_BASE`, `PUSH_STATE_NO_SLEEP` and `GITHUB_SERVER_URL`/`GITHUB_REPOSITORY`/`GITHUB_RUN_ID`. Exit 0 = pushed, 1 = not pushed.
- Consumed by Tasks 4, 5 and 6.

- [ ] **Step 1: Write the failing test** `tests/ci/push-state.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

const SCRIPT = resolve('scripts/ci/push-state.sh');
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'push-state-'));
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = join(root, 'seed');
  git(root, 'clone', '-q', origin, seed);
  for (const [k, v] of [['user.email', 'a@b'], ['user.name', 't']]) git(seed, 'config', k, v);
  writeFileSync(join(seed, 'a.txt'), 'base\n'); git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'base'); git(seed, 'push', '-q', 'origin', 'main');
  const job = join(root, 'job');
  git(root, 'clone', '-q', origin, job);
  for (const [k, v] of [['user.email', 'a@b'], ['user.name', 't']]) git(job, 'config', k, v);
  return { root, origin, seed, job };
}

function run(cwd: string, env: Record<string, string>, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise(res => {
    const p = spawn('bash', [SCRIPT, ...args], { cwd, env: { ...process.env, PUSH_STATE_NO_SLEEP: '1', ...env } });
    let out = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (out += d));
    p.on('close', code => res({ code: code ?? -1, out }));
  });
}

describe('push-state.sh', () => {
  let r: ReturnType<typeof setup>;
  beforeEach(() => { r = setup(); });

  it('rebases over a concurrent push and pushes', async () => {
    writeFileSync(join(r.seed, 'b.txt'), 'other bot\n'); git(r.seed, 'add', '.'); git(r.seed, 'commit', '-qm', 'other'); git(r.seed, 'push', '-q', 'origin', 'main');
    writeFileSync(join(r.job, 'state.json'), '{"sent":1}\n'); git(r.job, 'add', '.'); git(r.job, 'commit', '-qm', 'state');
    const { code, out } = await run(r.job, {}, ['telegram-sent', '3']);
    expect(code, out).toBe(0);
    expect(git(r.origin, 'show', 'main:state.json')).toContain('"sent":1');
    expect(git(r.origin, 'show', 'main:b.txt')).toContain('other bot');
  });

  it('fails after N attempts and alerts the private chat only', async () => {
    const hits: string[] = [];
    const server = createServer((req, res) => { let b = ''; req.on('data', d => (b += d)); req.on('end', () => { hits.push(`${req.url} ${b}`); res.end('{"ok":true}'); }); });
    await new Promise<void>(ok => server.listen(0, '127.0.0.1', () => ok()));
    const port = (server.address() as { port: number }).port;
    git(r.job, 'remote', 'set-url', 'origin', join(r.root, 'does-not-exist.git'));
    writeFileSync(join(r.job, 'state.json'), '{}\n'); git(r.job, 'add', '.'); git(r.job, 'commit', '-qm', 'state');
    const { code, out } = await run(r.job, {
      TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_ALERT_CHAT_ID: '-100private', TELEGRAM_CHANNEL_ID: '-100public',
      TELEGRAM_API_BASE: `http://127.0.0.1:${port}`, PUSH_STATE_DETAIL: 'keys: gaza-war::2026-09-24T01:00:00Z',
    }, ['telegram-sent', '2']);
    server.close();
    expect(code).toBe(1);
    expect(out).toContain('::error::push-state: failed to push telegram-sent after 2 attempts');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain('/botT/sendMessage');
    expect(decodeURIComponent(hits[0])).toContain('chat_id=-100private');
    expect(decodeURIComponent(hits[0])).toContain('gaza-war::2026-09-24T01:00:00Z');
  });

  it('refuses to alert when the alert chat is the public channel', async () => {
    git(r.job, 'remote', 'set-url', 'origin', join(r.root, 'does-not-exist.git'));
    writeFileSync(join(r.job, 'state.json'), '{}\n'); git(r.job, 'add', '.'); git(r.job, 'commit', '-qm', 'state');
    const { code, out } = await run(r.job, {
      TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_ALERT_CHAT_ID: '-100same', TELEGRAM_CHANNEL_ID: '-100same', TELEGRAM_API_BASE: 'http://127.0.0.1:9',
    }, ['x', '1']);
    expect(code).toBe(1);
    expect(out).toContain('refusing to alert the public channel');
  });

  it('pushes despite an unstaged tracked file (daily-video today) and leaves that file as it was', async () => {
    writeFileSync(join(r.seed, 'b.txt'), 'other bot\n'); git(r.seed, 'add', '.'); git(r.seed, 'commit', '-qm', 'other'); git(r.seed, 'push', '-q', 'origin', 'main');
    writeFileSync(join(r.job, 'state.json'), '{"posted":1}\n'); git(r.job, 'add', 'state.json'); git(r.job, 'commit', '-qm', 'record');
    writeFileSync(join(r.job, 'a.txt'), 'dirty, never staged\n'); // tracked + modified, like the render snapshot
    const { code, out } = await run(r.job, {}, ['video-post', '2']);
    expect(code, out).toBe(0);
    expect(out).toContain('push-state: dirty tree before pull: M a.txt');
    expect(git(r.origin, 'show', 'main:state.json')).toContain('"posted":1');
    expect(readFileSync(join(r.job, 'a.txt'), 'utf8')).toBe('dirty, never staged\n');
  });

  it('stops at once on a content conflict and names the file (retries cannot fix it)', async () => {
    writeFileSync(join(r.seed, 'a.txt'), 'MAIN\n'); git(r.seed, 'commit', '-qam', 'main'); git(r.seed, 'push', '-q', 'origin', 'main');
    writeFileSync(join(r.job, 'a.txt'), 'JOB\n'); git(r.job, 'commit', '-qam', 'job');
    const { code, out } = await run(r.job, {}, ['x', '5']);
    expect(code).toBe(1);
    expect(out).toContain('::error::push-state: content conflict in a.txt');
    expect(out.match(/attempt/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(git(r.job, 'log', '-1', '--format=%s').trim()).toBe('job');
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/ci/push-state.test.ts`. Expected: 5 failures (the script does not exist yet; `bash` exits 127).

- [ ] **Step 3: Implement** `scripts/ci/push-state.sh` (then run `chmod +x`):

```bash
#!/usr/bin/env bash
# Push the local state commit(s) to origin/main, surviving the 14 bots that
# also push there. On final failure: ::error:: plus a PRIVATE ops alert
# (TELEGRAM_ALERT_CHAT_ID, never TELEGRAM_CHANNEL_ID) so a human can land the
# state by hand instead of the next run re-posting to the public channel.
# Usage: scripts/ci/push-state.sh <label> [attempts=5]
set -uo pipefail
label="${1:?usage: push-state.sh <label> [attempts]}"
attempts="${2:-5}"

dirty="$(git status --porcelain --untracked-files=no)"
# Report, never hide: a dirty tree is what made daily-video's pull fail on every attempt.
[ -n "$dirty" ] && printf 'push-state: dirty tree before pull: %s\n' "$(echo "$dirty" | sed 's/^ *//' | paste -sd ',' -)"

for i in $(seq 1 "$attempts"); do
  if git pull --rebase --autostash origin main; then
    if git push origin HEAD:main; then
      echo "push-state: ${label} pushed on attempt ${i}"
      exit 0
    fi
  else
    conflicted="$(git diff --name-only --diff-filter=U | paste -sd ' ' -)"
    git rebase --abort 2>/dev/null || true
    if [ -n "$conflicted" ]; then
      # A content conflict recurs identically on every retry: fail now, loudly.
      echo "::error::push-state: content conflict in ${conflicted} — not retrying"
      break
    fi
  fi
  echo "push-state: attempt ${i} failed"
  if [ "$i" -lt "$attempts" ] && [ "${PUSH_STATE_NO_SLEEP:-}" != "1" ]; then
    sleep $(( (2 ** i) + RANDOM % 3 ))
  fi
done

echo "::error::push-state: failed to push ${label} after ${attempts} attempts"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
  if [ "${TELEGRAM_ALERT_CHAT_ID}" = "${TELEGRAM_CHANNEL_ID:-}" ]; then
    echo "::error::push-state: TELEGRAM_ALERT_CHAT_ID equals TELEGRAM_CHANNEL_ID — refusing to alert the public channel"
  else
    run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
    text="$(printf '⚠️ State push failed: %s\nPublished items are NOT recorded on main — do not re-run; commit the state by hand.\n%s\n%s' "$label" "${PUSH_STATE_DETAIL:-}" "$run_url")"
    curl -sf -X POST "${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
      --data-urlencode "text=${text}" >/dev/null \
      || echo "::warning::push-state: private ops alert could not be sent"
  fi
fi
exit 1
```

- [ ] **Step 4: Run the test.** `npx vitest run tests/ci/push-state.test.ts`. Expected: 5 passed. (If `tests/ci/` is new, `vitest.config.ts:11` already collects `tests/**/*.test.ts`.)

- [ ] **Step 5: Commit.** `git add scripts/ci/push-state.sh tests/ci/push-state.test.ts && git commit -m "feat(ci): push-state.sh — retried state push with private ops alert"`

### Task 2: hourly-scan conflict resolution (N1 / F5)

**Files:** create `scripts/ci/resolve-rebase-conflicts.sh`, `scripts/ci/merge-json.mjs`, `tests/ci/resolve-rebase-conflicts.test.ts`; modify `.github/workflows/hourly-scan.yml:1032-1045`.

**Interfaces:**
- Produces: `bash scripts/ci/resolve-rebase-conflicts.sh <tracker-slug>`, run while a `git pull --rebase` is stopped on conflicts. Exit 0 means the rebase completed with the policy applied (Global Constraints). Exit 1 means it aborted because an unknown path conflicted.
- Produces: `node scripts/ci/merge-json.mjs <mode> <ours-file> <theirs-file> <out-file>`, `mode ∈ metrics-index | by-id | digests`. Exit 2 when either side is not a JSON array (the resolver then aborts instead of guessing).

- [ ] **Step 1: Write the failing test** `tests/ci/resolve-rebase-conflicts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const SCRIPT = resolve('scripts/ci/resolve-rebase-conflicts.sh');
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, s: string) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), s); };
const J = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const read = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const idx = (file: string, ts: string) => ({ file, timestamp: ts, status: 'success', trackerCount: 1, errorCount: 0, pipeline: 'hourly' });
const RECENT = new Date(Date.now() - 3600_000).toISOString();
const RECENT2 = new Date(Date.now() - 1800_000).toISOString();

/** base → main commits `mainFiles`, job commits `jobFiles`, then the job runs `git pull --rebase` and stops on conflicts. */
function conflicted(mainFiles: Record<string, string>, jobFiles: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'rrc-'));
  const origin = join(root, 'o.git'); git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  const a = join(root, 'a'); git(root, 'clone', '-q', origin, a);
  git(a, 'config', 'user.email', 'a@b'); git(a, 'config', 'user.name', 't');
  for (const f of new Set([...Object.keys(mainFiles), ...Object.keys(jobFiles)])) put(a, f, 'base\n');
  git(a, 'add', '.'); git(a, 'commit', '-qm', 'base'); git(a, 'push', '-q', 'origin', 'main');
  const job = join(root, 'job'); git(root, 'clone', '-q', origin, job);
  git(job, 'config', 'user.email', 'a@b'); git(job, 'config', 'user.name', 't');
  for (const [f, s] of Object.entries(mainFiles)) put(a, f, s);
  git(a, 'commit', '-qam', 'main'); git(a, 'push', '-q', 'origin', 'main');
  for (const [f, s] of Object.entries(jobFiles)) put(job, f, s);
  git(job, 'commit', '-qam', 'job');
  expect(spawnSync('git', ['pull', '--rebase', 'origin', 'main'], { cwd: job }).status).not.toBe(0);
  return job;
}

describe('resolve-rebase-conflicts.sh', () => {
  it('keeps BOTH sides of the metrics index, the events partition and the digests', () => {
    const EV = 'trackers/gaza-war/data/events/2026-09-24.json';
    const DG = 'trackers/gaza-war/data/digests.json';
    const job = conflicted(
      {
        'public/_metrics/index.json': J([idx('main-run.json', RECENT)]),
        [EV]: J([{ id: 'shared', title: 'old' }, { id: 'from-main' }]),
        [DG]: J([{ date: '2026-09-24', title: 'Nightly digest' }]),
        'public/_hourly/state.json': 'MAIN\n',
      },
      {
        'public/_metrics/index.json': J([idx('job-run.json', RECENT2)]),
        [EV]: J([{ id: 'shared', title: 'job re-verified' }, { id: 'from-job' }]),
        [DG]: J([{ date: '2026-09-24', title: 'Hourly digest' }]),
        'public/_hourly/state.json': 'JOB\n',
      },
    );
    const r = spawnSync('bash', [SCRIPT, 'gaza-war'], { cwd: job, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(read(job, 'public/_metrics/index.json').map((e: { file: string }) => e.file)).toEqual(['main-run.json', 'job-run.json']);
    expect(read(job, EV)).toEqual([{ id: 'shared', title: 'job re-verified' }, { id: 'from-main' }, { id: 'from-job' }]);
    expect(read(job, DG).map((d: { title: string }) => d.title).sort()).toEqual(['Hourly digest', 'Nightly digest']);
    expect(readFileSync(join(job, 'public/_hourly/state.json'), 'utf8')).toBe('MAIN\n');
    expect(git(job, 'status', '--porcelain')).toBe('');
    expect(git(job, 'log', '-1', '--format=%s').trim()).toBe('job');
  });

  it("takes the job's whole non-array tracker file, but says so", () => {
    const job = conflicted({ 'trackers/gaza-war/data/kpis.json': 'MAIN\n' }, { 'trackers/gaza-war/data/kpis.json': 'JOB\n' });
    const r = spawnSync('bash', [SCRIPT, 'gaza-war'], { cwd: job, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(readFileSync(join(job, 'trackers/gaza-war/data/kpis.json'), 'utf8')).toBe('JOB\n');
    expect(r.stdout).toContain("::warning::resolve-rebase-conflicts: took the job's whole trackers/gaza-war/data/kpis.json");
  });

  it('aborts on a conflict outside the policy and leaves the job commit intact', () => {
    const job = conflicted({ 'trackers/sudan-conflict/data/kpis.json': 'MAIN\n' }, { 'trackers/sudan-conflict/data/kpis.json': 'JOB\n' });
    const r = spawnSync('bash', [SCRIPT, 'gaza-war'], { cwd: job, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('trackers/sudan-conflict/data/kpis.json');
    expect(readFileSync(join(job, 'trackers/sudan-conflict/data/kpis.json'), 'utf8')).toBe('JOB\n');
    expect(git(job, 'log', '-1', '--format=%s')).toBe('job');
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/ci/resolve-rebase-conflicts.test.ts`. Expected: all three fail (the script is missing).

- [ ] **Step 3: Implement** `scripts/ci/merge-json.mjs`:

```js
#!/usr/bin/env node
// Structural unions for hourly-scan rebase conflicts, so neither side's entries
// are lost (a whole-file --ours/--theirs silently drops the other side).
//   metrics-index : key = file, sort by timestamp, drop entries older than 90 days
//   by-id         : key = id; main's order first, then the job's new ids; job wins on a shared id
//   digests       : key = date + '::' + title, sort by date descending
// Usage: merge-json.mjs <mode> <ours(main)> <theirs(job)> <out>. Exit 2 on non-array input.
import { readFileSync, writeFileSync } from 'node:fs';
const [mode, oursPath, theirsPath, outPath] = process.argv.slice(2);
const read = p => JSON.parse(readFileSync(p, 'utf8'));
let main, job;
try { main = read(oursPath); job = read(theirsPath); } catch (e) { console.error(`merge-json: ${e.message}`); process.exit(2); }
if (!Array.isArray(main) || !Array.isArray(job)) { console.error('merge-json: both sides must be JSON arrays'); process.exit(2); }
const keyOf = { 'metrics-index': e => e.file, 'by-id': e => e.id, digests: e => `${e.date}::${e.title}` }[mode];
if (!keyOf) { console.error(`merge-json: unknown mode ${mode}`); process.exit(2); }
const merged = new Map();
for (const e of main) merged.set(keyOf(e), e);
for (const e of job) merged.set(keyOf(e), e); // Map keeps first-insertion order; job's value wins
let out = [...merged.values()];
if (mode === 'metrics-index') {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  out = out.filter(e => e.timestamp >= cutoff).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}
if (mode === 'digests') out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
```

- [ ] **Step 4: Implement** `scripts/ci/resolve-rebase-conflicts.sh` (then `chmod +x`):

```bash
#!/usr/bin/env bash
# Conflict policy for hourly-scan's `git pull --rebase` (one local commit).
# During a rebase --ours is origin/main and --theirs is THIS job's commit
# (git-rebase(1)); the old inline block had them backwards and was dead code
# because `git rebase --continue --no-edit` is rejected (exit 129).
set -uo pipefail
tracker="${1:?usage: resolve-rebase-conflicts.sh <tracker-slug>}"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
abort() { echo "::error::resolve-rebase-conflicts: $1 — aborting"; git rebase --abort; exit 1; }
# Stage :2 = ours (origin/main), :3 = theirs (this job's commit).
union() {
  git show ":2:$2" > "$tmp/ours.json" && git show ":3:$2" > "$tmp/theirs.json" \
    && node "$here/merge-json.mjs" "$1" "$tmp/ours.json" "$tmp/theirs.json" "$2" \
    || abort "structural merge ($1) failed for $2"
}
# `while read` instead of `mapfile`: macOS ships bash 3.2, which has no mapfile.
while IFS= read -r f; do
  case "$f" in
    public/_metrics/index.json) union metrics-index "$f" ;;
    public/_metrics/*) git checkout --theirs -- "$f" ;;
    public/_hourly/state.json) git checkout --ours -- "$f" ;;
    "trackers/${tracker}/data/events/"*.json) union by-id "$f" ;;
    "trackers/${tracker}/data/digests.json") union digests "$f" ;;
    "trackers/${tracker}/"*)
      git checkout --theirs -- "$f"
      echo "::warning::resolve-rebase-conflicts: took the job's whole $f; main's concurrent edits to it are discarded" ;;
    *) abort "no policy for conflicted path $f" ;;
  esac
  git add -- "$f"
done < <(git diff --name-only --diff-filter=U)
GIT_EDITOR=true git rebase --continue
```

`abort` inside the `while` runs in the main shell (process substitution, not a pipe), so its `exit 1` ends the script.

- [ ] **Step 5: Run the test.** `npx vitest run tests/ci/resolve-rebase-conflicts.test.ts`. Expected: 3 passed.

- [ ] **Step 6: Wire it into `hourly-scan.yml`.** Replace lines 1033-1044 (from `echo "Rebase conflict on attempt $i — resolving..."` through `git rebase --continue --no-edit || git rebase --abort`) with:

```yaml
              echo "Rebase conflict on attempt $i — applying scripts/ci/resolve-rebase-conflicts.sh"
              bash scripts/ci/resolve-rebase-conflicts.sh "$TRACKER" || echo "::warning::conflict outside policy on attempt $i (rebase aborted)"
```

The surrounding 5-attempt loop (`:1026-1051`) stays unchanged. After a successful resolution, the next iteration's `git pull --rebase` is a no-op and `git push` runs.

- [ ] **Step 7: Lint the workflow.** `npx --yes @action-validator/cli .github/workflows/hourly-scan.yml`. If that package is unavailable offline, run `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/hourly-scan.yml'))"` instead. Expected: no error.

- [ ] **Step 8: Commit.** `git add scripts/ci/resolve-rebase-conflicts.sh scripts/ci/merge-json.mjs tests/ci/resolve-rebase-conflicts.test.ts .github/workflows/hourly-scan.yml && git commit -m "fix(hourly-scan): working rebase conflict policy — union metrics index, events and digests"`

- [ ] **Step 9: After the merge, verify the artefact and list what was lost.**
  1. Wait for the next scheduled run, then `gh run list --workflow hourly-scan.yml --limit 1 --json conclusion,databaseId`. Expected: `success`. Then `gh run view <id> --log | grep -c 'Failed to push hourly update'` must print `0`, and `gh run view <id> --log | grep -c 'Merge conflict in public/_metrics/index.json'` may be non-zero (the conflict still happens; it is now resolved).
  2. `git fetch origin && git log origin/main --since=<run start> --format=%s | grep -c 'chore(hourly): update'` must equal the number of `act` jobs that had changes.
  3. List the updates lost since 2026-09-23T02:27Z for the owner (PR comment): `for id in $(gh run list --workflow hourly-scan.yml --status failure --created '>=2026-09-23' --json databaseId -q '.[].databaseId'); do gh run view "$id" --log | grep -o 'Failed to push hourly update for [a-z0-9-]*'; done | sort | uniq -c`. There is no automatic replay: those trackers catch up through the next nightly `update-data` run, whose review manifest backfills gaps (window `min(max(days_since_last_run, 7), 30)`). The owner decides whether to dispatch `update-data.yml` for the affected slugs sooner.

### Task 2b: daily-video state pushes survive the dirty tree (PR-0)

**Files:** modify `.github/workflows/daily-video.yml` (`commit_social` `:193-218`, `commit_video_state` `:272-308`, progress `:534-553`); extend `tests/ci/workflow-publish-guards.test.ts` (created here; Task 4 adds more cases).

**Interfaces:** consumes `scripts/ci/push-state.sh` (Task 1).

Evidence: run `36090465310`, step "Commit social post record": `error: cannot pull with rebase: You have unstaged changes.` ×5. The step before it wrote tracked files that no step stages. The record still reached `main` only because "Commit tracker history + daily log" ran `git reset --hard HEAD` after its own first failure and then pushed both commits; the job ends red every day at "Fail job if a state commit/push failed".

- [ ] **Step 1: Name the dirty file (diagnostic, before changing anything).** Add a temporary first line `git status --porcelain` to `commit_social`, dispatch `gh workflow run daily-video.yml`, and read it: `gh run view <id> --log | grep -A10 'Commit social post record' | grep -E '^\S+\s+\S+\s+\S+Z [ MADRCU?]{2} '`. Expected candidates, from `video/render.ts:192-196` and the render step: `video/src/data/breaking-data-*.json` or `video/state/tracker-history.json`. Record the paths in the PR description. Remove the diagnostic line.
- [ ] **Step 2: Decide per path.** A render-time snapshot nobody needs on `main` → add it to `.gitignore` and `git rm --cached` it in this PR. A state file that must reach `main` (`video/state/*.json`) → it is already committed by `commit_video_state`; nothing to add. Whatever remains dirty is handled by `--autostash` in `push-state.sh`.
- [ ] **Step 3: Write the failing guard test** `tests/ci/workflow-publish-guards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const wf = (name: string) => readFileSync(`.github/workflows/${name}`, 'utf8');

describe('daily-video state pushes', () => {
  it('push through push-state.sh (autostash), never a bare pull --rebase loop', () => {
    const src = wf('daily-video.yml');
    expect(src).not.toMatch(/git pull --rebase origin main && git push/);
    expect((src.match(/bash scripts\/ci\/push-state\.sh/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 4: Run it.** `npx vitest run tests/ci/workflow-publish-guards.test.ts`. Expected: 1 failure.
- [ ] **Step 5: Rewire the three push loops.** In `commit_social` (`:204-217`), `commit_video_state` (`:290-302`) and the progress `Commit social post record` (`:547-551`), replace the loop with `bash scripts/ci/push-state.sh "<label>" 5` (labels `video-post-${DATE}`, `video-state`, `video-post-progress-${DATE}`). Add to each step's `env:` `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`, `TELEGRAM_CHANNEL_ID` from secrets.
- [ ] **Step 6: Run the test again.** Expected: pass. Then `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/daily-video.yml'))"`: no error.
- [ ] **Step 7: Commit.** `git add .github/workflows/daily-video.yml tests/ci/workflow-publish-guards.test.ts .gitignore && git commit -m "fix(daily-video): state pushes survive a dirty tree (push-state.sh --autostash)"`
- [ ] **Step 8: After the merge, verify.** The next 00:00 UTC run: `gh run list --workflow daily-video.yml --limit 1` must be `success`, its log must contain `push-state: video-post-<date> pushed on attempt 1`, and `git log origin/main -1 --format=%s -- public/_social/` must show the record for that date. Report to the owner that the record was never lost on 09-23..09-25 (only the job colour), so no channel duplicates came from this.

## PR-1 · Ops: no public re-send (f)

Branch `fix/no-public-resend`. The same principle applies to every task: *record "already published" durably before the publish counts as done, and check that record immediately before sending.* **Tasks 3 and the telegram-notify half of Task 4 are held until owner question 6 is answered** (the path has published nothing since 2026-08-09). If the owner retires it: delete `.github/workflows/telegram-notify.yml` and skip Task 3. If the owner re-wires it: first move the `saveManifest` part of `postBreaking` out of the disabled X step (a new step in `hourly-scan.yml` that runs `hourly-post.ts` with X disabled), then do Task 3 as written. Either way, add the freshness check in Task 4 Step 4c.

### Task 3: Telegram channel — tri-state outcome, save after every send (F2, F6) — HELD on Q6

**Files:** create `scripts/lib/telegram-send-loop.ts`, `scripts/lib/telegram-send-loop.test.ts`; modify `scripts/telegram-channel.ts:35-44` (types), `:93-151` (`sendTelegramMessage`), `:436-476` (loop).

**Interfaces:**
- Produces:
  ```ts
  export type SendOutcome =
    | { status: 'sent'; messageId: number }
    | { status: 'rejected'; httpStatus: number }
    | { status: 'unknown'; reason: string };
  export interface SentEntry { key: string; telegramMessageId: number | null; sentAt: string; uncertain?: true }
  export interface SentLog { entries: SentEntry[] }
  export function classifyTelegramResponse(httpStatus: number, body: unknown): SendOutcome;
  export async function sendPending<U>(deps: {
    updates: U[]; keyOf: (u: U) => string; send: (u: U) => Promise<SendOutcome>;
    log: SentLog; save: (log: SentLog) => void; now?: () => Date;
    sleep?: (ms: number) => Promise<void>; gapMs?: number;
  }): Promise<{ sent: number; rejected: number; unknown: number }>;
  ```
- Consumed by: `scripts/telegram-channel.ts` `main()`.

- [ ] **Step 1: Write the failing test** `scripts/lib/telegram-send-loop.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyTelegramResponse, sendPending, type SentLog, type SendOutcome } from './telegram-send-loop';

describe('classifyTelegramResponse', () => {
  it('2xx with a message id is sent', () => expect(classifyTelegramResponse(200, { ok: true, result: { message_id: 42 } })).toEqual({ status: 'sent', messageId: 42 }));
  it('4xx is rejected (Telegram did not publish)', () => expect(classifyTelegramResponse(400, { ok: false })).toEqual({ status: 'rejected', httpStatus: 400 }));
  it('5xx is unknown (it may have published)', () => expect(classifyTelegramResponse(502, null).status).toBe('unknown'));
  it('2xx without an id is unknown', () => expect(classifyTelegramResponse(200, { ok: true }).status).toBe('unknown'));
});

describe('sendPending', () => {
  const outcomes: SendOutcome[] = [
    { status: 'sent', messageId: 1 },
    { status: 'rejected', httpStatus: 400 },
    { status: 'unknown', reason: 'ETIMEDOUT' },
  ];

  it('saves after every send, keeps rejected out and marks unknown as uncertain', async () => {
    const log: SentLog = { entries: [] };
    const snapshots: number[] = [];
    let i = 0;
    const res = await sendPending({
      updates: ['a', 'b', 'c'], keyOf: u => u, send: async () => outcomes[i++],
      log, save: l => snapshots.push(l.entries.length), now: () => new Date('2026-09-24T10:00:00Z'), sleep: async () => {}, gapMs: 0,
    });
    expect(res).toEqual({ sent: 1, rejected: 1, unknown: 1 });
    expect(log.entries).toEqual([
      { key: 'a', telegramMessageId: 1, sentAt: '2026-09-24T10:00:00.000Z' },
      { key: 'c', telegramMessageId: null, sentAt: '2026-09-24T10:00:00.000Z', uncertain: true },
    ]);
    expect(snapshots).toEqual([1, 1, 2]); // one save per attempt, the first one right after the first publish
  });

  it('a crash mid-batch keeps what was already published on disk', async () => {
    const log: SentLog = { entries: [] };
    const saved: string[][] = [];
    await expect(sendPending({
      updates: ['a', 'b'], keyOf: u => u,
      send: async u => { if (u === 'b') throw new Error('boom'); return { status: 'sent', messageId: 7 }; },
      log, save: l => saved.push(l.entries.map(e => e.key)), sleep: async () => {}, gapMs: 0,
    })).rejects.toThrow('boom');
    expect(saved.at(-1)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run scripts/lib/telegram-send-loop.test.ts`. Expected: fails with a module-not-found error.

- [ ] **Step 3: Implement** `scripts/lib/telegram-send-loop.ts`:

```ts
/**
 * Publish loop for the PUBLIC Telegram channel. Two rules (spec §6 F2/F6):
 * the sent-log is saved after every attempt, so a crash or timeout never
 * forgets a message that is already public; and only a definite rejection
 * (HTTP 4xx) stays out of the log — an ambiguous failure may have published,
 * so it is logged as `uncertain` and never retried automatically.
 */
export type SendOutcome =
  | { status: 'sent'; messageId: number }
  | { status: 'rejected'; httpStatus: number }
  | { status: 'unknown'; reason: string };
export interface SentEntry { key: string; telegramMessageId: number | null; sentAt: string; uncertain?: true }
export interface SentLog { entries: SentEntry[] }

export function classifyTelegramResponse(httpStatus: number, body: unknown): SendOutcome {
  if (httpStatus >= 400 && httpStatus < 500) return { status: 'rejected', httpStatus };
  if (httpStatus >= 500) return { status: 'unknown', reason: `HTTP ${httpStatus}` };
  const id = (body as { result?: { message_id?: unknown } } | null)?.result?.message_id;
  return typeof id === 'number' ? { status: 'sent', messageId: id } : { status: 'unknown', reason: `HTTP ${httpStatus} without message_id` };
}

export async function sendPending<U>(deps: {
  updates: U[]; keyOf: (u: U) => string; send: (u: U) => Promise<SendOutcome>;
  log: SentLog; save: (log: SentLog) => void; now?: () => Date;
  sleep?: (ms: number) => Promise<void>; gapMs?: number;
}): Promise<{ sent: number; rejected: number; unknown: number }> {
  const { updates, keyOf, send, log, save, now = () => new Date(), sleep = ms => new Promise(r => setTimeout(r, ms)), gapMs = 1000 } = deps;
  const tally = { sent: 0, rejected: 0, unknown: 0 };
  for (let i = 0; i < updates.length; i++) {
    const outcome = await send(updates[i]);
    tally[outcome.status]++;
    if (outcome.status !== 'rejected') {
      log.entries.push({
        key: keyOf(updates[i]),
        telegramMessageId: outcome.status === 'sent' ? outcome.messageId : null,
        sentAt: now().toISOString(),
        ...(outcome.status === 'unknown' ? { uncertain: true as const } : {}),
      });
    }
    save(log);
    if (i < updates.length - 1) await sleep(gapMs);
  }
  return tally;
}
```

- [ ] **Step 4: Run the test.** `npx vitest run scripts/lib/telegram-send-loop.test.ts`. Expected: 6 passed.

- [ ] **Step 5: Rewire `scripts/telegram-channel.ts`.**
  1. Delete the local `TelegramSentLog`/`TelegramSentEntry` interfaces (`:35-44`). Add `import { classifyTelegramResponse, sendPending, type SendOutcome, type SentLog as TelegramSentLog } from './lib/telegram-send-loop.js';`.
  2. Change `sendTelegramMessage` (`:93-151`) to return `Promise<SendOutcome>`. In the photo branch: `const photo = classifyTelegramResponse(photoRes.status, await photoRes.json().catch(() => null)); if (photo.status !== 'rejected') return photo;` so only a definite 4xx falls back to text. A photo 5xx or a thrown fetch returns `unknown` and sends nothing else (it may already be public). Add a unit test in `scripts/lib/telegram-send-loop.test.ts` against an exported `sendTelegramMessage(text, photoUrl, { fetchFn })` with a fake fetch: photo `502` → result `unknown` and **zero** `sendMessage` calls; photo `400` → exactly one `sendMessage` call. In the text branch, return `classifyTelegramResponse(res.status, res.ok ? await res.json() : null)` after logging the error body when `!res.ok`. In `catch`, return `{ status: 'unknown', reason: String(err) }`.
  3. Replace the `for (const update of toSend) { … }` loop plus the trailing `saveSentLog(sentLog)` (`:436-476`) with:

```ts
  const tally = await sendPending({
    updates: toSend,
    keyOf: makeEntryKey,
    log: sentLog,
    save: saveSentLog,
    send: async (update) => {
      const slug = update.tracker;
      const message = formatTelegramMessage(update, loadTrackerConfig(slug), loadTrackerMeta(slug), loadTrackerKpis(slug), loadTrackerDigests(slug));
      console.log(`[telegram] Posting for ${slug}...`);
      const outcome = await sendTelegramMessage(message, getTrackerThumbnail(slug) ?? undefined);
      if (outcome.status === 'sent') console.log(`[telegram] ✓ Sent for ${slug} (message_id: ${outcome.messageId})`);
      else if (outcome.status === 'rejected') console.warn(`::warning::[telegram] rejected for ${slug} (HTTP ${outcome.httpStatus}) — will retry next run`);
      else console.warn(`::warning::[telegram] uncertain for ${slug} (${outcome.reason}) — logged as sent, check the channel`);
      return outcome;
    },
  });
  console.log(`[telegram] Done — ${tally.sent} sent, ${tally.rejected} rejected, ${tally.unknown} uncertain of ${toSend.length}`);
```

  4. `sentToday` (`:421-423`) counts entries by `sentAt` and so includes uncertain ones. That is intended: the daily cap counts anything that may be public.
  5. Private follow-up (owner question 7 may change this): after `sendPending`, if `tally.unknown > 0`, send one `sendMessage` to `TELEGRAM_ALERT_CHAT_ID` (refusing when it equals `TELEGRAM_CHANNEL_ID`) listing the uncertain keys. Add `rejectedAttempts?: Record<string, number>` to `SentLog`; `sendPending` increments it on `rejected`, and when a key reaches 3 it logs the entry with `telegramMessageId: null, terminal: true` and includes it in the same private alert, so a permanent 400/403 stops retrying and a human hears about it. The `rejected` branch of `sendPending` becomes:
     ```ts
     if (outcome.status === 'rejected') {
       const k = keyOf(updates[i]);
       log.rejectedAttempts ??= {};
       const n = (log.rejectedAttempts[k] ?? 0) + 1;
       log.rejectedAttempts[k] = n;
       if (n >= 3) log.entries.push({ key: k, telegramMessageId: null, sentAt: now().toISOString(), terminal: true });
     }
     ```
     with `SentEntry` gaining `terminal?: true`. Test: three runs that each return `rejected` for key `a` leave exactly one entry `{ key: 'a', terminal: true }` and a fourth run does not call `send`.

- [ ] **Step 6: Type-check the touched files.** `npx tsc --noEmit -p . 2>&1 | grep -E 'scripts/(telegram-channel|lib/telegram-send-loop)'`. Expected: no output.

- [ ] **Step 7: Dry smoke.** `TELEGRAM_BOT_TOKEN= npx tsx scripts/telegram-channel.ts; echo $?`. Expected: the existing "missing token" error path, exit 1, and no network call.

- [ ] **Step 8: Commit.** `git add scripts/lib/telegram-send-loop.ts scripts/lib/telegram-send-loop.test.ts scripts/telegram-channel.ts && git commit -m "fix(telegram): save sent-log after each post; never log rejected sends, never re-send uncertain ones"`

### Task 4: `telegram-notify.yml` and `light-scan.yml` — no cancellation mid-publish, robust push (F1, F3a)

**Files:** modify `.github/workflows/telegram-notify.yml:16-18, :85-110`; `.github/workflows/light-scan.yml:8-10, :26-30, :61-72`.

**Interfaces:** Consumes `scripts/ci/push-state.sh` (Task 1).

The `telegram-notify.yml` parts of this task (the first loop entry below, Step 3) are **held on owner question 6**; if the path is retired, drop `'telegram-notify.yml'` from both lists in the test. The `light-scan.yml` and `post-social-queue.yml` parts proceed.

- [ ] **Step 1: Extend the guard test** `tests/ci/workflow-publish-guards.test.ts` (created in Task 2b). The workflows cannot run under vitest, so this test pins the properties that matter. Append:

```ts
describe('workflows that publish to public channels', () => {
  for (const name of ['light-scan.yml', 'post-social-queue.yml', 'daily-video.yml']) {
    it(`${name} checks out the live branch tip, not the run's original SHA (a re-run reuses GITHUB_SHA)`, () => {
      const checkouts = wf(name).match(/uses: actions\/checkout@v\d+(\n\s+with:\n(\s+\w+: [^\n]+\n)+)?/g) ?? [];
      expect(checkouts.length).toBeGreaterThan(0);
      for (const c of checkouts) expect(c).toMatch(/ref: main/);
    });
  }
  for (const name of ['telegram-notify.yml', 'light-scan.yml']) {
    it(`${name} never cancels a run in progress (it may already have published)`, () => {
      expect(wf(name)).toMatch(/concurrency:\s*\n\s*group: [^\n]+\n\s*cancel-in-progress: false/);
    });
  }
  for (const name of ['telegram-notify.yml', 'light-scan.yml', 'post-social-queue.yml']) {
    it(`${name} pushes its state through scripts/ci/push-state.sh`, () => {
      expect(wf(name)).toContain('bash scripts/ci/push-state.sh');
      expect(wf(name)).toContain('TELEGRAM_ALERT_CHAT_ID: ${{ secrets.TELEGRAM_ALERT_CHAT_ID }}');
    });
  }
  it('daily-video.yml never posts to Telegram with a bare curl', () => {
    expect(wf('daily-video.yml')).not.toMatch(/curl[^\n]*sendVideo/);
  });
  it('hourly-scan.yml does not use the rejected --no-edit flag', () => {
    expect(wf('hourly-scan.yml')).not.toContain('rebase --continue --no-edit');
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/ci/workflow-publish-guards.test.ts`. Expected: the three `ref: main` tests, the `telegram-notify`/`light-scan` cancellation tests, the push-state tests for `telegram-notify` and `light-scan` and `post-social-queue`, and the daily-video `sendVideo` test fail. The hourly-scan test and the Task 2b test pass (PR-0 is merged).

- [ ] **Step 3: Edit `telegram-notify.yml`.**
  - `:18` → `cancel-in-progress: false`. Put this comment on the line **above `concurrency:`**, not between `group:` and `cancel-in-progress:`, because the guard regex expects those two lines to be adjacent: `# Never cancel: a cancelled run may already have posted to the public channel but not yet pushed telegram-sent.json; the next run would post again. concurrency queues one pending run.`
  - Replace the `Commit sent log` step body (`:86-110`) with:

```yaml
      - name: Commit sent log
        if: steps.check.outputs.has_updates == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_ALERT_CHAT_ID: ${{ secrets.TELEGRAM_ALERT_CHAT_ID }}
          TELEGRAM_CHANNEL_ID: ${{ secrets.TELEGRAM_CHANNEL_ID }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git"
          git add public/_hourly/telegram-sent.json || true
          if git diff --cached --quiet; then
            echo "No changes to commit"
            exit 0
          fi
          git commit -m "chore(telegram): update sent log $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          export PUSH_STATE_DETAIL="$(git show -p --format= HEAD -- public/_hourly/telegram-sent.json | grep '^+.*"key"' | head -20)"
          bash scripts/ci/push-state.sh telegram-sent.json 5
```

  - Also make the "Send Telegram notifications" step (`:78-83`) run the sent-log commit even when the send step fails half-way: add `id: send` to it, and change the commit step's `if:` to `if: always() && steps.check.outputs.has_updates == 'true'`. This works because `sendPending` saves after every message.

- [ ] **Step 4: Edit `light-scan.yml`.**
  - `:10` → `cancel-in-progress: false`, with the same comment adapted ("may already have alerted the public channel but not yet pushed state.alerted").
  - `:20` → `- uses: actions/checkout@v5` followed by `with:` / `ref: main`, so a re-run sees the `state.alerted` an earlier attempt pushed.
  - Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` and `TELEGRAM_CHANNEL_ID` (from secrets) to the commit step's `env:`, and `if: always()` to that step. Give the `Run light scan` step `id: scan`. Wrap the existing "alerts.json was not staged" guard (`:58-59`) in `if [ "${{ steps.scan.outcome }}" = "success" ]; then … fi`. Rationale (corrected): today `saveState` runs only at `hourly-light-scan.ts:462`, after the posting loop (`:385-386`) and after the alerts.json write (`:458-459`), so a crash after an alert leaves nothing new on disk and `if: always()` alone would push nothing. Task 4b makes the scan save `state.json` right after each alert; only with that change does `if: always()` carry the alert record to `main`, and then the alerts.json guard must not block it on a crashed scan.
  - Timeouts: `timeout-minutes: 5` (`:18`) is a job timeout, which cancels the job. `always()` steps are scheduled after a cancellation, but they share the cancelled job's short grace period, so the commit step is not guaranteed to finish. Move the timeout to the `Run light scan` step (`timeout-minutes: 4` on the step, keep 5 on the job) so a slow scan fails its own step and the commit step still gets a full minute. Task 4b's per-alert save makes that commit meaningful.
  - Replace the push loop (`:61-72`) with:

```yaml
            export PUSH_STATE_DETAIL="light-scan state.alerted — $(git show --stat --format= HEAD | tail -1)"
            bash scripts/ci/push-state.sh light-scan-state 5
```

- [ ] **Step 4c: Manifest freshness check (applies whatever Q6 decides, unless the workflow is deleted).** In `telegram-notify.yml`, before the send step, add:

```yaml
      - name: Warn when the update manifest is stale
        run: |
          d=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('public/_hourly/today-updates.json','utf8')).date||'')}catch{console.log('')}")
          age=$(( ( $(date -u +%s) - $(date -u -d "${d:-1970-01-01}" +%s) ) / 86400 ))
          if [ "$age" -gt 2 ]; then
            echo "::warning::today-updates.json is ${age} days old (date=${d:-none}) — nothing writes it, so nothing is announced on the channel"
          fi
```

  Add a case to the guard test: `expect(wf('telegram-notify.yml')).toContain('today-updates.json is ${age} days old')`.

- [ ] **Step 5: Edit `post-social-queue.yml`.** Change `:26` to `actions/checkout@v5` with `with: ref: main`. In the `Commit and push` step, add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` and `TELEGRAM_CHANNEL_ID` to `env:`, add `if: always()` to the step, and replace `:54-66` with:

```yaml
          export PUSH_STATE_DETAIL="Bluesky queue/history/budget $(date -u +%F) — posted entries will be re-found by the feed dedupe, but check the account"
          bash scripts/ci/push-state.sh social-queue 5
```

- [ ] **Step 6: Run the guard test again.** `npx vitest run tests/ci/workflow-publish-guards.test.ts`. Expected: everything passes except the `daily-video.yml` test, which Task 6 fixes.

- [ ] **Step 7: Commit.** `git add .github/workflows/telegram-notify.yml .github/workflows/light-scan.yml .github/workflows/post-social-queue.yml tests/ci/workflow-publish-guards.test.ts && git commit -m "fix(ci): never cancel public publishers mid-run; push state via push-state.sh"`

### Task 4b: light scan saves `state.json` right after each public alert (F2 for the live publisher)

**Files:** modify `scripts/hourly-light-scan.ts:260-266` (retry loop), `:385-386` (main loop); create `scripts/hourly-light-scan.test.ts`.

**Interfaces:** new exported pure helper in `scripts/hourly-light-scan.ts`:
```ts
export async function alertAndRecord(
  state: HourlyState, cand: { title: string; url: string; score: number; tracker: string; topicKey: string },
  deps: { post: (title: string, url: string, score: number, tracker: string) => Promise<boolean>; save: (s: HourlyState) => void; now?: () => Date },
): Promise<boolean>;
```
It posts, and on success pushes to `state.alerted` **and calls `save(state)` before returning**.

- [ ] **Step 1: Write the failing test** `scripts/hourly-light-scan.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { alertAndRecord } from './hourly-light-scan';

const empty = () => ({ seen: [], alerted: [], telegramFailed: [] }) as never;

describe('alertAndRecord', () => {
  it('writes the alert to disk before anything else can crash', async () => {
    const state = empty() as { alerted: unknown[] };
    const saved: number[] = [];
    const ok = await alertAndRecord(state as never, { title: 't', url: 'u', score: 0.9, tracker: 'gaza-war', topicKey: 'k' },
      { post: async () => true, save: s => saved.push((s as { alerted: unknown[] }).alerted.length), now: () => new Date('2026-09-24T00:00:00Z') });
    expect(ok).toBe(true);
    expect(saved).toEqual([1]);
    expect(state.alerted).toEqual([{ tracker: 'gaza-war', topicKey: 'k', ts: '2026-09-24T00:00:00.000Z' }]);
  });
  it('does not record or save a failed post', async () => {
    const state = empty() as { alerted: unknown[] };
    const save = vi.fn();
    expect(await alertAndRecord(state as never, { title: 't', url: 'u', score: 0.9, tracker: 'x', topicKey: 'k' }, { post: async () => false, save })).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(state.alerted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run scripts/hourly-light-scan.test.ts`. Expected: `alertAndRecord is not a function`. Importing is safe: the module already has a direct-run guard (last lines of `hourly-light-scan.ts`), which `tests/hourly-topic-dedup.test.ts` relies on.
- [ ] **Step 3: Implement** in `scripts/hourly-light-scan.ts`:

```ts
export async function alertAndRecord(state: HourlyState, cand: { title: string; url: string; score: number; tracker: string; topicKey: string },
  deps: { post: (title: string, url: string, score: number, tracker: string) => Promise<boolean>; save: (s: HourlyState) => void; now?: () => Date }): Promise<boolean> {
  const ok = await deps.post(cand.title, cand.url, cand.score, cand.tracker);
  if (!ok) return false;
  (state.alerted ??= []).push({ tracker: cand.tracker, topicKey: cand.topicKey, ts: (deps.now ?? (() => new Date()))().toISOString() });
  deps.save(state); // durable before the next post, the triage I/O or the alerts.json write can fail
  return true;
}
```

  Replace `:385-386` with `tgOk = await alertAndRecord(state, { title: cand.title, url: cand.url, score: bestScore, tracker: bestSlug, topicKey: key }, { post: postTelegram, save: saveState });`. In the retry loop (`:260-266`), call `saveState(state)` after each `ok` retry, once `state.telegramFailed` has been updated for that entry, so a retried alert is never re-sent. Keep the final `saveState(state)` at `:462`.
- [ ] **Step 4: Run it.** `npx vitest run scripts/hourly-light-scan.test.ts` → 2 passed. `npx tsc --noEmit -p . 2>&1 | grep hourly-light-scan` → no new errors.
- [ ] **Step 5: Commit.** `git add scripts/hourly-light-scan.ts scripts/hourly-light-scan.test.ts && git commit -m "fix(light-scan): persist state.alerted right after each public alert"`

### Task 5: Bluesky queue — check own feed before posting, persist after each post (F2, F3c)

**Files:** create `scripts/lib/bluesky-feed-dedupe.ts`, `scripts/lib/bluesky-feed-dedupe.test.ts`, `scripts/bluesky-post.test.ts`; modify `scripts/bluesky-post.ts:393` (`postFromQueue`), `:440-441`, `:448`, `:524`, `:572`, `:589-592`, `:717-720`.

**Interfaces:**
- Produces:
  ```ts
  // scripts/lib/bluesky-feed-dedupe.ts
  export interface FeedAgentLike { getAuthorFeed(p: { actor: string; limit: number }): Promise<{ data: { feed: Array<{ post: { uri: string; record: unknown } }> } }> }
  export function postKey(text: string): string;
  export async function recentOwnPostIndex(agent: FeedAgentLike, actor: string, nowMs: number, windowMs: number): Promise<Map<string, string>>; // postKey → uri
  // scripts/bluesky-post.ts
  export async function postFromQueue(dryRun: boolean, deps?: { getAgent?: () => Promise<BskyAgent | null> }): Promise<void>;
  ```

- [ ] **Step 1: Write the failing dedupe test** `scripts/lib/bluesky-feed-dedupe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { postKey, recentOwnPostIndex, type FeedAgentLike } from './bluesky-feed-dedupe';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const agent = (feed: Array<{ uri: string; text: string; createdAt: string }>): FeedAgentLike => ({
  getAuthorFeed: async () => ({ data: { feed: feed.map(f => ({ post: { uri: f.uri, record: { text: f.text, createdAt: f.createdAt } } })) } }),
});

describe('postKey', () => {
  it('collapses whitespace, lower-cases and cuts at 120 chars', () => {
    expect(postKey('  🔴 Gaza   War\n\nDetails ')).toBe('🔴 gaza war details');
    expect(postKey('x'.repeat(300))).toHaveLength(120);
  });
});

describe('recentOwnPostIndex', () => {
  it('indexes posts inside the window only', async () => {
    const idx = await recentOwnPostIndex(agent([
      { uri: 'at://1', text: 'Fresh post', createdAt: '2026-09-24T08:00:00Z' },
      { uri: 'at://2', text: 'Old post', createdAt: '2026-09-22T08:00:00Z' },
    ]), 'did:plc:bot', NOW, 24 * 3600_000);
    expect(idx.get(postKey('Fresh post'))).toBe('at://1');
    expect(idx.has(postKey('Old post'))).toBe(false);
  });
  it('returns an empty index when the feed call fails (it never blocks posting)', async () => {
    const failing: FeedAgentLike = { getAuthorFeed: async () => { throw new Error('503'); } };
    expect((await recentOwnPostIndex(failing, 'did:plc:bot', NOW, 24 * 3600_000)).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run scripts/lib/bluesky-feed-dedupe.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement** `scripts/lib/bluesky-feed-dedupe.ts`:

```ts
/**
 * Bluesky has a readable author feed, so the platform itself is the record of
 * truth for "did we already post this?" — it survives a failed git push of
 * queue-*.json, which the file-based state does not (spec §6 F3c).
 */
export interface FeedAgentLike { getAuthorFeed(p: { actor: string; limit: number }): Promise<{ data: { feed: Array<{ post: { uri: string; record: unknown } }> } }> }

export function postKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
}

export async function recentOwnPostIndex(agent: FeedAgentLike, actor: string, nowMs: number, windowMs: number): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  try {
    const res = await agent.getAuthorFeed({ actor, limit: 50 });
    for (const { post } of res.data.feed) {
      const rec = post.record as { text?: unknown; createdAt?: unknown };
      if (typeof rec?.text !== 'string' || typeof rec.createdAt !== 'string') continue;
      if (nowMs - Date.parse(rec.createdAt) > windowMs) continue;
      index.set(postKey(rec.text), post.uri);
    }
  } catch (err) {
    console.warn(`::warning::[bluesky] own-feed dedupe unavailable (${(err as Error).message}) — posting without it`);
  }
  return index;
}
```

- [ ] **Step 4: Run it.** `npx vitest run scripts/lib/bluesky-feed-dedupe.test.ts`. Expected: 3 passed.

- [ ] **Step 5: Write the failing integration test** `scripts/bluesky-post.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ queue: [] as any[], saves: [] as string[][] }));
vi.mock('./social-types.js', () => ({
  todayDateString: () => '2026-09-24',
  loadConfig: () => ({}),
  loadBudget: () => ({ monthlyTarget: 1, currentMonth: '2026-09', spent: 0, tweetsPosted: 0, remaining: 1 }),
  loadHistory: () => [],
  loadQueue: () => store.queue,
  saveQueue: (_d: string, q: any[]) => { store.saves.push(q.filter(e => e.status === 'posted').map(e => e.id)); },
  saveBudget: () => {},
  saveHistory: () => {},
}));
import { postFromQueue } from './bluesky-post';

const entry = (id: string, text: string) => ({
  id, type: 'digest', voice: 'analyst', tracker: 'gaza-war', lang: 'en', text, hashtags: [], link: 'https://watchboard.dev/gaza-war/',
  image: null, memegenUrl: null, publishAt: '2026-09-24T00:00:00Z', status: 'approved', estimatedCost: 0.01, judge: {}, threadTweets: null, tweetId: null, postedAt: null,
});

describe('postFromQueue', () => {
  beforeEach(() => { store.saves = []; });

  it('persists after each post, so a crash on the 2nd keeps the 1st recorded', async () => {
    store.queue = [entry('a', 'First headline\nbody'), entry('b', 'Second headline\nbody')];
    let calls = 0;
    const agent: any = {
      session: { did: 'did:plc:bot' },
      getAuthorFeed: async () => ({ data: { feed: [] } }),
      post: async () => { calls++; if (calls === 2) throw new Error('network'); return { uri: `at://${calls}`, cid: 'c' }; },
    };
    await postFromQueue(false, { getAgent: async () => agent, sleep: async () => {} });
    expect(store.saves[0]).toEqual(['a']);
    expect(store.queue[0].tweetId).toBe('at://1');
    expect(store.queue[1].status).toBe('approved');
  });

  it('does not re-post an entry already on its own feed; marks it posted with that uri', async () => {
    store.queue = [entry('a', 'First headline\nbody')];
    const posted: unknown[] = [];
    const agent: any = { session: { did: 'did:plc:bot' }, post: async (r: unknown) => { posted.push(r); return { uri: 'at://new', cid: 'c' }; }, getAuthorFeed: async () => ({ data: { feed: [] } }) };
    // First run publishes and captures the exact text that went out.
    await postFromQueue(false, { getAgent: async () => agent, sleep: async () => {} });
    const sentText = (posted[0] as { text: string }).text;
    // Simulate the failed push: the queue on disk is the pre-run one, the feed already has the post.
    store.queue = [entry('a', 'First headline\nbody')];
    posted.length = 0;
    agent.getAuthorFeed = async () => ({ data: { feed: [{ post: { uri: 'at://new', record: { text: sentText, createdAt: new Date().toISOString() } } }] } });
    await postFromQueue(false, { getAgent: async () => agent, sleep: async () => {} });
    expect(posted).toHaveLength(0);
    expect(store.queue[0]).toMatchObject({ status: 'posted', tweetId: 'at://new' });
  });
});
```

- [ ] **Step 6: Run it and watch it fail.** `npx vitest run scripts/bluesky-post.test.ts`. Expected: failure. Importing the module runs `main()` (`:717`), and `postFromQueue` is not exported.

- [ ] **Step 7: Implement in `scripts/bluesky-post.ts`.**
  1. Replace `main().catch(…)` (`:717-720`) with a direct-run guard, following `check-source-tiers.ts:125`: `import { pathToFileURL } from 'url';` and `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { main().catch(err => { console.error('[bluesky] Fatal error:', err); process.exit(1); }); }`.
  2. Change the signature to `export async function postFromQueue(dryRun: boolean, deps: { getAgent?: () => Promise<BskyAgent | null>; sleep?: (ms: number) => Promise<void> } = {}): Promise<void>`. Replace `getBlueskyAgent()` (`:448`) with `(deps.getAgent ?? getBlueskyAgent)()`, and the two `sleep(...)` calls inside the loop with `(deps.sleep ?? sleep)(...)`.
  3. After `if (!agent) return;`, add:
     ```ts
     const persist = () => { saveQueue(today, queue); saveBudget(budget); saveHistory(history); };
     const feedIndex = await recentOwnPostIndex(agent as unknown as FeedAgentLike, agent.session?.did ?? '', Date.now(), 24 * 3600_000);
     const firstPostText = (entry: QueueEntry, emoji: string) => entry.threadTweets && entry.threadTweets.length > 0
       ? truncateToGraphemes(entry.threadTweets.length === 1 ? `${entry.threadTweets[0]}\n\n🔗 ${entry.link}` : entry.threadTweets[0], BLUESKY_MAX_GRAPHEMES)
       : formatBlueskyPost(entry.text.split('\n')[0], entry.text, entry.link, emoji);
     ```
  4. At the top of the `for (const entry of due)` `try` block, after `const emoji = …`:
     ```ts
     const existing = feedIndex.get(postKey(firstPostText(entry, emoji)));
     if (existing) {
       entry.tweetId = existing; entry.status = 'posted'; entry.postedAt = new Date().toISOString();
       console.log(`::notice::[bluesky] ${entry.tracker}/${entry.type}/${entry.lang} already on the feed (${existing}) — marked posted, not re-posted`);
       persist();
       continue;
     }
     ```
     Leave the budget and history alone: that post was counted, or not, by the run that published it, and counting it here would double-charge.
  5. Directly after each of the two `posted++;` lines (`:524` thread branch, `:572` single branch), add `persist();`.
  6. Keep the final save (`:589-592`) as it is. It still covers the no-post case.

- [ ] **Step 8: Run both test files.** `npx vitest run scripts/bluesky-post.test.ts scripts/lib/bluesky-feed-dedupe.test.ts`. Expected: 5 passed. If `RichText.detectFacets` tries to call the fake agent, add `resolveHandle: async () => ({ data: { did: 'did:plc:x' } })` to the fake. The test texts contain no `@mentions`, so this should not be needed.

- [ ] **Step 9: Confirm the CLI still runs.** `npx tsx scripts/bluesky-post.ts --dry-run; echo $?`. Expected: prints `No queue for …` or the dry-run list, then exit 0. This proves the direct-run guard fires under `tsx`.

- [ ] **Step 10: Type-check.** `npx tsc --noEmit -p . 2>&1 | grep -E 'scripts/(bluesky-post|lib/bluesky-feed-dedupe)'`. Expected: no new errors compared with `origin/main`.

- [ ] **Step 11: Commit.** `git add scripts/lib/bluesky-feed-dedupe.ts scripts/lib/bluesky-feed-dedupe.test.ts scripts/bluesky-post.ts scripts/bluesky-post.test.ts && git commit -m "fix(bluesky): dedupe against own feed and persist queue after each post"`

### Task 6: Daily video — idempotent Telegram post, checked response, retried push (F4, N2)

**Files:** create `scripts/lib/telegram-video.ts`, `scripts/lib/telegram-video.test.ts`, `scripts/telegram-video-post.ts`; modify `scripts/post-video-social.ts:503-504`, `.github/workflows/daily-video.yml` (steps at `:175-218`, `:330-368`, `:516-553`, `:564-604`).

**Interfaces:**
- Produces:
  ```ts
  // scripts/lib/telegram-video.ts
  export interface PostedEntry { url: string; postedAt: string; uncertain?: true }
  export interface VideoRecordLike { date: string; posted: Record<string, PostedEntry>; [k: string]: unknown }
  export async function postVideoOnce(deps: {
    recordPath: string; date: string; videoPath: string; caption: string; chatId: string; token: string;
    fetchFn?: typeof fetch; readFile?: (p: string) => Buffer; now?: () => Date;
    loadRecord?: (p: string) => VideoRecordLike | null; saveRecord?: (p: string, r: VideoRecordLike) => void;
  }): Promise<'skipped' | 'sent' | 'rejected' | 'unknown'>;
  ```
- CLI: `npx tsx scripts/telegram-video-post.ts <video> --record <path> --caption-file <path>`. It reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID`. Exit 0 on `skipped`, `sent` or `unknown` (unknown prints `::warning::`), and 1 on `rejected`.
- Consumes: `classifyTelegramResponse` from Task 3.

- [ ] **Step 1: Write the failing test** `scripts/lib/telegram-video.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { postVideoOnce, type VideoRecordLike } from './telegram-video';

function harness(initial: VideoRecordLike | null, response: { status: number; body: unknown } | Error) {
  let record = initial;
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(String(url));
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as unknown as typeof fetch;
  const run = () => postVideoOnce({
    recordPath: 'rec.json', date: '2026-09-24', videoPath: 'v.mp4', caption: 'cap', chatId: '-100public', token: 'T',
    fetchFn, readFile: () => Buffer.from('mp4'), now: () => new Date('2026-09-24T00:05:00Z'),
    loadRecord: () => record, saveRecord: (_p, r) => { record = r; },
  });
  return { run, calls, get record() { return record; } };
}

describe('postVideoOnce', () => {
  it('sends once, records it, and skips on a re-run', async () => {
    const h = harness({ date: '2026-09-24', posted: { bluesky: { url: 'b', postedAt: 'x' } }, caption_en: 'keep' }, { status: 200, body: { ok: true, result: { message_id: 9 } } });
    expect(await h.run()).toBe('sent');
    expect(h.record!.posted.telegram).toEqual({ url: 'telegram:message/9', postedAt: '2026-09-24T00:05:00.000Z' });
    expect(h.record!.caption_en).toBe('keep');
    expect(await h.run()).toBe('skipped');
    expect(h.calls).toHaveLength(1);
  });
  it('a 4xx is rejected and not recorded', async () => {
    const h = harness(null, { status: 400, body: { ok: false, description: 'Bad Request' } });
    expect(await h.run()).toBe('rejected');
    expect(h.record?.posted.telegram).toBeUndefined();
  });
  it('a network error is recorded as uncertain so a re-run does not post again', async () => {
    const h = harness(null, new Error('ETIMEDOUT'));
    expect(await h.run()).toBe('unknown');
    expect(h.record!.posted.telegram).toMatchObject({ uncertain: true });
    expect(await h.run()).toBe('skipped');
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run scripts/lib/telegram-video.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement** `scripts/lib/telegram-video.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { classifyTelegramResponse } from './telegram-send-loop.js';

export interface PostedEntry { url: string; postedAt: string; uncertain?: true }
export interface VideoRecordLike { date: string; posted: Record<string, PostedEntry>; [k: string]: unknown }

const defaultLoad = (p: string): VideoRecordLike | null => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const defaultSave = (p: string, r: VideoRecordLike) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(r, null, 2), 'utf8'); };

/** Posts the daily video to the public channel at most once per record (same file post-video-social.ts uses for Bluesky). */
export async function postVideoOnce(deps: {
  recordPath: string; date: string; videoPath: string; caption: string; chatId: string; token: string;
  fetchFn?: typeof fetch; readFile?: (p: string) => Buffer; now?: () => Date;
  loadRecord?: (p: string) => VideoRecordLike | null; saveRecord?: (p: string, r: VideoRecordLike) => void;
}): Promise<'skipped' | 'sent' | 'rejected' | 'unknown'> {
  const { recordPath, date, videoPath, caption, chatId, token, fetchFn = fetch, readFile = p => readFileSync(p), now = () => new Date(), loadRecord = defaultLoad, saveRecord = defaultSave } = deps;
  const record: VideoRecordLike = loadRecord(recordPath) ?? { date, posted: {} };
  record.posted ??= {};
  if (record.posted.telegram) return 'skipped';

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('supports_streaming', 'true');
  form.append('video', new Blob([readFile(videoPath)]), basename(videoPath));

  let outcome;
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendVideo`, { method: 'POST', body: form });
    outcome = classifyTelegramResponse(res.status, await res.json().catch(() => null));
  } catch (err) {
    outcome = { status: 'unknown' as const, reason: String(err) };
  }
  if (outcome.status === 'rejected') return 'rejected';
  record.posted.telegram = outcome.status === 'sent'
    ? { url: `telegram:message/${outcome.messageId}`, postedAt: now().toISOString() }
    : { url: 'telegram:unknown', postedAt: now().toISOString(), uncertain: true };
  saveRecord(recordPath, record);
  return outcome.status;
}
```

- [ ] **Step 4: Run it.** `npx vitest run scripts/lib/telegram-video.test.ts`. Expected: 3 passed.

- [ ] **Step 5: Create the CLI** `scripts/telegram-video-post.ts`:

```ts
#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { postVideoOnce } from './lib/telegram-video.js';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const video = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const recordPath = flag('--record');
const captionFile = flag('--caption-file');
const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const chatId = process.env.TELEGRAM_CHANNEL_ID ?? '';
if (!token || !chatId) { console.log('Telegram secrets not configured — skipping'); process.exit(0); }
if (!video || !recordPath) { console.error('usage: telegram-video-post.ts <video> --record <path> [--caption-file <path>]'); process.exit(1); }
const date = new Date().toISOString().slice(0, 10);
const caption = captionFile ? readFileSync(captionFile, 'utf8') : `Watchboard Daily Brief — ${date}\n\nwatchboard.dev\n\n#Watchboard`;
const r = await postVideoOnce({ recordPath, date, videoPath: video, caption, chatId, token });
if (r === 'skipped') console.log(`Telegram: already posted per ${recordPath} — skipping`);
if (r === 'sent') console.log('✅ Video posted to Telegram');
if (r === 'unknown') console.log('::warning::Telegram video post outcome unknown — recorded as posted to avoid a duplicate; check the channel');
if (r === 'rejected') { console.log('::error::Telegram rejected the video post'); process.exit(1); }
```

- [ ] **Step 6: Tolerate a Telegram-only record in `post-video-social.ts`.** If Bluesky failed fatally, the Telegram step may create the record first, with only `{date, posted}`. Replace `:504` with:

```ts
  const initial = buildInitialRecord(meta, platforms);
  const record: VideoPostRecord = existingRecord ? { ...initial, ...existingRecord, posted: existingRecord.posted ?? {} } : initial;
```

- [ ] **Step 7: Rewire `daily-video.yml`, `video` job.**
  1. Move the "Post video to Telegram" step (`:330-368`) so that it sits directly after "Post to social media" (`:175-191`) and **before** "Commit social post record" (`:193`). The Telegram entry is then part of the committed record.
  2. Replace its `curl` block (`:361-368`) with the lines below. The video choice is unchanged: the base `$VIDEO`, as today.
     ```yaml
          npx tsx scripts/telegram-video-post.ts "$VIDEO" \
            --record "public/_social/video-post-${DATE}.json" \
            --caption-file /tmp/telegram-caption-breaking.txt
     ```
     Keep `continue-on-error: true` and the secrets guard, and give the step `id: telegram`.
  3. "Commit social post record" already uses `push-state.sh` (Task 2b). Add `PUSH_STATE_DETAIL: "Daily video already posted to Bluesky/Telegram — DO NOT re-run; commit public/_social/video-post-<date>.json by hand"` to its `env:`.
  4. Change the `::error::` text of "Fail job if a state commit/push failed" (`:383`) so that it starts with `DO NOT RE-RUN — the video is already public.` Add a second check to the same step: `if [ "${{ steps.telegram.outcome }}" = "failure" ]; then echo "::error::Telegram rejected the daily video (4xx) — nothing was published there; a re-run is safe"; exit 1; fi`. A rejected post never went public, so the text says a re-run is safe, unlike the push case.
  5. `:26` → `- uses: actions/checkout@v5` with `with:` / `ref: main`. A GitHub re-run reuses the original `GITHUB_SHA`; without `ref: main` attempt 2 would not see the `video-post-<date>.json` that attempt 1 pushed, and `loadPostRecord` (`post-video-social.ts:503`) and `postVideoOnce` would both post again.
- [ ] **Step 8: Rewire the `video-progress` job the same way.** Move "Post progress video to Telegram" (`:564-604`) to before "Commit social post record" (`:534`). Replace the `curl` (`:597-604`) with `npx tsx scripts/telegram-video-post.ts "$SEND" --record "public/_social/video-post-progress-${DATE}.json" --caption-file /tmp/telegram-caption-progress.txt`. The single-try push (`:547-551`) already became `push-state.sh` in Task 2b; add the same `PUSH_STATE_DETAIL`. Prefix the `:628` message with `DO NOT RE-RUN — `, give the Telegram step `id: telegram` and add the same Telegram-outcome check. `:394` → `actions/checkout@v5` with `ref: main`.
- [ ] **Step 9: Run the guard test.** `npx vitest run tests/ci/workflow-publish-guards.test.ts`. Expected: all pass, including `daily-video.yml never posts to Telegram with a bare curl`.
- [ ] **Step 10: Full suite and type-check.** `npm test`, then `npx tsc --noEmit -p . 2>&1 | grep -E 'scripts/(lib/telegram-video|telegram-video-post|post-video-social)'`. Expected: all green and no new errors.
- [ ] **Step 11: Commit.** `git add scripts/lib/telegram-video.ts scripts/lib/telegram-video.test.ts scripts/telegram-video-post.ts scripts/post-video-social.ts .github/workflows/daily-video.yml && git commit -m "fix(daily-video): idempotent, checked Telegram post recorded before the state push"`

### Task 7: PR-1 rollout checks

- [ ] **Step 1:** `git push -u origin fix/no-public-resend && gh pr create --fill`. The PR body must list the behaviour changes readers will notice: no cancellation of publishers, publishers check out `main` (re-runs see earlier records), light-scan saves after each alert, uncertain sends are not retried (per Q7's answer), and the private alert on push failure. It ends with the attribution line from the session reminder.
- [ ] **Step 2:** `gh pr checks <n> --watch --fail-fast`. Merge by hand only when it is green.
- [ ] **Step 3:** After the merge, do **not** use a `telegram-notify` dispatch as a rollout check: its manifest is dead (Q6), so "All updates already sent" proves nothing. Run `gh workflow run post-social-queue.yml` and expect green with `No queue for …` or `0 posts due`, and its log must show `push-state: social-queue pushed on attempt 1` or "No changes to commit". Also confirm the next scheduled `light-scan` run is green: `gh run list --workflow=light-scan.yml --limit 3`.
- [ ] **Step 4:** Verify the artefact, not the exit code. `git log origin/main -3 --format='%s' -- public/_hourly/state.json` must show a light-scan commit made after the merge.
## PR-2 · Radio UX (c, d)

Branch `fix/radio-empty-state-mobile-globe`. Implements **C2**, the spec's recommendation. If the owner picks C1 instead (open question 2), skip Tasks 8-10. Then remove `"radio-towers"` from `map.staticLayers` in `trackers/gaza-war/tracker.json`, `trackers/israel-palestine/tracker.json` and `trackers/yemen-conflict/tracker.json`, and keep `radioCountryCodes`, which `radio-stations` still uses. Task 11 applies either way.

### Task 8: `emptyScopeReason` + `emptyStateKey` + localized text

**Files:** modify `src/lib/geo-layer-schema.ts` (`StaticLayerMeta` type near `:80-81`: add `emptyStateKey?: string`; `STATIC_LAYERS` `:88`: add `emptyStateKey: 'layers.radioTowersNone'` to `radio-towers` only; append after `staticLayerMeta`, `:93-95`), `src/lib/geo-layer-schema.test.ts`, `src/i18n/translations.ts` (after `'layers.radioStationsGlobal'` at `:193`, `:910`, `:1609`, `:2308`).

**Interfaces:**
- Produces: `export function emptyScopeReason(layer: GeoLayer | null | undefined, codes: string[] | null | undefined, meta: StaticLayerMeta | undefined): string[] | null`
- Produces: `export function countryListLabel(codes: string[], locale: string): string` — `Intl.DisplayNames([locale], { type: 'region' })`, falling back to the code when the name is unknown, joined with `', '`.
- Consumed by: Task 9 (`IntelMap.tsx`, `MapLayerToggles.tsx`), Task 10 (`useGeoLayers.ts`, `CesiumControls.tsx`, `GlobeMobileSheet.tsx`) and Task 10b (build-time scopes).

Why a per-layer key: `radio-stations` also has `filterByCountry: true` (`geo-layer-schema.ts:89`), and a generic "towers" sentence would be wrong for it. Only a layer that declares `emptyStateKey` ever shows the empty state.

- [ ] **Step 1: Write the failing test.** Append to `src/lib/geo-layer-schema.test.ts`:

```ts
import { emptyScopeReason } from './geo-layer-schema';

describe('emptyScopeReason', () => {
  const towers = staticLayerMeta('radio-towers');
  const layer = (countries: Record<string, { count: number; status: 'fresh' | 'stale' }>, features: Array<{ cc: string }> = []) => GeoLayerSchema.parse({
    type: 'FeatureCollection',
    _provenance: { ...prov, id: 'radio-towers', featureCount: features.length, countries: Object.fromEntries(Object.entries(countries).map(([cc, c]) => [cc, { ...c, retrievedAt: '2026-09-24T00:00:00Z' }])) },
    features: features.map(f => ({ ...feature, properties: { countryCode: f.cc } })),
  });

  it('names the codes when every tracker country is fresh with 0 towers', () => {
    expect(emptyScopeReason(layer({ IL: { count: 0, status: 'fresh' }, PS: { count: 0, status: 'fresh' }, UA: { count: 1, status: 'fresh' } }, [{ cc: 'UA' }]), ['PS', 'IL'], towers)).toEqual(['IL', 'PS']);
  });
  it('is null when any tracker country has features', () => {
    expect(emptyScopeReason(layer({ ML: { count: 1, status: 'fresh' }, BF: { count: 0, status: 'fresh' } }, [{ cc: 'ML' }]), ['ML', 'BF'], towers)).toBeNull();
  });
  it('is null when a zero country is stale (old data is not "none mapped")', () => {
    expect(emptyScopeReason(layer({ YE: { count: 0, status: 'stale' } }), ['YE'], towers)).toBeNull();
  });
  it('is null when a code has no provenance entry, for unscoped layers, and before data loads', () => {
    expect(emptyScopeReason(layer({}), ['YE'], towers)).toBeNull();
    expect(emptyScopeReason(layer({ YE: { count: 0, status: 'fresh' } }), ['YE'], staticLayerMeta('nuclear-plants'))).toBeNull();
    expect(emptyScopeReason(null, ['YE'], towers)).toBeNull();
    expect(emptyScopeReason(layer({}), [], towers)).toBeNull();
  });
  it('is null for a country-scoped layer without emptyStateKey (radio-stations)', () => {
    expect(emptyScopeReason(layer({ YE: { count: 0, status: 'fresh' } }), ['YE'], staticLayerMeta('radio-stations'))).toBeNull();
  });
});

describe('countryListLabel', () => {
  it('uses localized country names, not ISO codes', () => {
    expect(countryListLabel(['IL', 'PS'], 'en')).toBe('Israel, Palestinian Territories');
    expect(countryListLabel(['YE'], 'es')).toBe('Yemen');
    expect(countryListLabel(['XX'], 'en')).toBe('XX');
  });
});
```

Add `countryListLabel` to the import. If Node's ICU spells a name differently (`Intl.DisplayNames` output depends on the ICU version), update the expected string to the observed one once, and keep the assertion that the output is not the bare code.

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run src/lib/geo-layer-schema.test.ts`. Expected: `emptyScopeReason is not a function`.

- [ ] **Step 3: Implement.** Append to `src/lib/geo-layer-schema.ts`:

```ts
/**
 * Why a country-scoped layer draws nothing for this tracker, when the reason
 * is "OpenStreetMap has no such features there" (spec §3, option C2) — e.g.
 * radio-towers for gaza-war (IL, PS) or yemen-conflict (YE). Returns the
 * sorted codes only if every one of them was fetched fresh with count 0;
 * a stale or never-fetched country is a data problem, not an empty map, and
 * returns null so the UI doesn't claim something it hasn't verified.
 */
export function emptyScopeReason(layer: GeoLayer | null | undefined, codes: string[] | null | undefined, meta: StaticLayerMeta | undefined): string[] | null {
  if (!layer || !meta?.filterByCountry || !meta.emptyStateKey || !codes || codes.length === 0) return null;
  const allowed = new Set(codes);
  if (layer.features.some(f => allowed.has(String((f.properties as Record<string, unknown>)?.countryCode ?? '')))) return null;
  const prov = layer._provenance.countries;
  if (!prov) return null;
  for (const cc of codes) {
    const c = prov[cc];
    if (!c || c.status !== 'fresh' || c.count !== 0) return null;
  }
  return [...codes].sort();
}

/** Localized, human country list for the empty-state text ("Israel, Palestinian Territories"). */
export function countryListLabel(codes: string[], locale: string): string {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([locale], { type: 'region' }); } catch { /* old runtime: codes */ }
  return codes.map(cc => names?.of(cc) ?? cc).join(', ');
}
```

- [ ] **Step 4: Add the two i18n keys** directly after each `'layers.radioStationsGlobal'` line, using the exact strings in Global Constraints: en `:193`, es `:910`, fr `:1609`, pt `:2308`. For example, in `en`:
  ```ts
    'layers.radioTowersNoneShort': 'none tagged',
    'layers.radioTowersNone': 'No radio-tagged towers in OpenStreetMap for {codes}',
  ```
  The wording states the filter (`communication:radio`), because IL has 484 tower/mast nodes in OSM, just none tagged for radio (spec §3). The type `TranslationKeys = Record<keyof typeof en, string>` (`translations.ts:6`) makes a missing locale a compile error, and the existing parity test in `translations.test.ts` also fails on one.

- [ ] **Step 5: Run the tests.** `npx vitest run src/lib/geo-layer-schema.test.ts src/i18n/translations.test.ts`. Expected: all pass.

- [ ] **Step 6: Commit.** `git add src/lib/geo-layer-schema.ts src/lib/geo-layer-schema.test.ts src/i18n/translations.ts && git commit -m "feat(layers): emptyScopeReason + localized country list for radio towers with no radio-tagged OSM features"`

### Task 9: 2D map shows "none mapped" (MapLayerToggles + IntelMap)

**Files:** modify `src/components/islands/IntelMap.tsx:180-190`, `src/components/islands/MapLayerToggles.tsx:49`, `:119-131`, `src/styles/global.css` (after `.map-layer-count`, `:3123-3134`), `e2e/geo-layers.spec.ts`.

**Interfaces:** the `extraLayers` item type in both files gains `emptyCodes?: string[]`.

- [ ] **Step 1: Write the failing e2e spec.** Append inside `test.describe('E5 geo layers on the 2D map', …)` in `e2e/geo-layers.spec.ts`:

```ts
  test('radio towers on gaza-war say "none tagged", readable without hover, with country names', async ({ page }) => {
    await page.route('**/geo/layers/radio-towers.geojson', r => r.fulfill({ path: 'e2e/fixtures/radio-towers-empty.geojson', contentType: 'application/geo+json' }));
    await page.goto('./gaza-war/');
    const map = page.locator('.leaflet-container:visible').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    await page.locator('.map-layers-toggle:visible').first().click();
    const panel = page.locator('.map-layers-panel:visible').first();
    const toggle = panel.locator('[data-layer="radio-towers"]');
    await toggle.click(); // runtime path: the fetched (fixture) layer decides
    await expect(toggle.locator('.map-layer-empty')).toHaveText('none tagged', { timeout: 20_000 });
    await expect(toggle).toHaveAccessibleDescription('No radio-tagged towers in OpenStreetMap for Israel, Palestinian Territories');
  });
```

Also create `e2e/fixtures/radio-towers-empty.geojson`: a valid `GeoLayer` with `_provenance.id: 'radio-towers'`, `countries: { IL: {count:0,status:'fresh',retrievedAt:'2026-09-24T00:00:00Z'}, PS: {…same}, UA: {count:1,…} }` and one UA feature. The spec therefore tests the UI contract, not live OSM data; a real OSM change on the monthly refresh (which commits straight to `main`, where `e2e.yml` runs on push) cannot turn `main` red. The build-time half (the label before any click) is covered by the unit test in Task 10b and by the live check in Task 14 Step 5, not by e2e, because it reads the committed file. Add a mobile case in a separate `test.describe` with `test.use({ viewport: { width: 390, height: 844 } })` that opens the tracker's mobile MAP tab and asserts the same text and accessible description (the mobile 2D map is `MobileMapTab` → `IntelMap` → `MapLayerToggles`, `MobileMapTab.tsx:100-111`).

- [ ] **Step 2: Run it and watch it fail.** `npx playwright test e2e/geo-layers.spec.ts -g "none mapped" --reporter=list`. `playwright.config.ts:31-38` starts `npm run dev` on :4321 or reuses one that is already running. Expected: `.map-layer-empty` is not found.

- [ ] **Step 3: IntelMap.** In the `extraLayerDefs` memo (`:185-188`), compute and pass the reason:

```ts
    [s0, s1, s2].forEach((r, i) => {
      const { id, meta, layer } = scopedStatics[i];
      if (id && meta) defs.push({ id, label: meta.label, count: layer?.features.length ?? 0, on: !!extraLayers[id], status: r.status, updatedAt: r.updatedAt, error: r.error, snapshotDate: r.data?._provenance.retrievedAt.slice(0, 10), emptyCodes: (r.data ? emptyScopeReason(r.data, radioCountryCodes, meta) : emptyScopes?.[id]) ?? undefined, emptyKey: meta.emptyStateKey });
    });
```

Add `emptyCodes?: string[]; emptyKey?: string` to the `defs` element type (`:182`), `radioCountryCodes` and `emptyScopes` to that memo's deps (`:190`), `emptyScopes?: Record<string, string[]>` to `IntelMap`'s props, and `emptyScopeReason` to the existing `geo-layer-schema` import. `emptyScopeReason` takes the **unfiltered** `r.data`, because it filters by itself; before the layer is fetched, the build-time `emptyScopes[id]` (Task 10b) is used, so the toggle is marked before it is clicked.

- [ ] **Step 4: MapLayerToggles.** Add `emptyCodes?: string[]; emptyKey?: string` to the `extraLayers` item type (`:49`). On the toggle element for each extra layer (the one carrying `data-layer`), add `aria-describedby={l.emptyCodes ? `empty-${l.id}` : undefined}`. Directly after the count line (`:128`), add:

```tsx
              {l.count === 0 && l.emptyCodes && l.emptyKey && (() => {
                const full = t(l.emptyKey as never, locale).replace('{codes}', countryListLabel(l.emptyCodes, locale));
                return (
                  <>
                    <span className="map-layer-empty" title={full}>{t('layers.radioTowersNoneShort', locale)}</span>
                    <span id={`empty-${l.id}`} className="sr-only">{full}</span>
                  </>
                );
              })()}
```

  The short label is visible on touch devices; the full sentence is the toggle's accessible description. No `l.on` condition: with the build-time scope the label shows before the first click. Import `countryListLabel` from `../../lib/geo-layer-schema`. If `.sr-only` does not exist in `global.css` (`grep -n '\.sr-only' src/styles/global.css`), add the standard rule (`position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0`).

- [ ] **Step 5: CSS.** After `.map-layer-count { … }` in `src/styles/global.css`:

```css
.map-layer-empty {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.42rem;
  color: var(--text-muted);
  border: 1px dashed var(--text-muted);
  padding: 0 4px;
  border-radius: 8px;
  opacity: 0.8;
  flex-shrink: 0;
  cursor: help;
}
```

- [ ] **Step 6: Run the e2e again.** Expected: pass. Also run the whole file: `npx playwright test e2e/geo-layers.spec.ts --reporter=list`, and expect everything green.

- [ ] **Step 7: Commit.** `git add src/components/islands/IntelMap.tsx src/components/islands/MapLayerToggles.tsx src/styles/global.css e2e/geo-layers.spec.ts && git commit -m "fix(map): radio layer with no OSM towers shows an explicit none-mapped chip"`

### Task 10: 3D globe shows "none mapped" (useStaticGeoLayer + CesiumGlobe + CesiumControls)

**Files:** modify `src/components/islands/CesiumGlobe/useGeoLayers.ts:32`, `:132-207`; `CesiumGlobe.tsx:645-654`, `:967`, `:1034`; `CesiumControls.tsx:33`, `:381-393`; `GlobeMobileSheet.tsx:82`, `:415-423`; `src/styles/globe.css` (after `.globe-filter-count`, `:186-192`); `e2e/geo-layers.spec.ts`.

**Interfaces:** `LayerResult` (`useGeoLayers.ts:32`) gains `emptyCodes?: string[]`. The globe's `extraLayerDefs` item, the `CesiumControls` `extraLayers` item **and the `GlobeMobileSheet` `extraLayers` item** gain `emptyCodes?: string[]; emptyKey?: string`. On phones (`isMobile = window.innerWidth <= 768`, `CesiumGlobe.tsx:224-226`) the globe renders `GlobeMobileSheet` (`:993-1034`), not `CesiumControls` (`:899`), and TypeScript's excess-property check does not fire on a `.map` callback's return, so forgetting the sheet's type would silently drop the field.

- [ ] **Step 1: Write the failing e2e spec.** Append a new describe block to `e2e/geo-layers.spec.ts`:

```ts
test.describe('E5 geo layers on the 3D globe', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(TOUR_DONE); });
  test.beforeEach(async ({ page }) => {
    await page.route('**/geo/layers/radio-towers.geojson', r => r.fulfill({ path: 'e2e/fixtures/radio-towers-empty.geojson', contentType: 'application/geo+json' }));
  });
  test('radio towers on the gaza-war globe say "none tagged"', async ({ page }) => {
    await page.goto('./gaza-war/globe/?layers=radio-towers');
    await page.locator('button[title="Intel Layers"]').first().click({ timeout: 60_000 });
    const toggle = page.locator('.globe-filter[data-layer="radio-towers"]');
    await expect(toggle.locator('.globe-filter-empty')).toHaveText('none tagged', { timeout: 30_000 });
    await expect(toggle).toHaveAccessibleDescription('No radio-tagged towers in OpenStreetMap for Israel, Palestinian Territories');
  });
});

test.describe('E5 geo layers on the 3D globe — phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.route('**/geo/layers/radio-towers.geojson', r => r.fulfill({ path: 'e2e/fixtures/radio-towers-empty.geojson', contentType: 'application/geo+json' }));
  });
  test('the mobile sheet shows the same "none tagged" state', async ({ page }) => {
    await page.goto('./gaza-war/globe/?layers=radio-towers');
    const btn = page.locator('.mobile-sheet-filter-btn[data-layer="radio-towers"]');
    await btn.scrollIntoViewIfNeeded({ timeout: 60_000 });
    await expect(btn.locator('.globe-filter-empty')).toHaveText('none tagged', { timeout: 30_000 });
    await expect(btn).toHaveAccessibleDescription('No radio-tagged towers in OpenStreetMap for Israel, Palestinian Territories');
  });
});
```

If the sheet's filter buttons are collapsed behind a handle at 390 px, open it first with the sheet's existing toggle (find it with `grep -n 'className="mobile-sheet' src/components/islands/CesiumGlobe/GlobeMobileSheet.tsx`) and add that click to the spec.

`?layers=radio-towers` turns the layer on at mount (`CesiumGlobe.tsx:186-187`). The layer only fetches once `!!viewer`, so the long timeout is deliberate: SwiftShader is slow in CI.

- [ ] **Step 2: Run it and watch it fail.** `npx playwright test e2e/geo-layers.spec.ts -g "gaza-war globe" --reporter=list`. Expected: `.globe-filter-empty` is not found.

- [ ] **Step 3: `useGeoLayers.ts`.** Change `:32` to `interface LayerResult { count: number; status: LiveStatus; updatedAt: number | null; error?: string; label?: string; emptyCodes?: string[] }`. In `useStaticGeoLayer`, before the `return`, add `const emptyCodes = useMemo(() => (enabled ? emptyScopeReason(data ?? null, radioCountryCodes, meta) ?? undefined : undefined), [enabled, data, radioCountryCodes, meta]);`, and add `emptyCodes` to the returned object (`:207`). Import `emptyScopeReason` next to `staticLayerMeta`.

- [ ] **Step 4: `CesiumGlobe.tsx`.** In `extraLayerDefs` (`:646-651`), add `emptyCodes?: string[]; emptyKey?: string` to the element type and `emptyCodes: staticResults[i].emptyCodes ?? emptyScopes?.[id], emptyKey: staticLayerMeta(id)?.emptyStateKey` to the static push (`emptyScopes?: Record<string, string[]>` is a new `CesiumGlobe` prop, Task 10b). At both render sites (`:967` CesiumControls, `:1034` GlobeMobileSheet), change the map to `extraLayerDefs.map(d => ({ id: d.id, label: d.label, count: d.count, on: !!extraLayers[d.id], emptyCodes: d.emptyCodes, emptyKey: d.emptyKey }))`.

- [ ] **Step 5: `CesiumControls.tsx`.** Change the `extraLayers` type (`:33`) to `{ id: string; label: string; count: number; on: boolean; emptyCodes?: string[]; emptyKey?: string }[]`. On the `.globe-filter` element add `aria-describedby={l.emptyCodes ? `globe-empty-${l.id}` : undefined}`. After `:392`, add:

```tsx
          {l.count === 0 && l.emptyCodes && l.emptyKey && (() => {
            const full = t(l.emptyKey as never, locale).replace('{codes}', countryListLabel(l.emptyCodes, locale));
            return (
              <>
                <span className="globe-filter-empty" title={full}>{t('layers.radioTowersNoneShort', locale)}</span>
                <span id={`globe-empty-${l.id}`} className="sr-only">{full}</span>
              </>
            );
          })()}
```

- [ ] **Step 5b: `GlobeMobileSheet.tsx`.** Change the `extraLayers` type (`:82`) to the same shape as CesiumControls. In the render at `:415-423`, add `data-layer={l.id}` and `aria-describedby={l.emptyCodes ? `sheet-empty-${l.id}` : undefined}` to the `<button>`, and after `{t(l.label as any, locale)}` insert the same fragment as Step 5 with ids prefixed `sheet-empty-`. Import `countryListLabel`. `data-layer` is also what the phone e2e selects on.

- [ ] **Step 6: CSS** in `src/styles/globe.css`, after `.globe-filter-count`:

```css
.globe-filter-empty {
  border: 1px dashed rgba(255, 255, 255, 0.35);
  color: rgba(255, 255, 255, 0.55);
  padding: 0 4px;
  border-radius: 8px;
  font-size: 0.6rem;
  margin-left: auto;
  cursor: help;
}
```

- [ ] **Step 7: Run the e2e spec and the type-check.** `npx playwright test e2e/geo-layers.spec.ts --reporter=list` should be all green. `npx tsc --noEmit -p . 2>&1 | grep -E 'CesiumGlobe/(useGeoLayers|CesiumGlobe|CesiumControls|GlobeMobileSheet)|IntelMap|MapLayerToggles'` should show no errors that are not also present on `origin/main`.

- [ ] **Step 8: Commit.** `git add src/components/islands/CesiumGlobe src/styles/globe.css e2e/geo-layers.spec.ts && git commit -m "fix(globe): none-tagged state for radio towers on desktop controls and the mobile sheet"`

### Task 10b: build-time empty scopes, so the toggle is marked before it is clicked

**Files:** create `src/lib/empty-scopes-node.ts`, `src/lib/empty-scopes-node.test.ts`; modify `src/pages/[tracker]/index.astro` (props at `:132` and the `MobileTabShellLoader` block `:155-170`), `src/pages/[tracker]/globe.astro` (the `CesiumGlobe` mount), `MobileTabShell.tsx` / `MobileMapTab.tsx` (pass-through, included in `LAYER_PROP_KEYS` by Task 12).

Why: both layer hooks fetch only when the layer is on (`useGeoLayersData.ts:39` `enabled: enabled && !!id`; `useStaticGeoLayer` likewise), so a runtime-only empty state appears after the reader has already clicked an empty toggle.

**Interfaces:**
```ts
// src/lib/empty-scopes-node.ts (build time only: uses node:fs)
export function computeEmptyScopes(staticLayers: string[] | undefined, codes: string[] | undefined, readLayer?: (id: string) => GeoLayer | null): Record<string, string[]>;
```

- [ ] **Step 1: Write the failing test** `src/lib/empty-scopes-node.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeEmptyScopes } from './empty-scopes-node';
import { GeoLayerSchema } from './geo-layer-schema';

const towers = (countries: Record<string, number>) => GeoLayerSchema.parse({
  type: 'FeatureCollection',
  _provenance: { id: 'radio-towers', source: 'OpenStreetMap', license: 'ODbL-1.0', retrievedAt: '2026-09-24T00:00:00Z', featureCount: 0,
    countries: Object.fromEntries(Object.entries(countries).map(([cc, n]) => [cc, { count: n, status: 'fresh', retrievedAt: '2026-09-24T00:00:00Z' }])) },
  features: [],
});

describe('computeEmptyScopes', () => {
  it('marks radio-towers when every tracker country is a fresh zero', () => {
    expect(computeEmptyScopes(['radio-towers', 'radio-stations'], ['IL', 'PS'], id => (id === 'radio-towers' ? towers({ IL: 0, PS: 0 }) : null))).toEqual({ 'radio-towers': ['IL', 'PS'] });
  });
  it('is empty when the file is missing or a country has towers', () => {
    expect(computeEmptyScopes(['radio-towers'], ['IL'], () => null)).toEqual({});
    expect(computeEmptyScopes(['radio-towers'], ['ML', 'BF'], () => towers({ ML: 74, BF: 0 }))).toEqual({});
  });
});
```

  Copy the exact `_provenance` required fields from the `prov` fixture at the top of `src/lib/geo-layer-schema.test.ts` if the schema demands more than shown.
- [ ] **Step 2: Run it and watch it fail.** `npx vitest run src/lib/empty-scopes-node.test.ts` → module not found.
- [ ] **Step 3: Implement** `src/lib/empty-scopes-node.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GeoLayerSchema, emptyScopeReason, staticLayerMeta, type GeoLayer } from './geo-layer-schema';

const readCommitted = (id: string): GeoLayer | null => {
  const p = resolve('public/geo/layers', `${id}.geojson`);
  if (!existsSync(p)) return null;
  const r = GeoLayerSchema.safeParse(JSON.parse(readFileSync(p, 'utf8')));
  return r.success ? r.data : null;
};

/** Build-time copy of the runtime empty-state rule, so a toggle says "none tagged" before its layer is fetched. */
export function computeEmptyScopes(staticLayers: string[] | undefined, codes: string[] | undefined, readLayer: (id: string) => GeoLayer | null = readCommitted): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of staticLayers ?? []) {
    const meta = staticLayerMeta(id);
    if (!meta?.emptyStateKey) continue; // don't read files for layers that can't be "empty"
    const reason = emptyScopeReason(readLayer(id), codes, meta);
    if (reason) out[id] = reason;
  }
  return out;
}
```

- [ ] **Step 4: Wire it.** In `src/pages/[tracker]/index.astro` frontmatter: `const emptyScopes = computeEmptyScopes(config.map?.staticLayers, config.map?.radioCountryCodes);`. Pass `emptyScopes={emptyScopes}` to `IntelMapLoader` (`:132`) and `MobileTabShellLoader` (`:155-170`); thread it through `MobileTabShell` to `MobileMapTab` (add to their props). Same frontmatter line and prop in `globe.astro` for `CesiumGlobe`. The per-page cost is one JSON parse of `radio-towers.geojson` per tracker that has the layer (22 trackers); if the build time grows noticeably, memoize `readCommitted` in a module-level `Map`.
- [ ] **Step 5: Run it.** `npx vitest run src/lib/empty-scopes-node.test.ts` → 2 passed. `npm run build`, then verify the serialized island prop (client-only islands carry props in `astro-island` attributes, HTML-escaped): `node -e "const h=require('fs').readFileSync('dist/gaza-war/index.html','utf8').replace(/&quot;/g,'\"');process.exit(/emptyScopes[\s\S]{0,200}radio-towers[\s\S]{0,60}IL/.test(h)?0:1)"; echo $?` must print `0`.
- [ ] **Step 6: Commit.** `git add src/lib/empty-scopes-node.ts src/lib/empty-scopes-node.test.ts 'src/pages/[[]tracker]/' src/components/islands/mobile && git commit -m "feat(layers): build-time empty scopes so an empty radio toggle is marked before it is clicked"` (the `[[]tracker]` spelling avoids the pathspec bracket trap; check `git status` afterwards).

### Task 11: `::notice::` for zero-tower countries in the refresh log

**Files:** modify `scripts/geo/refresh-layers.ts:670-686`, `scripts/geo/refresh-layers.test.ts`.

**Interfaces:** no signature change. `runRadioTowers` routes the new line through the existing `noticeFn` dep (`:614-615`).

- [ ] **Step 1: Write the failing test.** Append to `scripts/geo/refresh-layers.test.ts`:

```ts
describe('runRadioTowers zero-country notice', () => {
  it('emits one ::notice:: per country fetched fresh with zero towers, none for failures or non-empty countries', async () => {
    const notices: string[] = [];
    const warns: string[] = [];
    const node = (id: number) => ({ type: 'node', id, lat: 1, lon: 1, tags: { man_made: 'mast', 'communication:radio': 'fm' } });
    await runRadioTowers('2026-09-24T00:00:00Z', {
      codes: ['IL', 'UA', 'TH'], previous: null, sleepFn: async () => {}, clock: () => 0, gapMs: 0,
      fetchFn: async (cc: string) => { if (cc === 'TH') throw new Error('HTTP 504'); return cc === 'UA' ? [node(1)] : []; },
      noticeFn: m => notices.push(m), warnFn: m => warns.push(m),
    });
    expect(notices).toEqual(['::notice::radio-towers IL: 0 radio-tagged towers in OSM']);
    expect(warns.some(w => w.includes('TH stale'))).toBe(true);
  });

  it('no notice for a zero fetch that the merge kept stale as a suspicious drop', async () => {
    const notices: string[] = [];
    const warns: string[] = [];
    const node = (id: number) => ({ type: 'node', id, lat: 1, lon: 1, tags: { man_made: 'mast', 'communication:radio': 'fm' } });
    const previous = await runRadioTowers('2026-09-01T00:00:00Z', {
      codes: ['IL'], previous: null, sleepFn: async () => {}, clock: () => 0, gapMs: 0,
      fetchFn: async () => Array.from({ length: 20 }, (_, i) => node(i + 1)), noticeFn: () => {}, warnFn: () => {},
    });
    await runRadioTowers('2026-09-24T00:00:00Z', {
      codes: ['IL'], previous: previous.layer, acceptDropCodes: [], sleepFn: async () => {}, clock: () => 0, gapMs: 0,
      fetchFn: async () => [], noticeFn: m => notices.push(m), warnFn: m => warns.push(m),
    });
    expect(warns.some(w => w.includes('IL') && w.includes('stale'))).toBe(true);
    expect(notices.filter(n => n.includes('0 radio-tagged towers'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run scripts/geo/refresh-layers.test.ts -t "zero-country notice"`. Expected: `notices` is `[]`.

- [ ] **Step 3: Implement.** In `runRadioTowers`, after the `acceptedDrops` notice loop (`:680-682`), add:

```ts
  // Keyed on the MERGED status: a zero fetch that mergeCountryTowers kept stale
  // (suspicious drop, isSuspiciousDrop :378) gets only its warning above.
  for (const cc of Object.keys(merged.countries).sort()) {
    const c = merged.countries[cc];
    if (c.status === 'fresh' && c.count === 0 && !(cc in merged.staleReasons)) {
      noticeFn(`::notice::radio-towers ${cc}: 0 radio-tagged towers in OSM`);
    }
  }
```

Also extend the doc comment above `runRadioTowers` (`:644-647`) with one sentence: "Prints one `::notice::` per country whose fetch succeeded with zero towers — a real, verified empty (IL/PS/YE/BF/NE on 2026-09-24), which the UI explains with `emptyScopeReason`."

- [ ] **Step 4: Run the whole file.** `npx vitest run scripts/geo/refresh-layers.test.ts`. Expected: all pass. The only existing test that asserts on notices (`refresh-layers.test.ts:651-672`) fetches one tower, so the new line does not affect it.

- [ ] **Step 5: Commit.** `git add scripts/geo/refresh-layers.ts scripts/geo/refresh-layers.test.ts && git commit -m "feat(geo): notice for countries with zero OSM radio towers"`

### Task 12: Mobile 3D globe gets the same layer props as the 2D map (d)

**Files:** create `src/components/islands/mobile/mobile-layer-props.ts`, `src/components/islands/mobile/mobile-layer-props.test.ts`; modify `src/components/islands/mobile/MobileMapTab.tsx:38-42`, `:100-111`, `:141-153`.

**Interfaces:**
- Produces:
  ```ts
  export const LAYER_PROP_KEYS = ['trackerSlug', 'mapBounds', 'liveLayers', 'staticLayers', 'radioCountryCodes', 'emptyScopes'] as const;
  export type LayerProps = { trackerSlug: string; mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number }; liveLayers?: string[]; staticLayers?: string[]; radioCountryCodes?: string[]; emptyScopes?: Record<string, string[]> };
  export function pickLayerProps(p: LayerProps & Record<string, unknown>): LayerProps;
  ```

- [ ] **Step 1: Write the failing test** `src/components/islands/mobile/mobile-layer-props.test.ts`. Vitest cannot render the component, so the test pins the picker and scans the source to prove both map instances spread the same object:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LAYER_PROP_KEYS, pickLayerProps } from './mobile-layer-props';

describe('pickLayerProps', () => {
  it('returns exactly the layer keys', () => {
    const picked = pickLayerProps({ trackerSlug: 'ukraine-war', staticLayers: ['radio-towers'], liveLayers: ['deepstate-frontline'], radioCountryCodes: ['UA'], mapBounds: { lonMin: 1, lonMax: 2, latMin: 3, latMax: 4 }, points: [] } as never);
    expect(Object.keys(picked).sort()).toEqual([...LAYER_PROP_KEYS].sort());
  });
});

describe('MobileMapTab source', () => {
  const src = readFileSync('src/components/islands/mobile/MobileMapTab.tsx', 'utf8');
  const block = (tag: string) => { const i = src.indexOf(`<${tag}`); return src.slice(i, src.indexOf('/>', i)); };
  it('spreads the same layerProps into the 2D map and the 3D globe', () => {
    expect(block('IntelMap')).toContain('{...layerProps}');
    expect(block('CesiumGlobe')).toContain('{...layerProps}');
  });
  it('passes no layer key by hand (so the two lists cannot drift)', () => {
    for (const k of LAYER_PROP_KEYS) {
      expect(block('IntelMap')).not.toMatch(new RegExp(`\\b${k}=`));
      expect(block('CesiumGlobe')).not.toMatch(new RegExp(`\\b${k}=`));
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run src/components/islands/mobile/mobile-layer-props.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement** `src/components/islands/mobile/mobile-layer-props.ts`:

```ts
/**
 * The layer-related props MobileMapTab hands to BOTH the 2D map and the lazy
 * 3D globe. One object, spread into both, so the globe can never again be
 * mounted without them (it was: CesiumGlobe got no staticLayers, liveLayers,
 * trackerSlug, radioCountryCodes or mapBounds on mobile — spec §4).
 */
export const LAYER_PROP_KEYS = ['trackerSlug', 'mapBounds', 'liveLayers', 'staticLayers', 'radioCountryCodes', 'emptyScopes'] as const;
export type LayerProps = {
  emptyScopes?: Record<string, string[]>;
  trackerSlug: string;
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  liveLayers?: string[];
  staticLayers?: string[];
  radioCountryCodes?: string[];
};
export function pickLayerProps(p: LayerProps & Record<string, unknown>): LayerProps {
  return { trackerSlug: p.trackerSlug, mapBounds: p.mapBounds, liveLayers: p.liveLayers, staticLayers: p.staticLayers, radioCountryCodes: p.radioCountryCodes, emptyScopes: p.emptyScopes };
}
```

- [ ] **Step 4: Use it in `MobileMapTab.tsx`.** Import `pickLayerProps`. After the destructuring (`:38-42`), add `const layerProps = useMemo(() => pickLayerProps({ trackerSlug, mapBounds, liveLayers, staticLayers, radioCountryCodes, emptyScopes }), [trackerSlug, mapBounds, liveLayers, staticLayers, radioCountryCodes, emptyScopes]);` (`emptyScopes` is the prop added in Task 10b). In `<IntelMap>` (`:100-111`), delete the five lines `mapBounds=`, `trackerSlug=`, `liveLayers=`, `staticLayers=`, `radioCountryCodes=` and add `{...layerProps}`. In `<CesiumGlobe>` (`:141-153`), add `{...layerProps}`.

- [ ] **Step 5: Run the test and the type-check.** `npx vitest run src/components/islands/mobile/mobile-layer-props.test.ts` should give 3 passed. `npx tsc --noEmit -p . 2>&1 | grep -E 'mobile/(MobileMapTab|mobile-layer-props)'` should show no new errors.

- [ ] **Step 6: OWNER GATE — real-phone check (a subagent cannot do this; stop and hand off).** The implementing agent opens the PR as draft and asks the owner to run: `npm run build && npx astro preview --host`, open `http://<lan-ip>:4321/ukraine-war/` on a phone, switch to 3D and tap "Load 3D Globe"; confirm nuclear plants, radio towers and radio stations are listed; turn on radio towers and pan for 10 s. **Second path, required:** reload, turn on radio towers in the **2D** map first, then tap "Load 3D Globe". The 2D map writes `layers=` into the URL (`IntelMap.tsx:135`) and the lazily mounted globe reads it (`CesiumGlobe.tsx:148`, `:181-187`), so towers come up already on in 3D and default globe layers not in `layers=` (satellites, flights) are off (`:165-175`); "layers start off" does not hold on this path. The owner records the phone model and fluid/not fluid for both paths in the PR, and decides: ship; hide radio layers on the mobile globe; or batch billboards first (follow-up issue). The agent does not decide this.

- [ ] **Step 7: Commit.** `git add src/components/islands/mobile && git commit -m "fix(mobile): 3D globe receives the tracker's live/static/radio layers"`

### Task 13: `staticLayers` capped at 3 in the config schema

**Files:** modify `src/lib/tracker-config.ts:46`; create `src/lib/tracker-config.test.ts`.

- [ ] **Step 1: Write the failing test** `src/lib/tracker-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TrackerConfigSchema } from './tracker-config';

const ukraine = () => JSON.parse(readFileSync('trackers/ukraine-war/tracker.json', 'utf8'));

describe('map.staticLayers', () => {
  it('accepts the current maximum of 3 (ukraine-war)', () => {
    expect(TrackerConfigSchema.safeParse(ukraine()).success).toBe(true);
  });
  it('rejects a 4th layer instead of silently ignoring it (3 fixed render slots)', () => {
    const cfg = ukraine();
    cfg.map.staticLayers = [...cfg.map.staticLayers, 'submarine-cables'];
    const r = TrackerConfigSchema.safeParse(cfg);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('staticLayers');
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run src/lib/tracker-config.test.ts`. Expected: the first case passes and the second fails.

- [ ] **Step 3: Implement.** Change `:46` to `staticLayers: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(3, 'CesiumGlobe/IntelMap render at most 3 static layers (fixed slots s0..s2); a 4th would be silently ignored').optional(),`.

- [ ] **Step 4: Run the test and the build.** `npx vitest run src/lib/tracker-config.test.ts` should give 2 passed. Then `npm run build`: it must succeed, because no tracker has more than 3 (verified: 21 trackers have 2, `ukraine-war` has 3).

- [ ] **Step 5: Commit.** `git add src/lib/tracker-config.ts src/lib/tracker-config.test.ts && git commit -m "fix(config): cap map.staticLayers at the 3 slots the renderers have"`

### Task 14: PR-2 rollout

- [ ] **Step 1:** Confirm the new specs run in CI. `e2e/geo-layers.spec.ts` is already in the explicit list at `e2e.yml:37`, so `grep -c 'geo-layers.spec.ts' .github/workflows/e2e.yml` must print `1`. No workflow change is needed.
- [ ] **Step 2:** `npm test && npm run build`. Both must be green.
- [ ] **Step 3:** `git push -u origin fix/radio-empty-state-mobile-globe && gh pr create --draft --fill`. The PR stays draft until the owner has recorded the Task 12 Step 6 result and decision.
- [ ] **Step 4:** `gh pr checks <n> --watch --fail-fast`. Merge by hand when green **and** the owner gate is answered.
- [ ] **Step 5:** After the deploy, load `https://watchboard.dev/gaza-war/` and open the layer panel **without** turning Radio towers on: the toggle must already read "none tagged" (build-time scope from the committed file), and a screen reader / DevTools Accessibility pane must expose "No radio-tagged towers in OpenStreetMap for Israel, Palestinian Territories". Repeat on a phone-sized viewport (MAP tab and 3D globe).

## PR-3 · Cleanup (a, b, e1, e2)

Branch `chore/tech-debt-cleanup`. **Task 15 waits for owner question 5** (which sort label to keep); Tasks 16-18 do not. The line numbers below are from `main` before PR-2. If PR-2 merged first, each `translations.ts` line after `:193` moves down by 1, 2, 3 or 4 (one per locale block). Locate lines with `grep -n`, not by number.

### Task 15: Duplicate i18n keys — guard test, then delete the four shadowed lines (a)

**Files:** create `src/i18n/translations-source.test.ts`; modify `src/i18n/translations.ts` (delete the first `'sidebar.sortBy'` line in each locale: `:515`, `:1221`, `:1920`, `:2619`).

- [ ] **Step 1: Write the failing test** `src/i18n/translations-source.test.ts`. The runtime object is already deduplicated, because in an object literal the last key wins, so the test has to read the source text:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** Splits translations.ts into its `const en|es|fr|pt = {` blocks and returns keys that appear twice in one block. */
function duplicateKeysByLocale(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const starts = [...src.matchAll(/^const (en|es|fr|pt)\b[^=]*= \{$/gm)];
  starts.forEach((m, i) => {
    const body = src.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index : src.length);
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const k of body.matchAll(/^\s+'([^']+)':/gm)) (seen.has(k[1]) ? dups : seen).add(k[1]);
    if (dups.size) out[m[1]] = [...dups].sort();
  });
  return out;
}

describe('translations.ts source', () => {
  const src = readFileSync('src/i18n/translations.ts', 'utf8');
  it('finds all four locale blocks', () => {
    expect([...src.matchAll(/^const (en|es|fr|pt)\b[^=]*= \{$/gm)].map(m => m[1])).toEqual(['en', 'es', 'fr', 'pt']);
  });
  it('has no key defined twice in one locale (TS1117; the later value silently wins)', () => {
    expect(duplicateKeysByLocale(src)).toEqual({});
  });
  it('the detector catches a duplicate', () => {
    expect(duplicateKeysByLocale("const en = {\n  'a': 'x',\n  'a': 'y',\n};\n")).toEqual({ en: ['a'] });
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run src/i18n/translations-source.test.ts`. Expected: the second case fails with `{ en: ['sidebar.sortBy'], es: ['sidebar.sortBy'], fr: ['sidebar.sortBy'], pt: ['sidebar.sortBy'] }`. The other two pass. If the first case fails, the block regex does not match `const es: TranslationKeys = {`; fix the regex, not the source.

- [ ] **Step 3: Delete the four shadowed lines chosen by the owner (Q5).** Default if the owner keeps today's text: delete the earlier lines and keep "Sort by" / "Ordenar por" / "Trier par" / "Ordenar por". If the owner picks E7's short labels ("Sort" / "Orden" / "Tri" / "Ordem"), delete the **later** four lines instead (`grep -n "'sidebar.sortBy': '\(Sort by\|Ordenar por\|Trier par\)'," src/i18n/translations.ts` prints 4 lines) and note the visible change in the PR. Either way, before merging, load the homepage at 1280 px and 390 px in all 4 locales (`/`, `/es/`, `/fr/`, `/pt/`) and confirm `.cc-sort-label` (`global.css:4153`) plus the two buttons fit on one line.
  ```bash
  grep -n "'sidebar.sortBy': '\(Sort\|Orden\|Tri\|Ordem\)'," src/i18n/translations.ts
  ```
  Expected output: exactly four lines (`515`, `1221`, `1920`, `2619` on `main`). Delete each of them with the Edit tool, matching the full line (`  'sidebar.sortBy': 'Sort',` and so on). Do not use `sed -i`, whose syntax differs between GNU and BSD.

- [ ] **Step 4: Run the tests and the type-check.** `npx vitest run src/i18n/` should be all green. `npx tsc --noEmit -p . 2>&1 | grep -c TS1117` must print `0`, down from `4`.

- [ ] **Step 5: Commit.** `git add src/i18n/translations.ts src/i18n/translations-source.test.ts && git commit -m "fix(i18n): drop shadowed sidebar.sortBy duplicates; guard against duplicate keys"`

### Task 16: Remove the dead `TrackerDirectory.tsx` (b) and correct CLAUDE.md

**Files:** delete `src/components/islands/TrackerDirectory.tsx`; modify `src/lib/tracker-directory-utils.ts:1-4`, `CLAUDE.md:15`, `CLAUDE.md:108`.

- [ ] **Step 1: Prove it is dead right before deleting.** Run `grep -rn "TrackerDirectory\b" src --include='*.ts' --include='*.tsx' --include='*.astro' | grep -v 'tracker-directory-utils'`. Expected: only `src/components/islands/TrackerDirectory.tsx:862`, the component's own definition. Any other hit means stop: the component is mounted somewhere.

- [ ] **Step 2: Delete it.** `git rm src/components/islands/TrackerDirectory.tsx`, then `git status --short`. Expected: exactly `D  src/components/islands/TrackerDirectory.tsx`. The path has no `[...]`, so the pathspec trap does not apply, but check anyway.

- [ ] **Step 3: Fix the utils header.** In `src/lib/tracker-directory-utils.ts:2`, change ` * Pure business logic for the TrackerDirectory component.` to ` * Pure business logic for tracker cards (CommandCenter, hero selection, /api/cards).`. The module is live: `src/pages/api/cards/[tracker].json.ts:17` and the CommandCenter islands import it. Do not rename it.

- [ ] **Step 4: Fix CLAUDE.md.**
  - Delete line 108: ``- `TrackerDirectory.tsx` — card image (event media → OSM tile)``.
  - Change line 15 from `npm run build        # Type-check + build static site to dist/ (postbuild runs pagefind indexing)` to `npm run build        # Build static site to dist/ — no type-check (run npx tsc --noEmit -p .; astro check OOMs locally). Postbuild runs pagefind + CSP hashes`.

- [ ] **Step 5: Verify.** `grep -rn "TrackerDirectory" src CLAUDE.md | grep -v tracker-directory-utils` must print nothing. `npm run build` must succeed. Also run `npm test`, because the vitest suite imports `tracker-directory-utils` and must be unaffected.

- [ ] **Step 6: Commit.** `git add -A src/components/islands/TrackerDirectory.tsx src/lib/tracker-directory-utils.ts CLAUDE.md && git commit -m "chore: remove unmounted TrackerDirectory island; CLAUDE.md build wording"`

### Task 17: `LAYER_IDS` replaces the never-run `radioTowers` adapter (e1)

**Files:** modify `scripts/geo/refresh-layers.ts:733-754` (delete), `:924`, `:930-968` (`main`), `scripts/geo/refresh-layers.test.ts`.

**Interfaces:**
- Produces: `export const LAYER_IDS: readonly string[]`, which is every id `--check` and the fetch loop know about. `ADAPTERS` keeps only the generic adapters. `main()` routes `'radio-towers'` to `runAndWriteRadioTowers`, and treats any other id without an adapter as a failure (`failed++`), never a skip.

- [ ] **Step 1: Write the failing test.** Add `LAYER_IDS` to the import list (`refresh-layers.test.ts:4-11`) and append:

```ts
describe('LAYER_IDS', () => {
  it('lists exactly the static layers the site renders, radio-towers included', () => {
    expect([...LAYER_IDS].sort()).toEqual(STATIC_LAYERS.map(l => l.id).sort());
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run scripts/geo/refresh-layers.test.ts -t LAYER_IDS`. Expected: `LAYER_IDS` is undefined, so it throws.

- [ ] **Step 3: Implement.**
  1. Delete the `radioTowers` doc comment and adapter (`:733-754`). Move the comment's first two sentences, which describe the query and the ≥5 s spacing, to the top of the existing `runAndWriteRadioTowers` doc comment (`:771`).
  2. Change `:924` to:
     ```ts
     const ADAPTERS: Adapter[] = [nuclearPlants, submarineCables, chokepoints, radioStations, radioStationsGlobal];
     /** Every layer id this script owns. radio-towers has no generic adapter: its write+health cycle is runAndWriteRadioTowers. */
     export const LAYER_IDS: readonly string[] = ['nuclear-plants', 'submarine-cables', 'maritime-chokepoints', 'radio-towers', 'radio-stations', 'radio-stations-global'];
     ```
  3. In `main()`, change the `--check` loop to `for (const id of LAYER_IDS) { if (only && id !== only) continue; const p = resolve(OUT_DIR, `${id}.geojson`); … }`, replacing `a.id` with `id` in its three messages. Change the fetch loop to:
     ```ts
     for (const id of LAYER_IDS) {
       if (only && id !== only) continue;
       if (id === 'radio-towers') {
         const { ok } = await runAndWriteRadioTowers(now);
         if (!ok) failed++;
         continue;
       }
       const a = ADAPTERS.find(x => x.id === id);
       if (!a) { console.error(`[geo] ${id} failed: no adapter registered`); failed++; continue; }
       try {
         // …existing body unchanged, using a.run(now) and id…
       } catch (e) { console.error(`[geo] ${id} failed: ${(e as Error).message}`); failed++; }
     }
     ```
  4. Also add `if (only && !LAYER_IDS.includes(only)) { console.error(`[geo] unknown --layer ${only}`); process.exit(1); }` right after `only` is parsed. Today a typo in `--layer` matches nothing and exits 0, a silent success.

- [ ] **Step 4: Run the tests and a real `--check`.** `npx vitest run scripts/geo/refresh-layers.test.ts` should be all green. `npx tsx scripts/geo/refresh-layers.ts --check; echo $?` should print six `[geo] ok …` lines and exit 0. `npx tsx scripts/geo/refresh-layers.ts --check --layer radio-tower; echo $?` should print `unknown --layer radio-tower` and exit 1.

- [ ] **Step 5: Commit.** `git add scripts/geo/refresh-layers.ts scripts/geo/refresh-layers.test.ts && git commit -m "refactor(geo): LAYER_IDS instead of a dead radio-towers adapter; reject unknown --layer"`

### Task 18: One injection path for the previous radio-towers layer (e2)

**Files:** modify `scripts/geo/refresh-layers.ts:756-760` (`RunAndWriteRadioTowersDeps`), `:796`; `scripts/geo/refresh-layers.test.ts:752-820`.

**Interfaces:** `RunAndWriteRadioTowersDeps` loses `previous`. Callers inject `readPreviousFn: (id: string) => GeoLayer | null`. `RadioTowersRunDeps.previous` (`:604`), which `runRadioTowers` takes, is unchanged.

- [ ] **Step 1: Write the failing test.** Append inside `describe('runAndWriteRadioTowers …')`:

```ts
  it('reads the previous layer only through readPreviousFn (never from disk in tests)', async () => {
    const seen: Array<GeoLayer | null> = [];
    const reads: string[] = [];
    await runAndWriteRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IR'],
      readPreviousFn: (id) => { reads.push(id); return null; },
      runFn: async (_now, d) => { seen.push(d.previous); return { layer: okLayer(), staleReasons: {} }; },
      writeFileFn: () => {}, logFn: () => {}, warnFn: () => {}, noticeFn: () => {}, errorFn: () => {},
    });
    expect(reads).toEqual(['radio-towers']);
    expect(seen).toEqual([null]);
  });
```

  Also add a type-level guard. Import `type RunAndWriteRadioTowersDeps`, which is already exported:

```ts
  it('no longer accepts `previous` as a dep (type-level; checked by tsc)', () => {
    const deps: RunAndWriteRadioTowersDeps = {
      // @ts-expect-error `previous` was removed — inject readPreviousFn instead
      previous: null,
    };
    expect(deps).toBeDefined();
  });
```

  Also add `readPreviousFn: () => null,` to the four existing calls at `:752-811`, so none of them reads `public/geo/layers/radio-towers.geojson`.

- [ ] **Step 2: Run it and watch it fail.** Vitest does not type-check, so the red signal comes from tsc: `npx tsc --noEmit -p . 2>&1 | grep refresh-layers.test`. Expected: `error TS2578: Unused '@ts-expect-error' directive.`, which proves `previous` is still accepted. `npx vitest run scripts/geo/refresh-layers.test.ts` is already green; the runtime behaviour does not change.

- [ ] **Step 3: Implement.** Delete the two `previous` lines from `RunAndWriteRadioTowersDeps` (`:758-759`: the doc comment and `previous?: GeoLayer | null;`). Change `:796` to `const previous = readPreviousFn('radio-towers');`.

- [ ] **Step 4: Verify.** `npx tsc --noEmit -p . 2>&1 | grep refresh-layers` should print nothing. `npx vitest run scripts/geo/refresh-layers.test.ts` should be all green. `grep -n "'previous' in deps" scripts/geo/refresh-layers.ts` should print nothing.

- [ ] **Step 5: Commit.** `git add scripts/geo/refresh-layers.ts scripts/geo/refresh-layers.test.ts && git commit -m "refactor(geo): drop the 'previous' in deps idiom; tests inject readPreviousFn"`

### Task 19: PR-3 rollout

- [ ] **Step 1:** `npm test && npm run build`. Both must be green.
- [ ] **Step 2:** `git push -u origin chore/tech-debt-cleanup && gh pr create --fill`, then `gh pr checks <n> --watch --fail-fast`, then merge by hand when green.
- [ ] **Step 3:** After the merge, run `gh workflow run refresh-radio-layers.yml -f stations=true -f towers=false` (the inputs are defined at `refresh-radio-layers.yml:8-20`). A stations-only run is enough: its `--check --layer radio-stations` steps (`:45-46`) now go through `LAYER_IDS`, and the run must be green. Then run `git log origin/main -1 --format=%s -- public/geo/layers/radio-stations.geojson` and confirm a commit dated today.

## PR-4 · Leaflet radio icon cost (e3)

Branch `perf/leaflet-radio-icons`. This is a behaviour-preserving refactor, so the "red" step is an e2e spec that pins the current rendering, written first and green before the change. Leaflet needs `window` and cannot be imported under vitest's node environment.

### Task 20: One `divIcon` per layer, then measure

**Files:** modify `src/components/islands/GeoLayersLeaflet.tsx:1-3`, `:43-55`; `e2e/geo-layers.spec.ts`.

**Interfaces:** module-private `function radioDivIcon(id: string, svg: string): L.DivIcon`, cached per layer id.

- [ ] **Step 1: Pin today's rendering with an e2e spec.** Append inside `test.describe('E5 geo layers on the 2D map', …)`:

```ts
  test('radio towers render as radio icons on the Ukraine map', async ({ page }) => {
    // Fixture, not live OSM data: e2e runs on every push to main, including the monthly refresh bot commit.
    await page.route('**/geo/layers/radio-towers.geojson', r => r.fulfill({ path: 'e2e/fixtures/radio-towers-ua.geojson', contentType: 'application/geo+json' }));
    await page.goto('./ukraine-war/?lat=49&lon=31&zoom=6');
    const map = page.locator('.leaflet-container:visible').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    await page.locator('.map-layers-toggle:visible').first().click();
    await page.locator('.map-layers-panel:visible').first().locator('[data-layer="radio-towers"]').click();
    const icons = page.locator('.leaflet-container:visible .leaflet-static-radio-towers-pane .radio-map-icon');
    await expect.poll(() => icons.count(), { timeout: 20_000 }).toBeGreaterThan(10);
    await expect(icons.first().locator('svg')).toBeAttached();
  });
```

- [ ] **Step 2: Run it before changing any code.** `npx playwright test e2e/geo-layers.spec.ts -g "radio icons" --reporter=list`. Expected: **pass**. First create `e2e/fixtures/radio-towers-ua.geojson`: a valid `GeoLayer` (`_provenance.id: 'radio-towers'`, `countries.UA: {count: 20, status: 'fresh', …}`) with 20 point features around 49°N 31°E, each `properties.countryCode: 'UA'` (generate once with `node -e` and commit it). If the spec fails, stop and investigate: the premise is wrong.

- [ ] **Step 3: Implement.** In `GeoLayersLeaflet.tsx`, above the component:

```ts
/** One DivIcon per radio layer id, created lazily and reused by every marker in that layer.
 *  Leaflet still makes one DOM node per marker (L.Marker#_initIcon clones nothing — it calls
 *  icon.createIcon() per marker), so this saves ~500 option objects + SVG string copies per
 *  toggle, not DOM; the DOM cost is what Step 5 measures. */
const radioIconCache = new Map<string, L.DivIcon>();
function radioDivIcon(id: string, svg: string): L.DivIcon {
  let icon = radioIconCache.get(id);
  if (!icon) {
    icon = L.divIcon({ html: svg, className: 'radio-map-icon', iconSize: [22, 22], iconAnchor: [11, 11] });
    radioIconCache.set(id, icon);
  }
  return icon;
}
```

  Then change `:54` to `? L.marker(latlng, { icon: radioDivIcon(id, radioSvg), pane: `static-${id}` })`.

- [ ] **Step 4: Run the e2e again.** Run `npx playwright test e2e/geo-layers.spec.ts --reporter=list` and expect everything green, including the Step 1 spec. Then run `npx tsc --noEmit -p . 2>&1 | grep GeoLayersLeaflet` and expect no output.

- [ ] **Step 5: Measure. This step decides whether a follow-up is needed.** Run `npm run build && npx astro preview`. In Chrome DevTools, open Performance with CPU throttling at 4×. Load `/nato-airspace-incursions/` (PL 317 + RO 101 + Baltic towers, about 470 in total) and turn on Radio towers and Radio stations. Record 10 s of continuous pan and zoom. Repeat on `/southeast-asia-escalation/` (PH 373). Put the median FPS and the longest task for both pages in the PR description.
  - Median ≥ 50 fps: done. No follow-up.
  - Median < 50 fps: open an issue titled "perf: radio-towers as canvas circleMarkers". Its body must contain the numbers and the proposal from spec §5 e3: towers as `L.circleMarker` with `renderer: L.canvas()`, stations keeping the icon, and no clustering (a spec non-goal). Do not implement that in this PR.

- [ ] **Step 6: Commit and ship.** `git add src/components/islands/GeoLayersLeaflet.tsx e2e/geo-layers.spec.ts e2e/fixtures/radio-towers-ua.geojson && git commit -m "perf(map): share one radio DivIcon per layer"`, then `git push -u origin perf/leaflet-radio-icons && gh pr create --fill`, then `gh pr checks <n> --watch --fail-fast`, then merge by hand when green.

## Open questions for the owner

None of these blocks PR-0. Q6 blocks Task 3 and the telegram-notify part of Task 4; Q7 confirms a provisional PR-1 default; Q5 blocks Task 15; the Task 12 owner gate blocks merging PR-2. Questions 1, 2 and 8 decide the shape of PR-2 (defaults are given).

1. **Broaden the layer's meaning?** (spec Q1) Default: **no**. "Radio towers" stays strict, and the empty state explains the gap. A separate "Broadcast towers (TV + radio)" layer would need its own spec.
2. **C2 or C1 for `gaza-war`, `israel-palestine` and `yemen-conflict`?** (spec Q2) Default: **C2** (Tasks 8-10). The C1 alternative is described at the top of PR-2.
3. **Residual Telegram re-send** (spec Q3). After PR-1 it is limited to "push failed 5 times with backoff, and a human then re-runs despite the private alert and the `DO NOT RE-RUN` error text". A `bot-state` branch (F3b) would close it completely. It is not planned here.
4. **`tsc` in CI** (spec Q4). Not planned. After Task 15 the baseline is 113 errors, and a separate workstream should bring it to 0 before `npx tsc --noEmit -p .` joins `test.yml`.
5. **Sort label text** (spec Q5) — **blocks Task 15.** History: a9e5b68d1 (2026-04-12) added "Sort by"; its consumer went away in the #116 sidebar redesign (679afb64c, 2026-04-23); E7 (3923c8e06, 2026-09-07) re-added the key as "Sort" / "Orden" / "Tri" / "Ordem" for the compact `.cc-sort-label` in `SidebarPanel.tsx:693`, without noticing the orphan. So the long text wins today by accident, and E7's author chose the short one. Keep the long (no visible change) or the short (E7's intent)?
6. **The public channel has had no per-update post since 2026-08-09 — first question, blocks Task 3.** Both callers of `hourly-post.ts` (the only CI writer of `today-updates.json`) are `if: false` since X posting was retired (`hourly-scan.yml:594`, `:682`); `telegram-channel.ts` reads only that manifest. Re-wire (move `saveManifest` out of the disabled X step) or retire `telegram-notify.yml`? Only the light-scan alerts and the daily video reach the channel today.
7. **Uncertain Telegram sends (timeout, network error, 5xx): lose or risk a duplicate?** The plan's provisional default logs them as sent (never retried) and alerts the private ops chat with the keys. Alternatives: retry once after a delay (risking a duplicate), or hold them for manual follow-up. This is a product decision, not an implementation detail.
8. **Partial emptiness.** `sahel-insurgency` shows Mali's 74 towers and says nothing about BF and NE (both fresh zeros). Default: no hint (all-or-nothing rule). Alternative: a tooltip "No radio-tagged towers for Burkina Faso, Niger" when some but not all codes are fresh zeros.
9. **Lost hourly updates since 2026-09-23.** Task 2 Step 9 lists the trackers whose hourly updates never reached `main`. Wait for the nightly `update-data` backfill, or dispatch it now for those slugs?

## Self-review

- **Spec coverage.** §1 → Task 15 (+ CLAUDE.md:15 in Task 16). §2 → Task 16. §3 C2 + notice → Tasks 8-11 and 10b (build-time scopes). §4 `layerProps` + `.max(3)` → Tasks 12-13. §5 e1/e2/e3 → Tasks 17/18/20. §6: F1 → Task 4; F2 → Tasks 3, 4b (light scan) and 5; F3a + private alert → Tasks 1, 4 and 6; F3c (Bluesky) → Task 5; F4 → Task 6; F5/N1 → Task 2 (PR-0); daily-video dirty tree → Task 2b (PR-0); re-run SHA → `ref: main` in Tasks 4-6; F6/N3 → Task 3; N2 → Task 6. §7 is dropped, with evidence.
- **Deviations from the spec, and why.**
  - N1 is a live outage (dead resolver + loud failure that loses updates), so its fix ships alone as PR-0 and the two flag fixes ship together.
  - The conflict policy unions JSON arrays instead of taking one whole side, because whole-file `--ours`/`--theirs` silently drops the other side's entries (metrics index on every run; events/digests when nightly and hourly overlap).
  - F6 distinguishes `rejected` from `unknown` instead of "`messageId != null`". Otherwise a timeout that did publish would be re-sent.
  - Component render tests are replaced by pure/source-scan tests plus Playwright, because vitest has no DOM.
  - e1 uses `LAYER_IDS` rather than `custom: true`. That is simpler and also rejects unknown `--layer` values.
  - F4 moves Telegram into a small lib rather than into `post-video-social.ts`, so it keeps the caption snapshot and the different video-file choice of each job.
- **Type consistency.**
  - `SendOutcome`/`classifyTelegramResponse` (Task 3) are reused unchanged by Task 6.
  - `emptyScopeReason(layer, codes, meta)` has the same argument order in Tasks 8, 9 and 10.
  - `emptyCodes?: string[]` is the single field name across IntelMap, MapLayerToggles, LayerResult, CesiumGlobe and CesiumControls.
  - `LAYER_PROP_KEYS` (Task 12) matches the `MobileMapTab` props at `:22-27`.
- **Silent-success checks.** Every rollout step verifies an artefact (a commit on `main`, a tooltip on the live page, `--check` output), not just a green run. Task 17 also removes one silent success of its own: `--layer <typo>` exiting 0.
