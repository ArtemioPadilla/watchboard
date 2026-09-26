# Community comments (Bluesky reply threads) — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show readers, inside a tracker page, what people are saying on Bluesky about that tracker (one reply thread per tracker at the tracker's own cadence, opened by the existing bot account), in a collapsed "Community" panel that is visually, structurally and in ingestion separated from tiered data, with no new backend, no baked thread file, no cookies, no third-party script or iframe, and honest degradation.

**Architecture:** A scheduled script (`scripts/community-threads.ts`) posts a root post for each eligible tracker whose current thread is missing or older than its cadence (daily when `updateIntervalDays ≤ 1`, weekly otherwise). Every root carries the marker `watchboard.dev/{slug}/`. The script writes **nothing** to the repo: idempotency and verification both read the bot's own public `app.bsky.feed.getAuthorFeed`. In the browser, `CommunityPanel.tsx` stays collapsed and makes no request until opened; then it reads `getAuthorFeed` (registry entry `community-bluesky-roots`), picks the newest root for its slug with `findRoot()`, and reads `getPostThread` (registry entry `community-bluesky`), both through `useLiveSource` with cache keys prefixed `community:`. A pure `parseThread()` turns the thread into `CommunityComment[]` (a type with no `tier`/`source`/`pole`/`contested`) and filters hidden replies, post **and author** moderation labels as a logged-out Bluesky client would, and the owner's blocklist. Status is plain body-font text, never `SourceStatusChip`. Both registry entries use a new `renderer: 'panel'`, so the existing CSP test enforces `connect-src` and map/globe never offer them; `collectDegraded()` ignores `community:` keys. The build-time kill switch `PUBLIC_COMMUNITY_ENABLED` is wired from a repo variable into `deploy.yml` and a Docker `ARG` (default `false` in the image). Nothing is written to `trackers/*/data/`; nothing is baked into Pagefind, RSS, the API, MCP, video or social queue.

**Tech Stack:** Astro 5 (static, `output: 'static'`), React 19 islands, TypeScript, Zod, `@atproto/api` ^0.15.27 (scripts only, never in the browser bundle), Vitest 4 (`environment: 'node'`, no DOM library, `vitest.config.ts:10-11`), Playwright (`playwright.config.ts`, run by `.github/workflows/e2e.yml:37`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-24-live-comments-design.md` (option B, section 6; revised after adversarial review — see its "Adversarial review log")

---

## Gate: nothing below Task 0 starts without the owner

The 09-21 spec excluded live chat on purpose
(`docs/superpowers/specs/2026-09-21-radio-layer-and-community-design.md:26-29`:
"requiere backend y rompe el modelo de tiers — mensajes serían Tier 4 sin
verificar"). This plan implements the spec's answer to that objection, but
**Tasks 1-17 are all `BLOCKED ON OWNER DECISION Q1`**. If the owner answers
Q1 with (b) "keep the exclusion", execute only the baseline at the end of
"Open questions for the owner" and delete
this plan. If the answer is (c) "own chat on Durable Objects", this plan does
not apply; a new spec is needed. If Q3 picks (c) or (d) (reuse other posts),
Tasks 8-9 are re-planned, not improvised.

Each task header repeats its blocking questions. An executor that finds an
unanswered question in a task header stops and reports; it does not guess.
**No question has a default in this plan**; where a value is needed to write
code, the code reads it from an env var or config that the owner sets, and
refuses to run without it.

## Global Constraints

- **Comments have no tier.** `CommunityComment` must never have the keys `tier`, `source`, `sourceTier`, `pole`, `contested`, `confidence`, `verified`. Enforced by Task 4.
- **Module boundary.** Comment code lives only under `src/lib/community/` and `src/components/islands/community/`. `src/lib/schemas.ts`, anything under `scripts/`, `mcp/`, `src/pages/api/`, `src/pages/**/rss*.ts`, `src/pages/feeds*.ts` must not import `lib/community/`. Exactly one exception, named in the test: `scripts/community-metrics.ts` (read-only, prints counts, no `writeFileSync`). The pointer-only helpers scripts may import live in `src/lib/community-shared.ts` (no comment content).
- **Registry ids:** `community-bluesky-roots` (`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={actor}&filter=posts_no_replies&limit=100`, TTL `300_000`) and `community-bluesky` (`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri={uri}&depth=1&parentHeight=0`, TTL `60_000`). Both `kind: 'feed'`, **renderer `'panel'`** (new enum value), `cors: true`, `scope`: the enabled slugs are not known to the registry, so `scope: []` and `/sources/` lists `panel` entries in their own section (Task 5).
- **Bot account:** `COMMUNITY_ACTOR = 'watchboard.bsky.social'` in `src/lib/community-shared.ts`; if Q3 picks a separate account, this constant changes in the same PR as the secrets.
- **Marker and cadence:** `rootMarker(slug) = 'watchboard.dev/' + slug + '/'`; `threadCadenceDays(updateIntervalDays) = updateIntervalDays <= 1 ? 1 : 7`; the panel accepts a root up to `2 × cadence` days old.
- **Cache keys:** `community:roots:{slug}` (the parse picks that slug's root) and `community:thread:{uri}`; TTLs only from the registry via `getLiveLayer(...)` as `src/components/islands/shared/useAlerts.ts:7` does. No literal TTL.
- **`isEmpty: () => false`** on both fetches: a thread with no replies is real data (`src/lib/live-source.ts:54-55`).
- **Limits:** `COMMUNITY_MAX_COMMENTS = 50` (most recent 50, shown oldest first), reply depth 1 only, text shown as plain text, no images, no link previews, links get `rel="nofollow ugc noopener noreferrer"` and `target="_blank"`.
- **Hidden labels (logged-out reader):** `COMMUNITY_HIDE_LABELS = ['!hide', '!warn', '!no-unauthenticated', 'porn', 'sexual', 'nudity', 'graphic-media', 'gore', 'nsfl', 'doxxing', 'dmca-violation', 'spam']`, checked on `post.labels` **and** `post.author.labels`; a label with `neg: true` cancels.
- **Order:** chronological only. No like/repost counts rendered anywhere.
- **Thread label:** by date only (`Thread · {date}`), no "today"/"yesterday" (UTC vs reader-local day).
- **Blocklist:** `src/data/community/blocklist.json`, `{ "dids": string[] }`, DIDs only, never text, never a reason. Bundled at build time (fail-closed; see Deviations). Reasons live in the owner's private log (Q6).
- **Eligibility, one predicate:** `communityEnabledFor(config, flag)` in `src/lib/community-shared.ts`, used by the pages **and** the bot script. `'false'` → off; `'force'` → every `active` tracker (Playwright only); otherwise `status === 'active' && community.enabled === true`. `draft` and `archived` never.
- **Kill switch wiring:** `deploy.yml` build env gets `PUBLIC_COMMUNITY_ENABLED: ${{ vars.PUBLIC_COMMUNITY_ENABLED }}`; the `Dockerfile` gets `ARG PUBLIC_COMMUNITY_ENABLED=false` + `ENV`; `community-threads.yml` passes the same variable to the script. Tested in Task 6.
- **Panel status:** plain text in the body font. The panel must not render `SourceStatusChip`, `.source-chip`, `.freshness-indicator`, `.t1`-`.t4`, or any monospace font. Enforced by Task 4 (source) and Task 14 (rendered, computed style).
- **No analytics:** no PostHog call, no `localStorage`/`sessionStorage`/cookie in any community file, unless Q14 = yes (then Task 11 is re-planned). Enforced by Task 4.
- **Palette:** panel CSS must not reference `--tier-*`, `--accent-red`, `--accent-amber`, `--accent-green` or the mono data font.
- **Vitest is node-only** (`vitest.config.ts:10`): no React rendering in unit tests. Component behaviour is tested through a pure view model (Task 11) plus Playwright (Task 14). Node-side tests may use `__dirname` (Vitest shims it); **Playwright specs are ESM** (`package.json:3` `"type": "module"`) and must use `new URL('…', import.meta.url)` as `e2e/geo-layers.spec.ts:9` does.
- **Env-var table:** every task that adds or moves a `process.env.X` read ends with `npx tsx scripts/list-env-vars.ts --write docs/self-hosting.md` and `npx tsx scripts/list-env-vars.ts --check docs/self-hosting.md` (the check is a step of `.github/workflows/test.yml:35-36`). Env reads stay literal `process.env.X` so the scanner (`scripts/list-env-vars.ts:23`) sees them.
- **Type check:** `npx astro check` OOMs locally. Use `npx tsc --noEmit -p . 2>&1 | grep -E 'community|live-layers|degraded-sources|tracker-config|bluesky|sources.astro'` and require zero lines for touched files.
- **Silent-success rule** (`docs/silent-failure-patterns.md`): every step that produces an artefact re-reads it where the reader will read it (the public AppView for posts, the built HTML for pages) and counts; every test asserts on the artefact, not the exit code.
- **Git:** work on a feature branch (`feat/community-comments`), never on `main`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Paths with `[tracker]` must be quoted and passed with `--literal-pathspecs` or `git add -- "src/pages/[tracker]/index.astro"` fails silently (memory: git pathspec bracket trap).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docs/adr/0003-community-comments-carry-no-tier.md` | Create | Decision record: reverses (or not) the 09-21 exclusion, "no tier" rule, new source, 50-hide cap and escalation, retirement criterion |
| `src/lib/community/types.ts` | Create | `CommunityComment`, limits, hidden-label list |
| `src/lib/community/parse-thread.ts` | Create | `parseThread()`, `postUrl()` — raw `getPostThread` JSON → filtered comments |
| `src/lib/community/parse-thread.test.ts` | Create | Filters (post + author labels), order, limit, malformed input |
| `src/lib/community/fixtures/thread.json` | Create | Hand-written `getPostThread` fixture (no real user data) |
| `src/lib/community/fixtures/author-feed.json` | Create | Hand-written `getAuthorFeed` fixture (roots for two slugs, one stale, one digest) |
| `src/lib/community-shared.ts` | Create | Pointer-only helpers shared by script and panel: `COMMUNITY_ACTOR`, `rootMarker`, `threadCadenceDays`, `findRoot`, `communityEnabledFor`, `communityEnvFlag` |
| `src/lib/community-shared.test.ts` | Create | Marker, cadence window, newest wins, eligibility truth table |
| `src/lib/community/separation.test.ts` | Create | Structural guards (no tier keys, import boundary + one named exception, no ingestion, no storage, no tier palette, no source chip) |
| `src/lib/live-layers.ts` | Modify | `'panel'` renderer, two `community-*` entries, `layersForTracker` excludes panel |
| `src/lib/live-layers.test.ts` | Modify | Assert both entries exist and are `renderer: 'panel'` |
| `src/lib/degraded-sources.ts` | Modify | Skip `community:` keys |
| `src/lib/degraded-sources.test.ts` | Modify | Test the skip |
| `src/pages/sources.astro` | Modify | Data table excludes `panel`; own "Community (not a source)" section |
| `src/layouts/BaseLayout.astro` | Modify | `connect-src` += `https://public.api.bsky.app` (line 97) |
| `public/_headers` | Modify | same (line 16) |
| `src/lib/tracker-config.ts` | Modify | optional `community: { enabled }` |
| `.github/workflows/deploy.yml` | Modify | `PUBLIC_COMMUNITY_ENABLED: ${{ vars.PUBLIC_COMMUNITY_ENABLED }}` in the build env |
| `Dockerfile` | Modify | `ARG PUBLIC_COMMUNITY_ENABLED=false` + `ENV` before `npm run build` |
| `docs/self-hosting.md` | Modify | Regenerated env-var table; one paragraph on the Docker default |
| `scripts/lib/bluesky-client.ts` | Create | `getBlueskyAgent()` moved out of `scripts/bluesky-post.ts:47-58`, literal `process.env.BLUESKY_*` default |
| `scripts/lib/bluesky-client.test.ts` | Create | Missing credentials return `null`, no network |
| `scripts/bluesky-post.ts` | Modify | import the moved function |
| `scripts/community-threads.ts` | Create | Root post per eligible tracker by cadence, threadgate, re-read public feed |
| `scripts/community-threads.test.ts` | Create | Threadgate never `allow: []` by accident; idempotent against the feed; cadence; unverified post fails |
| `scripts/community-metrics.ts` | Create (Task 16) | Day-60 read-only count of visible replies per root (the one allowed `lib/community` import) |
| `.github/workflows/community-threads.yml` | Create | Manual dispatch until Q5 (Task 16 adds the cron); own concurrency group; `notify-failure` |
| `src/lib/community/workflow.test.ts` | Create | Dispatch-only, no commit step, flag passed, failure alert to the private chat |
| `src/i18n/translations.ts` | Modify | `community.*` keys + `layers.communityBluesky*` × 4 locales |
| `src/lib/community/i18n.test.ts` | Create | Keys present and translated in every locale; contract carries the Q6 contact |
| `src/lib/community/view.ts` | Create | `communityPanelView()`, `panelStatusText()`, `splitLinks()`, `formatCommentTime()` |
| `src/lib/community/view.test.ts` | Create | Every panel state; error is never "0 comments" |
| `src/components/islands/community/CommunityPanel.tsx` | Create | The island |
| `src/styles/community.css` | Create | Panel frame (dashed border, neutral, body font) |
| `src/pages/[tracker]/index.astro`, `src/pages/{es,fr,pt}/[tracker]/index.astro` | Modify | Mount where Q12 decides (desktop mount after `<SourceLegend />` is Task 12; mobile/hero are re-planned tasks) |
| `src/lib/community/mount.test.ts` | Create | Gated, `client:visible`, placement |
| `src/pages/about.astro` | Modify | "Community comments" section (contract of spec 3.4, honest retention) |
| `src/lib/community/about.test.ts` | Create | Contract wording, real Q6 address, blocklist holds DIDs only |
| `src/data/community/blocklist.json` | Create | `{ "dids": [] }` |
| `e2e/community-panel.spec.ts` | Create | Collapsed by default, no request until open, list/empty/error, no source chip or mono font, CSP clean |
| `.github/workflows/e2e.yml` | Modify | add the spec to line 37, `PUBLIC_COMMUNITY_ENABLED: 'force'` in the step env |
| `playwright.config.ts` | Modify | `PUBLIC_COMMUNITY_ENABLED: 'force'` in `webServer.env` (`:35`) |
| `tests/live/community-bluesky.live.test.ts` | Create | Real AppView returns 200 + CORS for both endpoints; parsers accept the shapes |
| `trackers/{pilot slugs}/tracker.json` | Modify | `"community": { "enabled": true }` (Task 16 only) |

## Deviations from the spec (and why)

1. **Blocklist location.** The spec's first draft put it in `public/_community/blocklist.json`, fetched at runtime. A separate fetch can fail, and "blocklist failed to load, show everything" is a silent failure that exposes blocked accounts. Plan: `src/data/community/blocklist.json`, imported by the island at build time. A human merge to `main` triggers `deploy.yml` on `push` (only `GITHUB_TOKEN` pushes do not), so a blocklist PR reaches the site on merge. Self-hosted images freeze it, hence the Docker default `false` (Q13).
2. **Component test.** Vitest runs in `environment: 'node'` with no DOM library (`vitest.config.ts:10`), and every island in the repo is tested through pure helpers. Plan: all state logic in `src/lib/community/view.ts` (unit-tested) and the rendered behaviour in `e2e/community-panel.spec.ts` (Playwright, with `page.route` mocks, same pattern as `e2e/dossier.spec.ts:10-12`).
3. **`/about` in 4 locales.** The repo has only `src/pages/about.astro` (English); `src/pages/es|fr|pt` contain only `[tracker]/` and `index.astro`. Plan: the English `/about` section plus the translated contract **with the Q6 removal contact** inside the panel (`community.contract`), which is where every locale reader sees it.
4. **No thread file.** The spec's first draft baked root pointers into `public/_community/threads.json`. Review showed that a `GITHUB_TOKEN` push never deploys (`.github/workflows/deploy.yml:32-37`), so the thread would reach Pages hours late, and a Docker image would lose it for good after ~48 h. Plan: the panel discovers the root at runtime with `getAuthorFeed`; the script never commits.
5. **Degraded sources.** Without the skip, a Bluesky outage would appear in `DegradedSources` (mounted under the KPI strip, `src/pages/[tracker]/index.astro:111`) next to the tracker's data feeds, the mixing the spec forbids. Plan: `collectDegraded()` skips `community:` keys; the panel shows its own status as text.
6. **`/sources/` page.** `src/pages/sources.astro:34-43` renders every `LIVE_LAYERS` entry under "Data sources" with scope "all trackers" when `scope` is empty. Plan: filter `renderer === 'panel'` out of that table and list those entries in their own section "Community (not a source)" (Q11).
7. **Threadgate not in the same atproto commit.** `agent.post()` does not accept a threadgate, and an `applyWrites` batch needs a TID generator from `@atproto/common-web`, only a transitive dependency. Plan: policy `everyone` writes no threadgate (undefined `allow` = anyone may reply); `followers`/`closed` create it right after the post with the post's rkey; if that write fails the post is deleted, and if the delete fails too the run is red with the URI.
8. **Placement is the owner's (Q12).** Task 12 implements only the desktop mount after `<SourceLegend />`; a mobile tab in `MobileTabShell` (`src/pages/[tracker]/index.astro:154-175`) or a hero affordance are separate tasks planned after Q12, and the pilot clock (Task 16) does not start until the chosen placement ships.
9. **Map and globe never see the feed.** `layersForTracker()` feeds the map (`src/components/islands/IntelMap.tsx:194`) and globe (`src/components/islands/CesiumGlobe/CesiumGlobe.tsx:749`). Plan: a new `renderer: 'panel'` value, and `layersForTracker()` excludes it (Task 5).
10. **Cadence, not daily.** The spec's first draft opened a thread per tracker per day; every suggested low-polarisation pilot tracker has `"updateIntervalDays": 7`. Plan: `threadCadenceDays()`.

## Task 0 — Pre-flight verification (not gated, no production code)

Runs before the owner decides, so Q1 is answered with facts. Writes nothing to the repo; results go into the ADR in Task 1.

**Files:** none. **Consumes:** network. **Produces:** five facts recorded in the task report (CORS on both endpoints, threadgate semantics, the 50-hide cap, anonymous `hiddenReplies`, anonymous labels).

- [ ] **Step 1: CORS on the read endpoint.** A plan-writing probe on 2026-09-24 got `HTTP/2 200` and `access-control-allow-origin: *` from `getAuthorFeed`; `getPostThread` must be checked too.

```bash
URI=$(curl -s 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=watchboard.bsky.social&limit=1' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).feed[0].post.uri))')
echo "$URI"
curl -s -D - -o /dev/null -H 'Origin: https://watchboard.dev' \
  "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$URI")&depth=1&parentHeight=0" \
  | grep -iE '^HTTP|access-control-allow-origin|ratelimit'
```

Expected: `HTTP/2 200` and `access-control-allow-origin: *` (or `https://watchboard.dev`). Also repeat with `-H 'Origin: http://localhost:8080'` (the Docker image origin) — must also be allowed.

- [ ] **Step 2: Threadgate shape.** Confirm the installed lexicon still says empty `allow` means "nobody" and undefined means "everyone":

```bash
sed -n 6,18p node_modules/@atproto/api/dist/client/types/app/bsky/feed/threadgate.d.ts
```

Expected: the comment `If value is an empty array, no one can reply. If value is undefined, anyone can reply.` and a `hiddenReplies?: string[]` field (both present on 2026-09-24). Then record the hide cap:

```bash
grep -n -A3 'hiddenReplies: {' node_modules/@atproto/api/dist/client/lexicons.js | grep maxLength
```

Expected: `maxLength: 50` (at `lexicons.js:7761` on 2026-09-24). This number goes into the ADR and the runbook (spec 7, escalation after ~40 hides).

- [ ] **Step 3: Threadgate is visible to anonymous readers.** Hide one reply on a throwaway post from the bot account in the Bluesky app, then:

```bash
curl -s "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=<that post uri>&depth=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).thread;console.log(JSON.stringify(t.post.threadgate?.record?.hiddenReplies))})'
```

Expected: an array containing the hidden reply's URI. If it is missing, the site cannot honour the owner's hides: stop and raise **Q8**.

- [ ] **Step 4: Labels reach anonymous readers.** The filters in Task 2 only work if an unauthenticated AppView response carries both post labels and account labels. Find one post with a moderation or self label and one account with an account-level label (e.g. the bot itself carries the self-label `bot`, visible on 2026-09-24), then:

```bash
curl -s 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=watchboard.bsky.social&limit=1' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).feed[0].post;console.log("author.labels",JSON.stringify((p.author.labels||[]).map(l=>l.val)))})'
curl -s "https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=<uri of a post known to carry a label>" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).posts[0];console.log("post.labels",JSON.stringify((p.labels||[]).map(l=>l.val)))})'
```

Expected: `author.labels ["bot"]` and a non-empty `post.labels`. Empty arrays mean labels are stripped for anonymous readers: stop and raise **Q8**.

- [ ] **Step 5: `getAuthorFeed` also serves CORS.** The panel reads it (registry `community-bluesky-roots`):

```bash
curl -s -D - -o /dev/null -H 'Origin: http://localhost:8080' \
  'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=watchboard.bsky.social&filter=posts_no_replies&limit=100' \
  | grep -iE '^HTTP|access-control-allow-origin'
```

Expected: `HTTP/2 200` and `access-control-allow-origin: *`.

- [ ] **Step 6: Decide.** All pass → report "pre-flight OK" to the owner with Q1 and the audience baseline of spec section 1 (7 followers, 97/100 posts without replies). Any fails → report which, and do not start Task 1 (spec 6/Paso 0).

## Task 1 — ADR-0003 "Community comments carry no tier"

**`BLOCKED ON OWNER DECISION Q1`** (and Q8 if Task 0 failed).

**Files:** Create `docs/adr/0003-community-comments-carry-no-tier.md`.
**Consumes:** Task 0 results; the owner's answers to Q1-Q7, Q10. **Produces:** an accepted ADR every later task cites.

- [ ] **Step 1: Write the ADR** from the template `docs/adr/0000-template.md` (Spanish, as ADR-0001/0002):

```markdown
# ADR-0003: Los comentarios de la comunidad no tienen tier

**Estado:** Aceptado
**Fecha:** <fecha de la decisión>
**Autores:** Artemio Padilla

## Contexto

El spec 2026-09-21 excluyó el chat en vivo
(`docs/superpowers/specs/2026-09-21-radio-layer-and-community-design.md:26-29`)
porque los mensajes serían Tier 4 sin verificar. El dueño pidió "un chat en
la app para que la gente comente lo que está pasando". El spec
`2026-09-24-live-comments-design.md` propone hilos de respuestas de Bluesky.
Verificación previa (Task 0): <pegar resultados: CORS de ambos endpoints, threadgate, límite de hiddenReplies, hiddenReplies y etiquetas sin sesión>.
Línea base de audiencia (2026-09-24): 7 seguidores, 97 de los últimos 100
posts sin respuestas.

## Decisión

Se revierte la exclusión del 09-21 en la forma de la opción B: un hilo de
Bluesky por tracker con la cadencia del tracker (diaria si
`updateIntervalDays ≤ 1`, semanal si no), descubierto y leído en el
navegador desde `https://public.api.bsky.app`, en un panel propio.

1. Los comentarios **no tienen tier**. No son Tier 4: no pasaron por ningún
   criterio editorial. El tipo `CommunityComment` no tiene `tier`, `source`,
   `pole` ni `contested` (test `src/lib/community/separation.test.ts`).
2. Nunca se escriben en `trackers/*/data/`, ni en RSS, API, MCP, video,
   cola social ni prompts. No se hornea nada del hilo: el panel encuentra
   el post raíz en `getAuthorFeed` por el marcador `watchboard.dev/{slug}/`.
3. Nuevas fuentes en `LIVE_LAYERS`: `community-bluesky-roots` y
   `community-bluesky` (renderer `panel`, CORS abierto). Licencia:
   contenido de sus autores bajo los términos de Bluesky; Watchboard solo
   muestra y enlaza.
4. Política de respuestas: <Q4>. Origen de los posts raíz: <Q3>. Idioma del post: <Q10>.
   Colocación del panel: <Q12>. Medición de alcance: <Q14>.
5. Moderación: `hiddenReplies` admite como máximo 50 entradas por hilo;
   pasadas ~40, se cierra el hilo (`allow: []`), después se borra la raíz,
   después se apaga el tracker o todo con `PUBLIC_COMMUNITY_ENABLED=false`.
6. Retirada: si tras 60 días **de panel visible donde decidió Q12** los
   hilos de <Q5> no alcanzan <Q7> respuestas visibles, se borra el panel,
   se para el workflow y este ADR pasa a Retirado.

## Consecuencias

- Un host más en `connect-src`; ningún script, iframe ni cookie de terceros.
- El dueño modera a diario los hilos piloto (ocultar vía threadgate,
  lista de bloqueo `src/data/community/blocklist.json`, motivos en un
  registro privado, nunca en el repo).
- La imagen Docker trae el panel apagado por defecto (<Q13>).
- Exigir cuenta de Bluesky deja fuera a quien no quiera una (Q2).
- La fase 2 (comentar desde la app u opción C) necesita otro spec y ADR.

## Alternativas consideradas

- No hacer nada / enlazar fuera: no muestra la conversación en la app.
- giscus: `script-src` y `frame-src` de terceros; público de GitHub.
- Worker + Durable Objects + D1: Watchboard pasa a ser prestador de
  alojamiento (DSA arts. 11, 12, 16, 17; RGPD de mensajes e IPs).
- Matrix: audiencia sin cuentas, homeserver que operar.
- Supabase/Firebase: mismas obligaciones que C, SDK de terceros, pausa por inactividad.

## Referencias

- `docs/superpowers/specs/2026-09-24-live-comments-design.md`
- `docs/superpowers/plans/2026-09-24-live-comments-mvp.md`
- ADR-0002 (registro de capas)
```

- [ ] **Step 2: Fill every `<…>`** with the owner's answer. `grep -nE '<(fecha|pegar|Q[0-9]+)' docs/adr/0003-community-comments-carry-no-tier.md` must print nothing; if an answer is missing, stop.

- [ ] **Step 3: Commit.**

```bash
git checkout -b feat/community-comments
git add docs/adr/0003-community-comments-carry-no-tier.md
git commit -m "docs(adr): 0003 community comments carry no tier

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 2 — `CommunityComment` type and thread parser

**`BLOCKED ON OWNER DECISION Q1`**

**Files:** Create `src/lib/community/types.ts`, `src/lib/community/parse-thread.ts`, `src/lib/community/parse-thread.test.ts`, `src/lib/community/fixtures/thread.json`.
**Consumes:** nothing. **Produces:**

```ts
// types.ts
export interface CommunityComment {
  uri: string; url: string; authorDid: string; authorHandle: string;
  displayName?: string; text: string; createdAt: string;
}
export const COMMUNITY_MAX_COMMENTS = 50;
export const COMMUNITY_HIDE_LABELS: readonly string[];
// parse-thread.ts
export interface ParsedThread { rootUri: string; rootUrl: string; comments: CommunityComment[]; total: number; truncated: boolean }
export function postUrl(handleOrDid: string, atUri: string): string;
export function parseThread(json: unknown, opts?: { blockedDids?: ReadonlySet<string>; max?: number }): ParsedThread;
```

- [ ] **Step 1: Write the fixture** `src/lib/community/fixtures/thread.json` (invented accounts on `.test` handles, no real users):

```json
{
  "thread": {
    "$type": "app.bsky.feed.defs#threadViewPost",
    "post": {
      "uri": "at://did:plc:bot/app.bsky.feed.post/root1", "cid": "c0",
      "author": { "did": "did:plc:bot", "handle": "watchboard.bsky.social" },
      "record": { "text": "Community thread", "createdAt": "2026-09-24T06:00:00Z" },
      "indexedAt": "2026-09-24T06:00:01Z",
      "threadgate": { "record": { "hiddenReplies": ["at://did:plc:c/app.bsky.feed.post/r3"] } }
    },
    "replies": [
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:b/app.bsky.feed.post/r2", "cid": "c2", "author": { "did": "did:plc:b", "handle": "bob.test", "displayName": "Bob" }, "record": { "text": "Second <b>in time</b> https://example.org/x", "createdAt": "2026-09-24T08:00:00Z" }, "indexedAt": "2026-09-24T08:00:01Z" },
        "replies": [ { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:a/app.bsky.feed.post/n1", "cid": "cn", "author": { "did": "did:plc:a", "handle": "alice.test" }, "record": { "text": "nested, depth 2", "createdAt": "2026-09-24T09:00:00Z" }, "indexedAt": "x" } } ] },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:a/app.bsky.feed.post/r1", "cid": "c1", "author": { "did": "did:plc:a", "handle": "alice.test" }, "record": { "text": "First in time", "createdAt": "2026-09-24T07:00:00Z" }, "indexedAt": "x" } },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:c/app.bsky.feed.post/r3", "cid": "c3", "author": { "did": "did:plc:c", "handle": "hidden.test" }, "record": { "text": "hidden by owner", "createdAt": "2026-09-24T07:30:00Z" }, "indexedAt": "x" } },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:d/app.bsky.feed.post/r4", "cid": "c4", "author": { "did": "did:plc:d", "handle": "labeled.test" }, "record": { "text": "labeled", "createdAt": "2026-09-24T07:40:00Z" }, "indexedAt": "x", "labels": [ { "src": "did:plc:mod", "uri": "at://…", "val": "graphic-media", "cts": "x" } ] } },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:e/app.bsky.feed.post/r5", "cid": "c5", "author": { "did": "did:plc:e", "handle": "unlabeled.test" }, "record": { "text": "label negated", "createdAt": "2026-09-24T07:50:00Z" }, "indexedAt": "x", "labels": [ { "src": "did:plc:mod", "uri": "at://…", "val": "porn", "neg": true, "cts": "x" } ] } },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:blocked/app.bsky.feed.post/r6", "cid": "c6", "author": { "did": "did:plc:blocked", "handle": "blocked.test" }, "record": { "text": "on owner blocklist", "createdAt": "2026-09-24T07:55:00Z" }, "indexedAt": "x" } },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:g/app.bsky.feed.post/r8", "cid": "c8", "author": { "did": "did:plc:g", "handle": "optout.test", "labels": [ { "src": "did:plc:g", "uri": "did:plc:g", "val": "!no-unauthenticated", "cts": "x" } ] }, "record": { "text": "author opted out of logged-out views", "createdAt": "2026-09-24T07:56:00Z" }, "indexedAt": "x" } },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:h/app.bsky.feed.post/r9", "cid": "c9", "author": { "did": "did:plc:h", "handle": "doxx.test" }, "record": { "text": "doxxing label", "createdAt": "2026-09-24T07:57:00Z" }, "indexedAt": "x", "labels": [ { "src": "did:plc:mod", "uri": "at://…", "val": "doxxing", "cts": "x" } ] } },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:k/app.bsky.feed.post/r10", "cid": "c10", "author": { "did": "did:plc:k", "handle": "spammer.test", "labels": [ { "src": "did:plc:mod", "uri": "did:plc:k", "val": "spam", "cts": "x" } ] }, "record": { "text": "account labelled spam", "createdAt": "2026-09-24T07:59:00Z" }, "indexedAt": "x" } },
      { "$type": "app.bsky.feed.defs#notFoundPost", "uri": "at://did:plc:x/app.bsky.feed.post/gone", "notFound": true },
      { "$type": "app.bsky.feed.defs#blockedPost", "uri": "at://did:plc:y/app.bsky.feed.post/blk", "blocked": true },
      { "$type": "app.bsky.feed.defs#threadViewPost", "post": { "uri": "at://did:plc:f/app.bsky.feed.post/r7", "cid": "c7", "author": { "did": "did:plc:f", "handle": "empty.test" }, "record": { "text": "   ", "createdAt": "2026-09-24T07:58:00Z" }, "indexedAt": "x" } }
    ]
  }
}
```

- [ ] **Step 2: Write the failing test** `src/lib/community/parse-thread.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/thread.json';
import { parseThread, postUrl } from './parse-thread';
import { COMMUNITY_MAX_COMMENTS } from './types';

const blocked = new Set(['did:plc:blocked']);

describe('parseThread', () => {
  it('keeps only visible direct replies, oldest first', () => {
    const p = parseThread(fixture, { blockedDids: blocked });
    expect(p.comments.map((c) => c.uri.split('/').pop())).toEqual(['r1', 'r5', 'r2']);
    expect(p.total).toBe(3);
    expect(p.truncated).toBe(false);
  });

  it('drops hidden replies, hide labels, blocklisted DIDs, notFound/blocked nodes, blank text and depth > 1', () => {
    const uris = parseThread(fixture, { blockedDids: blocked }).comments.map((c) => c.uri);
    for (const gone of ['r3', 'r4', 'r6', 'r8', 'r9', 'r10', 'gone', 'blk', 'r7', 'n1']) {
      expect(uris.some((u) => u.endsWith(`/${gone}`)), gone).toBe(false);
    }
  });

  it('filters like a logged-out Bluesky client: account labels count, including !no-unauthenticated', () => {
    const uris = parseThread(fixture).comments.map((c) => c.uri.split('/').pop());
    expect(uris).not.toContain('r8');   // author self-label !no-unauthenticated
    expect(uris).not.toContain('r10');  // account-level spam label
    expect(uris).not.toContain('r9');   // post-level doxxing label
  });

  it('without an injected blocklist, only the blocklist entry survives (the e2e sees 4 comments)', () => {
    expect(parseThread(fixture).comments.map((c) => c.uri.split('/').pop())).toEqual(['r1', 'r5', 'r6', 'r2']);
  });

  it('keeps the text verbatim as plain text (no HTML interpretation happens here)', () => {
    const c = parseThread(fixture).comments.find((x) => x.uri.endsWith('/r2'))!;
    expect(c.text).toBe('Second <b>in time</b> https://example.org/x');
    expect(c.url).toBe('https://bsky.app/profile/bob.test/post/r2');
    expect(c.displayName).toBe('Bob');
  });

  it('returns the root url for the "Comment on Bluesky" button', () => {
    const p = parseThread(fixture);
    expect(p.rootUri).toBe('at://did:plc:bot/app.bsky.feed.post/root1');
    expect(p.rootUrl).toBe('https://bsky.app/profile/watchboard.bsky.social/post/root1');
  });

  it('keeps the most recent `max` replies and reports truncation', () => {
    const replies = Array.from({ length: COMMUNITY_MAX_COMMENTS + 5 }, (_, i) => ({
      $type: 'app.bsky.feed.defs#threadViewPost',
      post: { uri: `at://did:plc:z/app.bsky.feed.post/p${i}`, cid: 'c', author: { did: 'did:plc:z', handle: 'z.test' },
        record: { text: `n${i}`, createdAt: new Date(Date.UTC(2026, 8, 24, 0, i)).toISOString() }, indexedAt: 'x' },
    }));
    const p = parseThread({ thread: { ...fixture.thread, replies } });
    expect(p.comments).toHaveLength(COMMUNITY_MAX_COMMENTS);
    expect(p.total).toBe(COMMUNITY_MAX_COMMENTS + 5);
    expect(p.truncated).toBe(true);
    expect(p.comments[0].text).toBe('n5');
    expect(p.comments.at(-1)!.text).toBe(`n${COMMUNITY_MAX_COMMENTS + 4}`);
  });

  it('throws on a payload that is not a thread, so the live-source marks the fetch failed', () => {
    expect(() => parseThread({})).toThrow(/thread/);
    expect(() => parseThread({ thread: { $type: 'app.bsky.feed.defs#notFoundPost', notFound: true } })).toThrow(/root/);
    expect(() => parseThread(null)).toThrow();
  });

  it('a root with no replies is an empty list, not an error', () => {
    const p = parseThread({ thread: { ...fixture.thread, replies: [] } });
    expect(p.comments).toEqual([]);
    expect(p.total).toBe(0);
  });

  it('postUrl uses the last path segment of the AT URI as the rkey', () => {
    expect(postUrl('did:plc:a', 'at://did:plc:a/app.bsky.feed.post/3kabc')).toBe('https://bsky.app/profile/did:plc:a/post/3kabc');
  });
});
```

- [ ] **Step 3: Run it, expect failure** (modules missing):

```bash
npx vitest run src/lib/community/parse-thread.test.ts
```

Expected: `Failed to resolve import "./parse-thread"`.

- [ ] **Step 4: Implement** `src/lib/community/types.ts`:

```ts
/**
 * Community comments — reader replies on Bluesky, shown in their own panel.
 *
 * A comment is NOT a data point and has NO tier (ADR-0003). This type must
 * never gain tier/source/pole/contested fields; separation.test.ts enforces it.
 */
export interface CommunityComment {
  uri: string;
  url: string;
  authorDid: string;
  authorHandle: string;
  displayName?: string;
  text: string;
  createdAt: string;
}

export const COMMUNITY_MAX_COMMENTS = 50;

/**
 * Label values that hide a reply in the panel, on the post OR its author.
 * The panel is a logged-out surface, so it honours what a logged-out Bluesky
 * client hides, including the author's own '!no-unauthenticated' opt-out.
 * Known values: node_modules/@atproto/api/dist/client/types/com/atproto/label/defs.d.ts:73.
 */
export const COMMUNITY_HIDE_LABELS: readonly string[] = [
  '!hide', '!warn', '!no-unauthenticated', 'porn', 'sexual', 'nudity',
  'graphic-media', 'gore', 'nsfl', 'doxxing', 'dmca-violation', 'spam',
];
```

and `src/lib/community/parse-thread.ts`:

```ts
import { COMMUNITY_HIDE_LABELS, COMMUNITY_MAX_COMMENTS, type CommunityComment } from './types';

const THREAD_VIEW = 'app.bsky.feed.defs#threadViewPost';

interface RawLabel { val?: unknown; neg?: unknown }
interface RawPost {
  uri?: unknown;
  author?: { did?: unknown; handle?: unknown; displayName?: unknown; labels?: RawLabel[] };
  record?: { text?: unknown; createdAt?: unknown };
  labels?: RawLabel[];
  threadgate?: { record?: { hiddenReplies?: unknown } };
}
interface RawNode { $type?: unknown; post?: RawPost; replies?: unknown }

export interface ParsedThread {
  rootUri: string;
  rootUrl: string;
  comments: CommunityComment[];
  total: number;
  truncated: boolean;
}

export function postUrl(handleOrDid: string, atUri: string): string {
  const rkey = atUri.split('/').pop() ?? '';
  return `https://bsky.app/profile/${handleOrDid}/post/${rkey}`;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

function hasHideLabel(labels: RawLabel[] | undefined): boolean {
  if (!Array.isArray(labels)) return false;
  const active = new Set<string>();
  for (const l of labels) {
    const val = str(l?.val);
    if (!val) continue;
    if (l.neg === true) active.delete(val);
    else active.add(val);
  }
  return COMMUNITY_HIDE_LABELS.some((v) => active.has(v));
}

export function parseThread(
  json: unknown,
  opts: { blockedDids?: ReadonlySet<string>; max?: number } = {},
): ParsedThread {
  const root = (json as { thread?: RawNode } | null)?.thread;
  if (!root || typeof root !== 'object') throw new Error('getPostThread: missing thread');
  if (root.$type !== THREAD_VIEW || !root.post) throw new Error('getPostThread: root post not found');
  const rootUri = str(root.post.uri);
  const rootHandle = str(root.post.author?.handle) ?? str(root.post.author?.did);
  if (!rootUri || !rootHandle) throw new Error('getPostThread: root post has no uri/author');

  const hiddenRaw = root.post.threadgate?.record?.hiddenReplies;
  const hidden = new Set(Array.isArray(hiddenRaw) ? hiddenRaw.filter((u): u is string => typeof u === 'string') : []);
  const blocked = opts.blockedDids ?? new Set<string>();
  const max = opts.max ?? COMMUNITY_MAX_COMMENTS;

  const out: CommunityComment[] = [];
  const replies = Array.isArray(root.replies) ? (root.replies as RawNode[]) : [];
  for (const node of replies) {
    if (node?.$type !== THREAD_VIEW || !node.post) continue;
    const p = node.post;
    const uri = str(p.uri);
    const did = str(p.author?.did);
    const handle = str(p.author?.handle);
    const text = typeof p.record?.text === 'string' ? p.record.text : '';
    const createdAt = str(p.record?.createdAt);
    if (!uri || !did || !handle || !createdAt) continue;
    if (text.trim() === '') continue;
    if (hidden.has(uri) || blocked.has(did) || hasHideLabel(p.labels) || hasHideLabel(p.author?.labels)) continue;
    out.push({ uri, url: postUrl(handle, uri), authorDid: did, authorHandle: handle, displayName: str(p.author?.displayName), text, createdAt });
  }
  out.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return {
    rootUri,
    rootUrl: postUrl(rootHandle, rootUri),
    comments: out.slice(-max),
    total: out.length,
    truncated: out.length > max,
  };
}
```

- [ ] **Step 5: Run, expect pass.** `npx vitest run src/lib/community/parse-thread.test.ts` → 10 passed. (`tsconfig.json:6` already sets `"resolveJsonModule": true`.)

- [ ] **Step 6: Commit.**

```bash
git add src/lib/community/
git commit -m "feat(community): CommunityComment type and getPostThread parser

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 3 — Shared pointer helpers: `findRoot`, cadence, eligibility

**`BLOCKED ON OWNER DECISION Q1`** (Q3 if a separate account changes `COMMUNITY_ACTOR`).

**Files:** Create `src/lib/community-shared.ts`, `src/lib/community-shared.test.ts`, `src/lib/community/fixtures/author-feed.json`.
**Consumes:** `TrackerConfig` (`src/lib/tracker-config.ts`; `status` at `:155`, `ai.updateIntervalDays` at `:89`). **Produces:**

```ts
export const COMMUNITY_ACTOR = 'watchboard.bsky.social';
export function rootMarker(slug: string): string;                       // 'watchboard.dev/{slug}/'
export function threadCadenceDays(updateIntervalDays: number | undefined): 1 | 7;
export interface RootRef { uri: string; cid: string; url: string; createdAt: string; date: string }
export function findRoot(feedJson: unknown, slug: string, now: Date, cadenceDays: number): RootRef | null; // throws on a non-feed payload
export interface CommunityEligibility { status: 'active' | 'archived' | 'draft'; community?: { enabled: boolean } }
export function communityEnabledFor(config: CommunityEligibility, envFlag: string | undefined): boolean;
export function communityEnvFlag(): string | undefined;                // pages only; the script reads process.env
```

This file lives outside `src/lib/community/` on purpose: it holds only root-post pointers and eligibility, so `scripts/community-threads.ts` imports the **same** predicate and marker as the page (review finding: script and page disagreed on archived trackers). It replaces the first draft's `threads.json` (Deviation 4).

- [ ] **Step 1: Fixture** `src/lib/community/fixtures/author-feed.json` (shape of `getAuthorFeed`; invented URIs):

```json
{
  "feed": [
    { "post": { "uri": "at://did:plc:bot/app.bsky.feed.post/new-cdmx", "cid": "c1", "author": { "did": "did:plc:bot", "handle": "watchboard.bsky.social" },
      "record": { "text": "Community thread · CDMX · 2026-09-24\n\n…\n\nhttps://watchboard.dev/cdmx/", "createdAt": "2026-09-24T06:00:00.000Z" }, "indexedAt": "2026-09-24T06:00:02.000Z" } },
    { "post": { "uri": "at://did:plc:bot/app.bsky.feed.post/digest", "cid": "c2", "author": { "did": "did:plc:bot", "handle": "watchboard.bsky.social" },
      "record": { "text": "📊 2026-09-24\n\n• CDMX: something\n\n🔗 watchboard.dev", "createdAt": "2026-09-24T03:00:00.000Z" }, "indexedAt": "x" } },
    { "post": { "uri": "at://did:plc:bot/app.bsky.feed.post/old-cdmx", "cid": "c3", "author": { "did": "did:plc:bot", "handle": "watchboard.bsky.social" },
      "record": { "text": "Community thread · CDMX · 2026-09-17\n\nhttps://watchboard.dev/cdmx/", "createdAt": "2026-09-17T06:00:00.000Z" }, "indexedAt": "x" } },
    { "post": { "uri": "at://did:plc:bot/app.bsky.feed.post/iran", "cid": "c4", "author": { "did": "did:plc:bot", "handle": "watchboard.bsky.social" },
      "record": { "text": "Community thread · Iran · 2026-09-24\n\nhttps://watchboard.dev/iran-conflict/", "createdAt": "2026-09-24T06:00:01.000Z" }, "indexedAt": "x" } },
    { "post": { "uri": "at://did:plc:other/app.bsky.feed.post/rp", "cid": "c5", "author": { "did": "did:plc:other", "handle": "someone.test" },
      "record": { "text": "reposted https://watchboard.dev/cdmx/", "createdAt": "2026-09-24T09:00:00.000Z" }, "indexedAt": "x" },
      "reason": { "$type": "app.bsky.feed.defs#reasonRepost" } },
    { "post": { "uri": "at://did:plc:bot/app.bsky.feed.post/cdmx-x", "cid": "c6", "author": { "did": "did:plc:bot", "handle": "watchboard.bsky.social" },
      "record": { "text": "about https://watchboard.dev/cdmx-extra/", "createdAt": "2026-09-24T10:00:00.000Z" }, "indexedAt": "x" } }
  ]
}
```

- [ ] **Step 2: Failing test** `src/lib/community-shared.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import feed from './community/fixtures/author-feed.json';
import { COMMUNITY_ACTOR, rootMarker, threadCadenceDays, findRoot, communityEnabledFor } from './community-shared';

const NOW = new Date('2026-09-24T20:00:00Z');

describe('rootMarker / threadCadenceDays', () => {
  it('marker is the tracker URL without scheme', () => {
    expect(rootMarker('cdmx')).toBe('watchboard.dev/cdmx/');
  });
  it('daily for daily trackers, weekly for everything slower', () => {
    expect(threadCadenceDays(1)).toBe(1);
    expect(threadCadenceDays(undefined)).toBe(1);
    expect(threadCadenceDays(3)).toBe(7);
    expect(threadCadenceDays(7)).toBe(7);
  });
});

describe('findRoot', () => {
  it('picks the newest own post carrying the exact slug marker, inside 2 × cadence', () => {
    const r = findRoot(feed, 'cdmx', NOW, 7);
    expect(r).toEqual({
      uri: 'at://did:plc:bot/app.bsky.feed.post/new-cdmx', cid: 'c1',
      url: `https://bsky.app/profile/${COMMUNITY_ACTOR}/post/new-cdmx`,
      createdAt: '2026-09-24T06:00:00.000Z', date: '2026-09-24',
    });
  });
  it('ignores reposts, other authors, digests and prefix-colliding slugs (cdmx vs cdmx-extra)', () => {
    expect(findRoot(feed, 'cdmx-extra', NOW, 1)?.uri).toBe('at://did:plc:bot/app.bsky.feed.post/cdmx-x');
    expect(findRoot(feed, 'cdmx', NOW, 7)?.uri).not.toMatch(/\/(rp|digest|cdmx-x)$/);
  });
  it('returns null when the newest root is older than 2 × cadence', () => {
    expect(findRoot(feed, 'cdmx', new Date('2026-09-27T00:00:00Z'), 1)).toBeNull();
    expect(findRoot(feed, 'cdmx', new Date('2026-10-07T00:00:00Z'), 7)).toBeNull();
    expect(findRoot(feed, 'unknown', NOW, 7)).toBeNull();
  });
  it('throws on a payload that is not a feed, so the live-source marks the fetch failed', () => {
    expect(() => findRoot({}, 'cdmx', NOW, 7)).toThrow(/feed/);
    expect(() => findRoot(null, 'cdmx', NOW, 7)).toThrow(/feed/);
  });
});

describe('communityEnabledFor (one predicate for page and bot)', () => {
  const on = { status: 'active' as const, community: { enabled: true } };
  it('defers to tracker.json when the flag is unset or unknown', () => {
    expect(communityEnabledFor(on, undefined)).toBe(true);
    expect(communityEnabledFor({ status: 'active' }, undefined)).toBe(false);
    expect(communityEnabledFor({ status: 'active', community: { enabled: false } }, 'true')).toBe(false);
  });
  it('"false" is a global kill switch', () => {
    expect(communityEnabledFor(on, 'false')).toBe(false);
    expect(communityEnabledFor(on, ' FALSE ')).toBe(false);
  });
  it('"force" enables every active tracker (Playwright only)', () => {
    expect(communityEnabledFor({ status: 'active' }, 'force')).toBe(true);
  });
  it('draft and archived trackers never get a panel or a thread', () => {
    for (const status of ['draft', 'archived'] as const) {
      expect(communityEnabledFor({ status, community: { enabled: true } }, undefined), status).toBe(false);
      expect(communityEnabledFor({ status, community: { enabled: true } }, 'force'), status).toBe(false);
    }
  });
});
```

- [ ] **Step 3: Run, expect failure.** `npx vitest run src/lib/community-shared.test.ts` → cannot resolve `./community-shared`.

- [ ] **Step 4: Implement** `src/lib/community-shared.ts`:

```ts
/**
 * Community comments — pointer-only helpers shared by the bot script and the
 * panel (ADR-0003). Holds NO comment content; scripts may import this file.
 */
export const COMMUNITY_ACTOR = 'watchboard.bsky.social';

export function rootMarker(slug: string): string {
  return `watchboard.dev/${slug}/`;
}

export function threadCadenceDays(updateIntervalDays: number | undefined): 1 | 7 {
  return (updateIntervalDays ?? 1) <= 1 ? 1 : 7;
}

export interface RootRef { uri: string; cid: string; url: string; createdAt: string; date: string }

interface RawItem { post?: { uri?: unknown; cid?: unknown; author?: { handle?: unknown }; record?: { text?: unknown; createdAt?: unknown; reply?: unknown } }; reason?: unknown }

const DAY_MS = 86_400_000;

export function findRoot(feedJson: unknown, slug: string, now: Date, cadenceDays: number): RootRef | null {
  const items = (feedJson as { feed?: unknown } | null)?.feed;
  if (!Array.isArray(items)) throw new Error('getAuthorFeed: missing feed');
  const marker = rootMarker(slug);
  let best: RootRef | null = null;
  for (const it of items as RawItem[]) {
    const p = it?.post;
    if (!p || it.reason || p.record?.reply) continue;                 // reposts and replies are never roots
    if (p.author?.handle !== COMMUNITY_ACTOR) continue;
    const text = typeof p.record?.text === 'string' ? p.record.text : '';
    if (!text.includes(marker)) continue;                              // trailing '/' stops cdmx matching cdmx-extra
    const uri = typeof p.uri === 'string' ? p.uri : '';
    const cid = typeof p.cid === 'string' ? p.cid : '';
    const createdAt = typeof p.record?.createdAt === 'string' ? p.record.createdAt : '';
    const t = Date.parse(createdAt);
    if (!uri || !cid || Number.isNaN(t)) continue;
    if (now.getTime() - t > 2 * cadenceDays * DAY_MS) continue;
    if (best && Date.parse(best.createdAt) >= t) continue;
    best = { uri, cid, createdAt, date: createdAt.slice(0, 10), url: `https://bsky.app/profile/${COMMUNITY_ACTOR}/post/${uri.split('/').pop()}` };
  }
  return best;
}

export interface CommunityEligibility { status: 'active' | 'archived' | 'draft'; community?: { enabled: boolean } }

/** PUBLIC_COMMUNITY_ENABLED: 'false' = kill switch, 'force' = Playwright only, else tracker.json decides. */
export function communityEnabledFor(config: CommunityEligibility, envFlag: string | undefined): boolean {
  if (config.status !== 'active') return false;
  const flag = String(envFlag ?? '').trim().toLowerCase();
  if (flag === 'false') return false;
  if (flag === 'force') return true;
  return config.community?.enabled === true;
}

/**
 * Build-time flag for Astro pages. A function, not a module-level const:
 * under tsx (the bot script) `import.meta.env` is undefined, and the script
 * passes `process.env.PUBLIC_COMMUNITY_ENABLED` itself. The literal
 * `import.meta.env.PUBLIC_COMMUNITY_ENABLED` is what scripts/list-env-vars.ts
 * scans for (test.yml:35-36).
 */
export function communityEnvFlag(): string | undefined {
  return import.meta.env.PUBLIC_COMMUNITY_ENABLED;
}
```

- [ ] **Step 5: Run, expect pass.** `npx vitest run src/lib/community-shared.test.ts` → 10 passed. `npx tsc --noEmit -p . 2>&1 | grep community-shared; echo "tsc lines above (must be none)"`.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/community-shared.ts src/lib/community-shared.test.ts src/lib/community/fixtures/author-feed.json
git commit -m "feat(community): findRoot, cadence and one eligibility predicate for page and bot

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 4 — Separation guard test

**`BLOCKED ON OWNER DECISION Q1`**

The spec's answer to the 09-21 objection is only as good as this test: it turns "comments never become data" from a CSS convention into a build failure.

**Files:** Create `src/lib/community/separation.test.ts`.
**Consumes:** `CommunityComment`, `parseThread` (Task 2). **Produces:** a self-contained test file, no exports.

- [ ] **Step 1: Write the test.** It guards against future regressions, so it passes on clean code; Step 2 proves it fails on a deliberate violation.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import fixture from './fixtures/thread.json';
import { parseThread } from './parse-thread';
import type { CommunityComment } from './types';

const ROOT = resolve(__dirname, '../../..');
const FORBIDDEN_KEYS = ['tier', 'source', 'sourceTier', 'pole', 'contested', 'confidence', 'verified'] as const;

// Compile-time: adding a forbidden key to CommunityComment breaks `tsc`.
type Leaked = Extract<keyof CommunityComment, (typeof FORBIDDEN_KEYS)[number]>;
const noLeak: [Leaked] extends [never] ? true : false = true;

function walk(dir: string, exts = ['.ts', '.tsx', '.astro', '.mjs', '.js']): string[] {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const p = join(abs, e.name);
    return e.isDirectory() ? walk(relative(ROOT, p), exts) : exts.some((x) => e.name.endsWith(x)) ? [p] : [];
  });
}

const IMPORTS_COMMUNITY = /from\s+['"][^'"]*lib\/community\/|import\(\s*['"][^'"]*lib\/community\//;

describe('community comments stay out of the data model (ADR-0003)', () => {
  it('CommunityComment has no tier-like key, at compile time and at runtime', () => {
    expect(noLeak).toBe(true);
    for (const c of parseThread(fixture).comments) {
      for (const k of FORBIDDEN_KEYS) expect(Object.keys(c)).not.toContain(k);
    }
  });

  // The single named exception: the day-60 metric reads threads, prints counts, writes nothing (Task 16).
  const METRICS_SCRIPT = 'scripts/community-metrics.ts';

  it('no data, pipeline, API, feed or MCP module imports lib/community/ (one named, read-only exception)', () => {
    const guarded = [
      'src/lib/schemas.ts', 'src/lib/data.ts', 'scripts', 'mcp', 'src/pages/api',
      ...walk('src/pages').filter((f) => /(rss[^/]*|feeds[^/]*)\.(ts|astro)$/.test(f)).map((f) => relative(ROOT, f)),
    ];
    const offenders = guarded.flatMap((d) => walk(d))
      .filter((f) => relative(ROOT, f) !== METRICS_SCRIPT)
      .filter((f) => IMPORTS_COMMUNITY.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('the metrics exception stays read-only (no file writes, no git, no network writes)', () => {
    const abs = resolve(ROOT, METRICS_SCRIPT);
    if (!existsSync(abs)) return; // created in Task 16
    expect(readFileSync(abs, 'utf8')).not.toMatch(/writeFileSync|appendFileSync|createWriteStream|execSync|spawn|method:\s*['"]POST/);
  });

  it('the light scan never reads the Watchboard account or reply threads', () => {
    const src = readFileSync(resolve(ROOT, 'src/lib/realtime-sources.ts'), 'utf8');
    expect(src).not.toMatch(/watchboard\.bsky\.social/);
    expect(src).not.toMatch(/getPostThread/);
  });

  it('no community file touches storage, cookies or analytics', () => {
    const files = [...walk('src/lib/community'), ...walk('src/components/islands/community')]
      .filter((f) => !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), relative(ROOT, f)).not.toMatch(/localStorage|sessionStorage|document\.cookie|posthog/i);
    }
  });

  it('nothing bakes community state into public/ (roots are discovered at runtime, Deviation 4)', () => {
    expect(existsSync(resolve(ROOT, 'public/_community'))).toBe(false);
  });

  it('the panel never borrows the source-tier chip or its classes (spec 3.1)', () => {
    const files = walk('src/components/islands/community');
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), relative(ROOT, f)).not.toMatch(/SourceStatusChip|source-chip|freshness-indicator|tier-utils|tierClass/);
    }
  });
});
```

- [ ] **Step 2: Prove the test bites.** Temporarily add `import { parseThread } from '../src/lib/community/parse-thread';` as the first line of `scripts/check-source-tiers.ts`, run `npx vitest run src/lib/community/separation.test.ts`, expect a failure listing `scripts/check-source-tiers.ts`. Revert with `git checkout -- scripts/check-source-tiers.ts`. Then temporarily add `tier?: number;` to `CommunityComment`, run `npx tsc --noEmit -p . 2>&1 | grep separation.test`, expect a `Type 'true' is not assignable to type 'false'` line. Revert.

- [ ] **Step 3: Run clean, expect pass.** `npx vitest run src/lib/community/` → all pass. The palette check on `src/styles/community.css` is added in Task 11, when the file exists.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/community/separation.test.ts
git commit -m "test(community): structural separation guards (no tier, no ingestion, no storage)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 5 — Registry entry, CSP, and exclusion from "degraded sources"

**`BLOCKED ON OWNER DECISION Q1`** (and Q11 for the `/sources/` wording).

**Files:** Modify `src/lib/live-layers.ts` (enum at `:35`, array end at `:266`, `layersForTracker` at `:275`), `src/lib/live-layers.test.ts`, `src/lib/degraded-sources.ts` (loop at `:74`), `src/lib/degraded-sources.test.ts`, `src/pages/sources.astro` (table `:34-43`), `src/layouts/BaseLayout.astro:97`, `public/_headers:16`.
**Consumes:** nothing. **Produces:** `getLiveLayer('community-bluesky-roots')` → `{ kind: 'feed', renderer: 'panel', url (getAuthorFeed, `{actor}`), ttlMs: 300_000, cors: true }`; `getLiveLayer('community-bluesky')` → `{ kind: 'feed', renderer: 'panel', url (getPostThread, `{uri}`), ttlMs: 60_000, cors: true }`; `layersForTracker()` never returns a `panel` entry; `collectDegraded()` ignores keys starting with `community:`; `/sources/` lists `panel` entries only in their own section.

Why each piece: the CSP test (`src/lib/live-layers.test.ts:77-93`) only checks hosts that are in `LIVE_LAYERS` via `feedUrls()` (`src/lib/live-layers.ts:280-284`); the `push.watchboard.dev` gap in the spec (section 1) is what happens to a `fetch` outside the registry. `layersForTracker()` is read by the map (`src/components/islands/IntelMap.tsx:194`) and globe (`src/components/islands/CesiumGlobe/CesiumGlobe.tsx:749`); a comments feed must never be offered there.

- [ ] **Step 1: Failing tests.** Append to `src/lib/live-layers.test.ts` inside `describe('LIVE_LAYERS registry', …)`:

```ts
  it('registers the two community feeds as panel-only sources, never map layers', () => {
    const expected: [string, string, number][] = [
      ['community-bluesky-roots', 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={actor}&', 300_000],
      ['community-bluesky', 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri={uri}&', 60_000],
    ];
    for (const [id, prefix, ttl] of expected) {
      const c = getLiveLayer(id);
      expect(c?.kind, id).toBe('feed');
      expect(c?.renderer, id).toBe('panel');
      if (c?.kind !== 'feed') throw new Error(`${id} not a feed`);
      expect(c.url.startsWith(prefix), id).toBe(true);
      expect(c.ttlMs, id).toBe(ttl);
      expect(c.cors, id).toBe(true);
      expect(c.attribution.notice, id).toMatch(/not a source/i);
    }
    for (const slug of ['iran-conflict', 'mexico-history', 'any-slug']) {
      expect(layersForTracker(slug).some((l) => l.renderer === 'panel'), slug).toBe(false);
    }
  });
```

Append to `src/lib/degraded-sources.test.ts` inside `describe('collectDegraded', …)`:

```ts
  it('never lists community comment fetches next to the data sources', () => {
    const out = collectDegraded([
      { key: 'community:roots', result: r('error', null, 'HTTP 503') },
      { key: 'community:thread:at://did:plc:bot/app.bsky.feed.post/x', result: r('stale', 5) },
      { key: 'flights:a', result: r('stale', 100) },
    ], null, 'ukraine-war');
    expect(out.map((i) => i.id)).toEqual(['flights']);
  });
```

- [ ] **Step 2: Run, expect failure.**

```bash
npx vitest run src/lib/live-layers.test.ts src/lib/degraded-sources.test.ts
```

Expected: `registers the community feed…` fails (`expected undefined to be 'feed'`) and `never lists community…` fails (`['community', 'flights']`).

- [ ] **Step 3: Implement the registry change.** In `src/lib/live-layers.ts:35`:

```ts
  /** `panel`: read by a page panel (community comments), never offered as a map/globe layer. */
  renderer: z.enum(['cesium', 'leaflet', 'both', 'globe-home', 'panel']),
```

Before the closing `];` at `:266`:

```ts
  {
    id: 'community-bluesky-roots',
    label: 'layers.communityBlueskyRoots',
    kind: 'feed',
    renderer: 'panel',
    url: 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={actor}&filter=posts_no_replies&limit=100',
    ttlMs: 5 * MINUTE,
    cors: true,
    attribution: {
      source: 'Bluesky — the Watchboard account feed, read only to find the current community thread',
      license: 'Public posts of the Watchboard account; shown and linked, not stored',
      url: 'https://bsky.app/profile/watchboard.bsky.social',
      notice: 'Finds the community thread; not a source. No tier (ADR-0003).',
    },
    scope: [],
    requiresKey: false,
    transport: 'http',
  },
  {
    id: 'community-bluesky',
    label: 'layers.communityBluesky',
    kind: 'feed',
    renderer: 'panel',
    url: 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri={uri}&depth=1&parentHeight=0',
    ttlMs: MINUTE,
    cors: true,
    attribution: {
      source: 'Bluesky — reader replies to the Watchboard community thread',
      license: "Each author's content under the Bluesky Terms of Service; shown and linked, not stored",
      url: 'https://bsky.app/profile/watchboard.bsky.social',
      notice: 'Reader comments, not a source. No tier; not verified by Watchboard (ADR-0003).',
    },
    scope: [],
    requiresKey: false,
    transport: 'http',
  },
```

Replace `layersForTracker` (`:275-277`):

```ts
/** Map/globe layers offered to a tracker: global ones plus those scoped to it. Panel feeds are excluded. */
export function layersForTracker(slug: string): LiveLayerSpec[] {
  return LIVE_LAYERS.filter((l) => l.renderer !== 'panel' && (l.scope.length === 0 || l.scope.includes(slug)));
}
```

- [ ] **Step 4: Implement the degraded-sources skip.** In `src/lib/degraded-sources.ts`, above `collectDegraded`:

```ts
/** Community comments report their own status inside their panel (ADR-0003); never mix them with data sources. */
export const COMMUNITY_KEY_PREFIX = 'community:';
```

and as the first line inside the loop at `:74`:

```ts
    if (key.startsWith(COMMUNITY_KEY_PREFIX)) continue;
```

- [ ] **Step 5: Run the registry tests, expect the CSP test to fail now.**

```bash
npx vitest run src/lib/live-layers.test.ts src/lib/degraded-sources.test.ts
```

Expected: the two new tests pass; `src/layouts/BaseLayout.astro allows every registered feed` and `public/_headers allows every registered feed` fail with `community-bluesky (https://public.api.bsky.app/…) is not in connect-src`. This is the test biting, as intended.

- [ ] **Step 6: Add the host to both CSPs.** In `src/layouts/BaseLayout.astro:97` and `public/_headers:16`, in `connect-src`, insert ` https://public.api.bsky.app` right after `https://query.wikidata.org`:

```bash
sed -i.bak 's#https://query.wikidata.org https://api.memegen.link#https://query.wikidata.org https://public.api.bsky.app https://api.memegen.link#' src/layouts/BaseLayout.astro public/_headers
rm src/layouts/BaseLayout.astro.bak public/_headers.bak
grep -c 'https://public.api.bsky.app' src/layouts/BaseLayout.astro public/_headers
```

Expected: `src/layouts/BaseLayout.astro:1` and `public/_headers:1`. A `0` means the anchor text moved; edit by hand, do not continue.

- [ ] **Step 7: Keep comments out of the "Data sources" table (Q11).** Without this, `src/pages/sources.astro:34-43` lists both entries under "Data sources" with scope "all trackers" (`scope: []`). In the frontmatter of `src/pages/sources.astro`, after the `LIVE_LAYERS` import, add:

```ts
const DATA_LAYERS = LIVE_LAYERS.filter((l) => l.renderer !== 'panel');
const COMMUNITY_LAYERS = LIVE_LAYERS.filter((l) => l.renderer === 'panel');
```

replace `{LIVE_LAYERS.map((l) => (` in the "Live feeds and snapshots" table with `{DATA_LAYERS.map((l) => (`, and add before `<h2>Static GeoJSON layers</h2>`:

```astro
    <h2 id="community">Community (not a source)</h2>
    <p class="sources-intro">Reader comments on Bluesky, shown only in the Community panel of trackers where the maintainer enabled it. They carry no tier and are never used as data (<a href={`${import.meta.env.BASE_URL}about/#community-comments`}>how comments work</a>).</p>
    <ul>
      {COMMUNITY_LAYERS.map((l) => (
        <li><code>{l.id}</code> — {l.attribution.source} · TTL {fmtTtl(l.kind === 'feed' ? l.ttlMs : 0)} · {l.attribution.license}</li>
      ))}
    </ul>
```

Add to `src/lib/community/separation.test.ts` inside the `describe`:

```ts
  it('/sources/ never lists community feeds in the data table', () => {
    const src = readFileSync(resolve(ROOT, 'src/pages/sources.astro'), 'utf8');
    expect(src).toMatch(/DATA_LAYERS\s*=\s*LIVE_LAYERS\.filter\(\(l\) => l\.renderer !== 'panel'\)/);
    expect(src).not.toMatch(/\{LIVE_LAYERS\.map\(/);
    expect(src).toMatch(/Community \(not a source\)/);
  });
```

- [ ] **Step 8: Run, expect pass; then the whole suite.**

```bash
npx vitest run src/lib/live-layers.test.ts src/lib/degraded-sources.test.ts src/lib/snapshots.test.ts src/lib/community/separation.test.ts
npm test 2>&1 | tail -5
npx tsc --noEmit -p . 2>&1 | grep -E 'live-layers|degraded-sources|sources.astro'; echo "tsc lines above (must be none)"
```

Expected: all pass; `npm test` summary has `0 failed`.

- [ ] **Step 9: Commit.**

```bash
git add src/lib/live-layers.ts src/lib/live-layers.test.ts src/lib/degraded-sources.ts src/lib/degraded-sources.test.ts src/lib/community/separation.test.ts src/pages/sources.astro src/layouts/BaseLayout.astro public/_headers
git commit -m "feat(community): register public.api.bsky.app as a panel-only feed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 6 — `community` tracker config field and a kill switch that reaches production

**`BLOCKED ON OWNER DECISION Q1, Q13`** (Q13: Docker default).

**Files:** Modify `src/lib/tracker-config.ts` (inside `TrackerConfigSchema`, `:148-200`), `.github/workflows/deploy.yml` (build step env, `:107-120`), `Dockerfile` (before `RUN npm run build`, `:27`), `docs/self-hosting.md`. Create `src/lib/community/kill-switch.test.ts`.
**Consumes:** `communityEnabledFor` (Task 3). **Produces:**

```ts
// tracker-config.ts
community: z.object({ enabled: z.boolean().default(false) }).strict().optional(),
```

plus the repo variable `PUBLIC_COMMUNITY_ENABLED` reaching the production build, and `ARG PUBLIC_COMMUNITY_ENABLED=false` in the image.

Why: in the first draft the switch existed only in code. `deploy.yml:107-120` passes only `PUBLIC_POSTHOG_*` to the build, and the `Dockerfile` declares no `ARG`, so "turn it off" meant a PR plus a deploy. After this task the runbook is `gh variable set PUBLIC_COMMUNITY_ENABLED --body false && gh workflow run deploy.yml` (minutes). The per-tracker switch (`community.enabled: false`) still needs `gh workflow run deploy.yml` after merge, because `trackers/**` is in `paths-ignore` (`deploy.yml:19-26`); Task 16 writes that into the ADR runbook.

- [ ] **Step 1: Failing test** `src/lib/community/kill-switch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { TrackerConfigSchema } from '../tracker-config';

const ROOT = resolve(__dirname, '../../..');
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');

describe('tracker.json community field', () => {
  const base = { slug: 'x', name: 'X', shortName: 'X', description: 'd', status: 'active', startDate: '2026-01-01', sections: ['hero'], navSections: [] };
  it('is optional and defaults enabled to false', () => {
    expect(TrackerConfigSchema.parse(base).community).toBeUndefined();
    expect(TrackerConfigSchema.parse({ ...base, community: {} }).community).toEqual({ enabled: false });
  });
  it('rejects unknown keys (no tier or moderation settings smuggled in)', () => {
    expect(TrackerConfigSchema.safeParse({ ...base, community: { enabled: true, tier: 4 } }).success).toBe(false);
  });
});

describe('kill switch wiring (spec 7)', () => {
  it('the production build receives the repo variable', () => {
    const deploy = read('.github/workflows/deploy.yml');
    const build = deploy.slice(deploy.indexOf('- name: Build Astro site'), deploy.indexOf('run: npm run build'));
    expect(build).toMatch(/PUBLIC_COMMUNITY_ENABLED: \$\{\{ vars\.PUBLIC_COMMUNITY_ENABLED \}\}/);
  });
  it('the Docker image builds with comments off unless a build-arg turns them on (Q13)', () => {
    const df = read('Dockerfile');
    const arg = df.indexOf('ARG PUBLIC_COMMUNITY_ENABLED=false');
    expect(arg).toBeGreaterThan(-1);
    expect(df.indexOf('ENV PUBLIC_COMMUNITY_ENABLED=$PUBLIC_COMMUNITY_ENABLED')).toBeGreaterThan(arg);
    expect(df.indexOf('RUN npm run build')).toBeGreaterThan(arg);
  });
  it('no production workflow or image sets the e2e-only "force" value', () => {
    const files = [
      ...readdirSync(resolve(ROOT, '.github/workflows')).filter((f) => f !== 'e2e.yml').map((f) => `.github/workflows/${f}`),
      'Dockerfile', 'docker-compose.yml', 'astro.config.mjs',
    ];
    for (const f of files) expect(read(f), f).not.toMatch(/PUBLIC_COMMUNITY_ENABLED\s*[:=]\s*['"]?force/);
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run src/lib/community/kill-switch.test.ts` → the config tests fail (`community` stripped as unknown → `undefined` vs `{ enabled: false }`), and both wiring tests fail.

- [ ] **Step 3: Config field.** In `src/lib/tracker-config.ts`, after `githubRepo: z.string().optional(),` (`:200`):

```ts

  /** Community comments panel (ADR-0003). Off unless the owner enables it per tracker. */
  community: z.object({ enabled: z.boolean().default(false) }).strict().optional(),
```

- [ ] **Step 4: Wire the variable into `deploy.yml`.** In the "Build Astro site" step's `env:` (after `PUBLIC_POSTHOG_HOST: https://us.i.posthog.com`, `:119`):

```yaml
          # Community comments kill switch (ADR-0003). Unset = tracker.json decides;
          # 'false' = every panel off. Runbook: gh variable set PUBLIC_COMMUNITY_ENABLED
          # --body false && gh workflow run deploy.yml
          PUBLIC_COMMUNITY_ENABLED: ${{ vars.PUBLIC_COMMUNITY_ENABLED }}
```

- [ ] **Step 5: Docker default.** In `Dockerfile`, right after `COPY . .` (`:26`) and before `RUN npm run build`:

```dockerfile
# Community comments (ADR-0003) are off in self-hosted images by default: the
# owner's blocklist is bundled at build time and would freeze at the image date.
# Turn on with --build-arg PUBLIC_COMMUNITY_ENABLED=true.
ARG PUBLIC_COMMUNITY_ENABLED=false
ENV PUBLIC_COMMUNITY_ENABLED=$PUBLIC_COMMUNITY_ENABLED
```

and append to `docs/self-hosting.md` (after its env-var table section) one paragraph: "Community comments: off by default in the image (`--build-arg PUBLIC_COMMUNITY_ENABLED=true` to enable). The blocklist in `src/data/community/blocklist.json` is baked at build time; rebuild to pick up the maintainer's blocks."

- [ ] **Step 6: Run, expect pass; confirm no tracker broke; regenerate the env table.**

```bash
npx vitest run src/lib/community/kill-switch.test.ts src/lib/community-shared.test.ts
ls -d trackers/*/tracker.json | wc -l
npx tsx -e "import('./scripts/lib/load-trackers-node.ts').then(m => console.log('parsed', m.loadAllTrackers().length))" 2>/dev/null
npx tsx scripts/list-env-vars.ts --write docs/self-hosting.md
npx tsx scripts/list-env-vars.ts --check docs/self-hosting.md; echo "check exit=$?"
grep -n 'PUBLIC_COMMUNITY_ENABLED' docs/self-hosting.md
npx tsc --noEmit -p . 2>&1 | grep -E 'community|tracker-config' ; echo "tsc lines above (must be none)"
```

Expected: 5 + 10 passed; the `parsed N` count equals the `wc -l` count (the loader at `scripts/lib/load-trackers-node.ts:31-33` logs and skips invalid configs, so the count comparison is the real check); `check exit=0`; the table row for `PUBLIC_COMMUNITY_ENABLED` lists `src/lib/community-shared.ts`; no tsc lines.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/tracker-config.ts src/lib/community/kill-switch.test.ts .github/workflows/deploy.yml Dockerfile docs/self-hosting.md
git commit -m "feat(community): community.enabled field; kill switch wired to deploy.yml and Docker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 7 — Extract the Bluesky login client

**`BLOCKED ON OWNER DECISION Q1`** (pure refactor; harmless, but pointless if Q1 = b).

**Files:** Create `scripts/lib/bluesky-client.ts`, `scripts/lib/bluesky-client.test.ts`. Modify `scripts/bluesky-post.ts` (remove `:45-58`, add import).
**Consumes:** env `BLUESKY_HANDLE`, `BLUESKY_PASSWORD`. **Produces:** `export async function getBlueskyAgent(creds?: { handle?: string; password?: string }): Promise<BskyAgent | null>` — same body as `scripts/bluesky-post.ts:47-58`, credentials injectable for the test. The default parameter reads **literal** `process.env.BLUESKY_HANDLE` / `process.env.BLUESKY_PASSWORD`: `scripts/list-env-vars.ts:23` only matches `process.env.X`, and `docs/self-hosting.md:79-80` lists both variables with `scripts/bluesky-post.ts`; an `env.X` read would change that file list and turn `test.yml:35-36` red. `bluesky-post.ts` keeps its "skip when missing" behaviour; the new script (Task 8) treats `null` as a failure.

- [ ] **Step 1: Failing test** `scripts/lib/bluesky-client.test.ts` (no network: the missing-credential path returns before `login`):

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getBlueskyAgent } from './bluesky-client';

describe('getBlueskyAgent', () => {
  it('returns null without credentials instead of throwing', async () => {
    expect(await getBlueskyAgent({})).toBeNull();
    expect(await getBlueskyAgent({ handle: 'x.test' })).toBeNull();
  });
  it('reads the env with literal process.env.X so the env-var table stays correct', () => {
    const src = readFileSync(resolve(__dirname, 'bluesky-client.ts'), 'utf8');
    expect(src).toMatch(/process\.env\.BLUESKY_HANDLE/);
    expect(src).toMatch(/process\.env\.BLUESKY_PASSWORD/);
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run scripts/lib/bluesky-client.test.ts` → cannot resolve `./bluesky-client`.

- [ ] **Step 3: Implement** `scripts/lib/bluesky-client.ts`:

```ts
/** Bluesky login shared by scripts/bluesky-post.ts and scripts/community-threads.ts. */
import { BskyAgent } from '@atproto/api';

export async function getBlueskyAgent(
  creds: { handle?: string; password?: string } = { handle: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_PASSWORD },
): Promise<BskyAgent | null> {
  const { handle, password } = creds;
  if (!handle || !password) {
    console.log('[bluesky] Missing BLUESKY_HANDLE or BLUESKY_PASSWORD — skipping');
    return null;
  }
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: handle, password });
  console.log(`[bluesky] Logged in as ${handle}`);
  return agent;
}
```

In `scripts/bluesky-post.ts`, delete the `// ── Bluesky client ──` block (`:45-58`) and add after the `@atproto/api` import (`:23`):

```ts
import { getBlueskyAgent } from './lib/bluesky-client.js';
```

- [ ] **Step 4: Verify the refactor is behaviour-neutral.**

```bash
npx vitest run scripts/lib/bluesky-client.test.ts
grep -c 'async function getBlueskyAgent' scripts/bluesky-post.ts   # expect 0
grep -c 'getBlueskyAgent()' scripts/bluesky-post.ts                # expect 2 (postFromQueue ~:449, postFromRSS ~:649)
env -u BLUESKY_HANDLE -u BLUESKY_PASSWORD npx tsx scripts/bluesky-post.ts --dry-run > /dev/null; echo "exit=$?"
npx tsc --noEmit -p . 2>&1 | grep -E 'bluesky-(post|client)'; echo "tsc lines above (must be none)"
npx tsx scripts/list-env-vars.ts --write docs/self-hosting.md
npx tsx scripts/list-env-vars.ts --check docs/self-hosting.md; echo "check exit=$?"
grep -n 'BLUESKY_HANDLE' docs/self-hosting.md
```

Expected: 2 passed, `0`, `2`, `exit=0` (the module loads and the new import resolves; `--dry-run` returns before login at `scripts/bluesky-post.ts:432-447`, so it never posts), no tsc lines, `check exit=0`, and the `BLUESKY_HANDLE` row now lists `scripts/lib/bluesky-client.ts` (and still `scripts/post-video-social.ts`).

- [ ] **Step 5: Commit.**

```bash
git add scripts/lib/bluesky-client.ts scripts/lib/bluesky-client.test.ts scripts/bluesky-post.ts docs/self-hosting.md
git commit -m "refactor(bluesky): move login into scripts/lib/bluesky-client.ts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 8 — `scripts/community-threads.ts` (root post by cadence, nothing written to the repo)

**`BLOCKED ON OWNER DECISION Q1, Q3, Q4, Q10`** — Q3 decides whether dedicated roots are posted at all (options (c)/(d) re-plan this task) and which account's secrets the script logs in with; Q4 is the reply policy; Q10 the post language. The script refuses to run without an explicit `COMMUNITY_REPLY_POLICY` and `COMMUNITY_ROOT_LANG`, so neither can be skipped by accident.

**Files:** Create `scripts/community-threads.ts`, `scripts/community-threads.test.ts`.
**Consumes:** `COMMUNITY_ACTOR`, `rootMarker`, `threadCadenceDays`, `findRoot`, `communityEnabledFor` (Task 3); `getBlueskyAgent` (Task 7); `loadAllTrackers` (`scripts/lib/load-trackers-node.ts:16`); `TrackerConfig.community` (Task 6).
**Produces:**

```ts
export type ReplyPolicy = 'everyone' | 'followers' | 'closed';
export type RootLang = 'en' | 'es' | 'en+es';
export function parseReplyPolicy(raw: string | undefined): ReplyPolicy;               // throws when unset/unknown
export function parseRootLang(raw: string | undefined): RootLang;                     // throws when unset/unknown
export function threadgateRecord(postUri: string, policy: ReplyPolicy, createdAt: string): Record<string, unknown> | null;
export function rootPostText(t: { shortName: string; slug: string }, date: string, lang: RootLang): string;
export interface Poster {
  handle: string;
  post(text: string, langs: string[]): Promise<{ uri: string; cid: string }>;
  gate(postUri: string, record: Record<string, unknown>): Promise<void>;
  deletePost(uri: string): Promise<void>;
  publicAuthorFeed(): Promise<unknown>;   // the same getAuthorFeed the panel reads
}
export interface Candidate { slug: string; shortName: string; cadenceDays: 1 | 7 }
export interface RunResult { posted: { slug: string; uri: string }[]; skipped: string[]; failed: { slug: string; error: string }[]; warnings: string[] }
export async function runCommunityThreads(o: {
  trackers: Candidate[]; poster: Poster; policy: ReplyPolicy; lang: RootLang; now: Date;
  verifyAttempts?: number; sleep?: (ms: number) => Promise<void>;
}): Promise<RunResult>;
```

Idempotency and verification both read Bluesky, not a repo file: a tracker is **due** when `findRoot()` finds no root, or the newest one is at least `cadenceDays × 24 h − 2 h` old (the slack absorbs cron jitter). After posting, the script re-reads the **public** `getAuthorFeed` until `findRoot()` returns the new URI (the panel's own lookup), and fails the slug if it never does. A re-run after a partial failure therefore posts only what is still missing. Threadgate semantics come from the installed lexicon (`node_modules/@atproto/api/dist/client/types/app/bsky/feed/threadgate.d.ts:11`): `allow` undefined = anyone may reply, `allow: []` = nobody. So `everyone` writes **no** threadgate; `followers` writes `allow: [followerRule]`; only `closed` writes `allow: []`.

- [ ] **Step 1: Failing test** `scripts/community-threads.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  parseReplyPolicy, parseRootLang, threadgateRecord, rootPostText, runCommunityThreads, type Poster, type Candidate,
} from './community-threads';
import { COMMUNITY_ACTOR } from '../src/lib/community-shared';

const NOW = new Date('2026-09-24T06:00:00Z');
const H = 3_600_000;
const item = (uri: string, slug: string, at: Date) => ({ post: { uri, cid: `c-${uri}`, author: { handle: COMMUNITY_ACTOR },
  record: { text: `Community thread\n\nhttps://watchboard.dev/${slug}/`, createdAt: at.toISOString() } } });

function fakePoster(seed: ReturnType<typeof item>[] = [], over: Partial<Poster> & { invisible?: boolean } = {}) {
  const feed = [...seed];
  let n = 0;
  const p: Poster & { feed: typeof feed } = {
    feed,
    handle: COMMUNITY_ACTOR,
    post: vi.fn(async (text: string) => {
      n += 1;
      const uri = `at://did:plc:bot/app.bsky.feed.post/p${n}`;
      const slug = /watchboard\.dev\/([a-z0-9-]+)\//.exec(text)![1];
      if (!over.invisible) feed.unshift(item(uri, slug, NOW));
      return { uri, cid: `c${n}` };
    }),
    gate: vi.fn(async () => {}),
    deletePost: vi.fn(async () => {}),
    publicAuthorFeed: vi.fn(async () => ({ feed })),
    ...over,
  };
  return p;
}
const T: Candidate[] = [{ slug: 'cdmx', shortName: 'CDMX', cadenceDays: 7 }, { slug: 'iran-conflict', shortName: 'Iran', cadenceDays: 1 }];
const run = (poster: Poster, trackers = T, policy: 'everyone' | 'followers' | 'closed' = 'everyone') =>
  runCommunityThreads({ trackers, poster, policy, lang: 'en', now: NOW, verifyAttempts: 2, sleep: async () => {} });

describe('owner decisions are explicit', () => {
  it('reply policy (Q4) and root language (Q10) have no default', () => {
    expect(() => parseReplyPolicy(undefined)).toThrow(/COMMUNITY_REPLY_POLICY/);
    expect(() => parseReplyPolicy('all')).toThrow(/everyone\|followers\|closed/);
    expect(parseReplyPolicy(' followers ')).toBe('followers');
    expect(() => parseRootLang('')).toThrow(/COMMUNITY_ROOT_LANG/);
    expect(parseRootLang('en+es')).toBe('en+es');
  });
  it('"everyone" writes no threadgate; only "closed" writes allow: []', () => {
    const uri = 'at://did:plc:bot/app.bsky.feed.post/p1';
    expect(threadgateRecord(uri, 'everyone', NOW.toISOString())).toBeNull();
    expect(threadgateRecord(uri, 'followers', NOW.toISOString())).toEqual({
      $type: 'app.bsky.feed.threadgate', post: uri, createdAt: NOW.toISOString(), allow: [{ $type: 'app.bsky.feed.threadgate#followerRule' }],
    });
    expect(threadgateRecord(uri, 'closed', NOW.toISOString())).toMatchObject({ allow: [] });
  });
});

describe('rootPostText', () => {
  for (const lang of ['en', 'es', 'en+es'] as const) {
    it(`${lang}: ≤ 300 graphemes, carries the exact marker, says "not a source"`, () => {
      const text = rootPostText({ shortName: 'X'.repeat(80), slug: 'a-very-long-tracker-slug-name' }, '2026-09-24', lang);
      expect([...new Intl.Segmenter().segment(text)].length).toBeLessThanOrEqual(300);
      expect(text).toContain('https://watchboard.dev/a-very-long-tracker-slug-name/');
      expect(text).toMatch(lang === 'es' ? /no es una fuente/i : /not a source/i);
    });
  }
});

describe('runCommunityThreads', () => {
  it('posts one root per due tracker and verifies it on the public feed', async () => {
    const p = fakePoster();
    const r = await run(p);
    expect(r.posted.map((x) => x.slug)).toEqual(['cdmx', 'iran-conflict']);
    expect(r.failed).toEqual([]);
    expect(p.gate).not.toHaveBeenCalled();
  });
  it('is idempotent against Bluesky: a fresh root is not posted again (re-run after partial failure)', async () => {
    const p = fakePoster([item('at://did:plc:bot/app.bsky.feed.post/old', 'cdmx', new Date(NOW.getTime() - 3 * 24 * H))]);
    const r = await run(p);
    expect(r.skipped).toEqual(['cdmx']);                 // weekly cadence, 3 days old
    expect(r.posted.map((x) => x.slug)).toEqual(['iran-conflict']);
  });
  it('cadence: daily roots rotate after ~24 h, weekly after ~7 days', async () => {
    const fresh = fakePoster([item('at://x/app.bsky.feed.post/i', 'iran-conflict', new Date(NOW.getTime() - 20 * H))]);
    expect((await run(fresh, [T[1]])).skipped).toEqual(['iran-conflict']);
    const due = fakePoster([item('at://x/app.bsky.feed.post/i', 'iran-conflict', new Date(NOW.getTime() - 24 * H))]);
    expect((await run(due, [T[1]])).posted).toHaveLength(1);
    const week = fakePoster([item('at://x/app.bsky.feed.post/c', 'cdmx', new Date(NOW.getTime() - 7 * 24 * H))]);
    expect((await run(week, [T[0]])).posted).toHaveLength(1);
  });
  it('an unreadable feed posts nothing (cannot prove idempotency)', async () => {
    const p = fakePoster([], { publicAuthorFeed: vi.fn(async () => { throw new Error('HTTP 502'); }) });
    const r = await run(p);
    expect(p.post).not.toHaveBeenCalled();
    expect(r.failed.map((f) => f.slug)).toEqual(['cdmx', 'iran-conflict']);
  });
  it('a failed threadgate deletes the post; a failed delete is reported with the URI', async () => {
    const p = fakePoster([], { gate: vi.fn(async () => { throw new Error('gate refused'); }), deletePost: vi.fn(async () => { throw new Error('nope'); }) });
    const r = await run(p, [T[0]], 'followers');
    expect(r.failed).toHaveLength(1);
    expect(r.warnings.join()).toMatch(/delete by hand: at:\/\/did:plc:bot\/app\.bsky\.feed\.post\/p1/);
  });
  it('a post that never shows up on the public feed is a failure, not a success', async () => {
    const r = await run(fakePoster([], { invisible: true }), [T[0]]);
    expect(r.posted).toEqual([]);
    expect(r.failed[0].error).toMatch(/not visible on the public AppView/);
  });
  it('refuses to post from an account the panel does not read', async () => {
    const r = await run(fakePoster([], { handle: 'someone-else.bsky.social' }));
    expect(r.failed).toHaveLength(2);
    expect(r.failed[0].error).toMatch(new RegExp(COMMUNITY_ACTOR.replace(/\./g, '\\.')));
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run scripts/community-threads.test.ts` → cannot resolve `./community-threads`.
- [ ] **Step 3: Implement** `scripts/community-threads.ts`:

```ts
#!/usr/bin/env tsx
/**
 * community-threads.ts — opens the Bluesky "community thread" for each eligible
 * tracker whose current thread is missing or older than its cadence (ADR-0003).
 * Writes NOTHING to the repo: idempotency and verification read the public
 * getAuthorFeed, the same lookup the panel does.
 *
 * Env: BLUESKY_HANDLE, BLUESKY_PASSWORD (via scripts/lib/bluesky-client.ts),
 *      COMMUNITY_REPLY_POLICY (everyone|followers|closed, Q4),
 *      COMMUNITY_ROOT_LANG (en|es|en+es, Q10), PUBLIC_COMMUNITY_ENABLED (kill switch).
 * Exit 1 when any eligible tracker ends without a verified current thread.
 */
import { pathToFileURL } from 'node:url';
import { RichText, type BskyAgent } from '@atproto/api';
import { COMMUNITY_ACTOR, communityEnabledFor, findRoot, threadCadenceDays } from '../src/lib/community-shared.js';
import { getBlueskyAgent } from './lib/bluesky-client.js';
import { loadAllTrackers } from './lib/load-trackers-node.js';

export type ReplyPolicy = 'everyone' | 'followers' | 'closed';
export type RootLang = 'en' | 'es' | 'en+es';

export function parseReplyPolicy(raw: string | undefined): ReplyPolicy {
  const v = String(raw ?? '').trim();
  if (!v) throw new Error('COMMUNITY_REPLY_POLICY is not set (owner decision Q4)');
  if (v === 'everyone' || v === 'followers' || v === 'closed') return v;
  throw new Error(`COMMUNITY_REPLY_POLICY must be everyone|followers|closed, got "${v}"`);
}

export function parseRootLang(raw: string | undefined): RootLang {
  const v = String(raw ?? '').trim();
  if (!v) throw new Error('COMMUNITY_ROOT_LANG is not set (owner decision Q10)');
  if (v === 'en' || v === 'es' || v === 'en+es') return v;
  throw new Error(`COMMUNITY_ROOT_LANG must be en|es|en+es, got "${v}"`);
}

export function threadgateRecord(postUri: string, policy: ReplyPolicy, createdAt: string): Record<string, unknown> | null {
  if (policy === 'everyone') return null; // no record = anyone may reply
  const allow = policy === 'followers' ? [{ $type: 'app.bsky.feed.threadgate#followerRule' }] : [];
  return { $type: 'app.bsky.feed.threadgate', post: postUri, createdAt, allow };
}

const EN = (n: string, d: string) => `Community thread · ${n} · ${d}\n\nWhat are you seeing? Replies show on the tracker page in a panel marked "reader comments, not a source".`;
const ES = (n: string, d: string) => `Hilo de la comunidad · ${n} · ${d}\n\n¿Qué estás viendo? Las respuestas se ven en la página del tracker, en un panel marcado "comentarios de lectores, no es una fuente".`;

export function rootPostText(t: { shortName: string; slug: string }, date: string, lang: RootLang): string {
  const name = t.shortName.length > 40 ? `${t.shortName.slice(0, 39)}…` : t.shortName;
  const url = `https://watchboard.dev/${t.slug}/`; // fixed: this URL is the marker findRoot() looks for
  const en = `Community · ${name} · ${date}\nWhat are you seeing? Replies appear on the tracker page as "reader comments, not a source".`;
  const es = `¿Qué estás viendo? Se muestran como "comentarios de lectores, no es una fuente".`;
  const body = lang === 'en' ? EN(name, date) : lang === 'es' ? ES(name, date) : `${en}\n${es}`;
  return `${body}\n\n${url}`;
}

export interface Poster {
  handle: string;
  post(text: string, langs: string[]): Promise<{ uri: string; cid: string }>;
  gate(postUri: string, record: Record<string, unknown>): Promise<void>;
  deletePost(uri: string): Promise<void>;
  publicAuthorFeed(): Promise<unknown>;
}
export interface Candidate { slug: string; shortName: string; cadenceDays: 1 | 7 }
export interface RunResult { posted: { slug: string; uri: string }[]; skipped: string[]; failed: { slug: string; error: string }[]; warnings: string[] }

const H = 3_600_000;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LANGS: Record<RootLang, string[]> = { en: ['en'], es: ['es'], 'en+es': ['en', 'es'] };

export async function runCommunityThreads(o: {
  trackers: Candidate[]; poster: Poster; policy: ReplyPolicy; lang: RootLang; now: Date;
  verifyAttempts?: number; sleep?: (ms: number) => Promise<void>;
}): Promise<RunResult> {
  const res: RunResult = { posted: [], skipped: [], failed: [], warnings: [] };
  const failAll = (error: string) => { for (const t of o.trackers) res.failed.push({ slug: t.slug, error }); return res; };
  if (o.poster.handle !== COMMUNITY_ACTOR) return failAll(`logged in as ${o.poster.handle}, but the panel reads ${COMMUNITY_ACTOR} (Q3)`);
  let feed: unknown;
  try { feed = await o.poster.publicAuthorFeed(); findRoot(feed, '_probe', o.now, 1); } catch (e) { return failAll(`cannot read the public feed, posting nothing: ${msg(e)}`); }

  const date = o.now.toISOString().slice(0, 10);
  const pending: { slug: string; uri: string; cadenceDays: number }[] = [];
  for (const t of o.trackers) {
    const current = findRoot(feed, t.slug, o.now, t.cadenceDays);
    if (current && o.now.getTime() - Date.parse(current.createdAt) < t.cadenceDays * 24 * H - 2 * H) { res.skipped.push(t.slug); continue; }
    let created: { uri: string; cid: string } | null = null;
    try {
      created = await o.poster.post(rootPostText(t, date, o.lang), LANGS[o.lang]);
      const gate = threadgateRecord(created.uri, o.policy, o.now.toISOString());
      if (gate) await o.poster.gate(created.uri, gate);
      pending.push({ slug: t.slug, uri: created.uri, cadenceDays: t.cadenceDays });
    } catch (e) {
      if (created) {
        try { await o.poster.deletePost(created.uri); } catch (d) { res.warnings.push(`${t.slug}: ungated post left behind, delete by hand: ${created.uri} (${msg(d)})`); }
      }
      res.failed.push({ slug: t.slug, error: msg(e) });
    }
  }

  // Verify where the reader looks: the public AppView, via the panel's own lookup.
  const attempts = o.verifyAttempts ?? 6;
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let left = pending;
  for (let i = 0; i < attempts && left.length; i += 1) {
    if (i > 0) await sleep(5_000);
    let f: unknown;
    try { f = await o.poster.publicAuthorFeed(); } catch (e) { res.warnings.push(`verify attempt ${i + 1}: ${msg(e)}`); continue; }
    const seen = left.filter((p) => findRoot(f, p.slug, o.now, p.cadenceDays)?.uri === p.uri);
    for (const p of seen) res.posted.push({ slug: p.slug, uri: p.uri });
    left = left.filter((p) => !seen.includes(p));
  }
  for (const p of left) res.failed.push({ slug: p.slug, error: `posted ${p.uri} but it is not visible on the public AppView after ${attempts} checks` });
  return res;
}
```

Append the adapter and entry point to the same file:

```ts
const APPVIEW_FEED = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${COMMUNITY_ACTOR}&filter=posts_no_replies&limit=100`;

function blueskyPoster(agent: BskyAgent): Poster {
  const session = agent.session;
  if (!session) throw new Error('Bluesky agent has no session');
  return {
    handle: session.handle,
    async post(text, langs) {
      const rt = new RichText({ text });
      await rt.detectFacets(agent);
      const r = await agent.post({ text: rt.text, facets: rt.facets, langs, createdAt: new Date().toISOString() });
      return { uri: r.uri, cid: r.cid };
    },
    async gate(postUri, record) {
      await agent.com.atproto.repo.createRecord({ repo: session.did, collection: 'app.bsky.feed.threadgate', rkey: postUri.split('/').pop()!, record });
    },
    async deletePost(uri) { await agent.deletePost(uri); },
    async publicAuthorFeed() {
      const r = await fetch(APPVIEW_FEED, { headers: { 'cache-control': 'no-cache' } });
      if (!r.ok) throw new Error(`getAuthorFeed HTTP ${r.status}`);
      return r.json();
    },
  };
}

async function main(): Promise<void> {
  const flag = process.env.PUBLIC_COMMUNITY_ENABLED;
  if (String(flag ?? '').trim().toLowerCase() === 'force') throw new Error('PUBLIC_COMMUNITY_ENABLED=force is for Playwright only; refusing to post');
  const policy = parseReplyPolicy(process.env.COMMUNITY_REPLY_POLICY);
  const lang = parseRootLang(process.env.COMMUNITY_ROOT_LANG);
  const trackers: Candidate[] = loadAllTrackers()
    .filter((t) => communityEnabledFor(t, flag)) // the page's own predicate: active + enabled + kill switch
    .map((t) => ({ slug: t.slug, shortName: t.shortName, cadenceDays: threadCadenceDays(t.ai?.updateIntervalDays) }));
  console.log(`[community] ${trackers.length} eligible tracker(s): ${trackers.map((t) => `${t.slug}/${t.cadenceDays}d`).join(', ') || '(none)'}`);
  if (trackers.length === 0) return; // explicit, logged no-op (before the pilot, or kill switch on)
  const agent = await getBlueskyAgent();
  if (!agent) { console.error('::error::community-threads: Bluesky credentials missing'); process.exit(1); }
  const res = await runCommunityThreads({ trackers, poster: blueskyPoster(agent), policy, lang, now: new Date() });
  console.log(`[community] posted=${res.posted.length} skipped=${res.skipped.length} failed=${res.failed.length}`);
  for (const p of res.posted) console.log(`[community] ${p.slug} → ${p.uri}`);
  for (const w of res.warnings) console.log(`::warning::${w}`);
  for (const f of res.failed) console.error(`::error::${f.slug}: ${f.error}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Community threads\n\n| slug | result |\n|---|---|\n${[
      ...res.posted.map((p) => `| ${p.slug} | posted ${p.uri} |`),
      ...res.skipped.map((s) => `| ${s} | current thread still open |`),
      ...res.failed.map((f) => `| ${f.slug} | **failed**: ${f.error} |`),
    ].join('\n')}\n`);
  }
  if (res.failed.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('::error::community-threads fatal:', e); process.exit(1); });
}
```

- [ ] **Step 4: Run, expect pass**, then re-run the separation guard (the script is in `scripts/` and must not import `lib/community/`), refresh the env table, and exercise the no-op and refusal paths:

```bash
npx vitest run scripts/community-threads.test.ts src/lib/community/separation.test.ts
npx tsc --noEmit -p . 2>&1 | grep -E 'community-threads'; echo "tsc lines above (must be none)"
npx tsx scripts/list-env-vars.ts --write docs/self-hosting.md
npx tsx scripts/list-env-vars.ts --check docs/self-hosting.md; echo "check exit=$?"
COMMUNITY_REPLY_POLICY=everyone COMMUNITY_ROOT_LANG=en npx tsx scripts/community-threads.ts; echo "exit=$?"
env -u COMMUNITY_REPLY_POLICY COMMUNITY_ROOT_LANG=en npx tsx scripts/community-threads.ts; echo "exit=$?"
PUBLIC_COMMUNITY_ENABLED=force COMMUNITY_REPLY_POLICY=everyone COMMUNITY_ROOT_LANG=en npx tsx scripts/community-threads.ts; echo "exit=$?"
git status --short
```

Expected: 12 + all separation tests pass; no tsc lines; `check exit=0` and the table gains `COMMUNITY_REPLY_POLICY`, `COMMUNITY_ROOT_LANG`, and `scripts/community-threads.ts` on `PUBLIC_COMMUNITY_ENABLED`; first run prints `0 eligible tracker(s): (none)` and `exit=0`; second prints `COMMUNITY_REPLY_POLICY is not set` and `exit=1`; third prints `force is for Playwright only` and `exit=1`; `git status --short` shows only the files of this task and `docs/self-hosting.md` (the script wrote nothing).

- [ ] **Step 5: Commit.**

```bash
git add scripts/community-threads.ts scripts/community-threads.test.ts docs/self-hosting.md
git commit -m "feat(community): root post per eligible tracker by cadence, verified on the public feed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 9 — `community-threads.yml` workflow

**`BLOCKED ON OWNER DECISION Q1, Q3, Q4, Q10`** (the cron itself stays off until Q5, Task 16).

**Files:** Create `.github/workflows/community-threads.yml`, `src/lib/community/workflow.test.ts`.
**Consumes:** `scripts/community-threads.ts` (Task 8); repo secrets `BLUESKY_HANDLE`/`BLUESKY_PASSWORD` (already used by `.github/workflows/post-social-queue.yml:35-38` and checked by `.github/workflows/credential-canary.yml:58-68`); repo **variables** `COMMUNITY_REPLY_POLICY` (Q4), `COMMUNITY_ROOT_LANG` (Q10) and `PUBLIC_COMMUNITY_ENABLED` (kill switch, Task 6); secrets `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALERT_CHAT_ID` for the failure alert. If Q3 picks a separate account, replace both Bluesky secret names with `COMMUNITY_BLUESKY_HANDLE`/`COMMUNITY_BLUESKY_PASSWORD`, change `COMMUNITY_ACTOR` (Task 3), and add a matching step to the canary in the same PR.
**Produces:** a manual-dispatch workflow that runs the script and **commits nothing**. No push means no `GITHUB_TOKEN` push that `deploy.yml` never sees (`deploy.yml:32-37`), no `main-commits` queue (where a newer pending run cancels an older one, grey instead of red), and no half-committed state to double-post from. A failed or cancelled run alerts the private ops chat, never `TELEGRAM_CHANNEL_ID` (CLAUDE.md, credential canary).

- [ ] **Step 1: Failing test** `src/lib/community/workflow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// No YAML parser is a direct dependency (package.json), so assert on the text.
const ROOT = resolve(__dirname, '../../..');
const raw = readFileSync(resolve(ROOT, '.github/workflows/community-threads.yml'), 'utf8');
const onBlock = raw.split(/^on:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';

describe('community-threads.yml', () => {
  it('is dispatch-only until the owner enables the pilot (Q5)', () => {
    expect(onBlock).toMatch(/^\s+workflow_dispatch:/m);
    expect(onBlock).not.toMatch(/^\s+schedule:/m);
    expect(onBlock).not.toMatch(/^\s+push:/m);
  });
  it('commits nothing and does not queue behind the state-commit workflows', () => {
    expect(raw).not.toMatch(/git (add|commit|push)/);
    expect(raw).not.toMatch(/contents: write/);
    expect(raw).not.toMatch(/group: main-commits/);
    expect(raw).toMatch(/^\s+group: community-threads$/m);
  });
  it('passes every owner decision and the kill switch as repo variables', () => {
    for (const v of ['COMMUNITY_REPLY_POLICY', 'COMMUNITY_ROOT_LANG', 'PUBLIC_COMMUNITY_ENABLED']) {
      expect(raw).toMatch(new RegExp(`${v}: \\$\\{\\{ vars\\.${v} \\}\\}`));
    }
    expect(raw).toMatch(/run: npx tsx scripts\/community-threads\.ts/);
    expect(raw).not.toMatch(/community-threads\.ts\s*\|\|\s*true/);   // a swallowed exit code is a silent success
  });
  it('alerts the private ops chat on failure or cancellation, never the public channel', () => {
    expect(raw).toMatch(/if: failure\(\) \|\| cancelled\(\)/);
    expect(raw).toMatch(/TELEGRAM_CHAT_ID: \$\{\{ secrets\.TELEGRAM_ALERT_CHAT_ID \}\}/);
    expect(raw).not.toMatch(/TELEGRAM_CHANNEL_ID/);
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run src/lib/community/workflow.test.ts` → `ENOENT … community-threads.yml`.

- [ ] **Step 3: Create** `.github/workflows/community-threads.yml`:

```yaml
name: Community threads

# Opens the Bluesky "community thread" for each eligible tracker whose current
# thread is missing or older than its cadence (ADR-0003). Commits nothing: the
# panel discovers threads at runtime on the public AppView, and the script
# verifies each new post there before reporting success.
# BLOCKED ON OWNER DECISION Q5: the schedule is added in Task 16.
on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: community-threads
  cancel-in-progress: false

jobs:
  threads:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      - name: Open due community threads (verified on the public AppView)
        env:
          BLUESKY_HANDLE: ${{ secrets.BLUESKY_HANDLE }}
          BLUESKY_PASSWORD: ${{ secrets.BLUESKY_PASSWORD }}
          COMMUNITY_REPLY_POLICY: ${{ vars.COMMUNITY_REPLY_POLICY }}
          COMMUNITY_ROOT_LANG: ${{ vars.COMMUNITY_ROOT_LANG }}
          PUBLIC_COMMUNITY_ENABLED: ${{ vars.PUBLIC_COMMUNITY_ENABLED }}
        run: npx tsx scripts/community-threads.ts

  notify-failure:
    needs: [threads]
    # cancelled() too: a timeout reports as cancelled, not failed (hourly-scan.yml:1082-1088).
    if: failure() || cancelled()
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Telegram failure alert (private ops chat)
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          # Infra alerts go to TELEGRAM_ALERT_CHAT_ID, never the public channel.
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_ALERT_CHAT_ID }}
          RESULT: ${{ needs.threads.result }}
        run: |
          if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
            echo "Telegram secrets missing; skipping alert"
            exit 0
          fi
          RUN_URL="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          TEXT=$(printf '⚠️ Community threads failed (%s)\n\nA pilot tracker may have no open thread.\n\n%s' "$RESULT" "$RUN_URL")
          PAYLOAD=$(jq -n --arg c "$TELEGRAM_CHAT_ID" --arg t "$TEXT" '{chat_id:$c, text:$t}')
          curl -s --max-time 15 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -H 'Content-Type: application/json' -d "$PAYLOAD" > /dev/null
```

- [ ] **Step 4: Run, expect pass.** `npx vitest run src/lib/community/workflow.test.ts` → 4 passed.

- [ ] **Step 5: Commit.**

```bash
git add .github/workflows/community-threads.yml src/lib/community/workflow.test.ts
git commit -m "ci(community): dispatch-only threads workflow, no commits, failure alert to ops chat

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 10 — i18n strings

**`BLOCKED ON OWNER DECISION Q1, Q6`** — Q6 supplies the removal-request address that goes **inside** `community.contract` in all four locales (es/fr/pt readers have no localized `/about`, Deviation 3), and says whether the wording gets legal review. Replace every `OWNER_CONTACT` below with that address before running Step 4.

**Files:** Modify `src/i18n/translations.ts` (objects `en` `:9`, `es` `:735`, `fr` `:1434`, `pt` `:2133`; each non-`en` object is typed `TranslationKeys`, so a missing key is a tsc error). Create `src/lib/community/i18n.test.ts`.
**Consumes:** `t()` (`src/i18n/translations.ts:2834`). **Produces:** keys `COMMUNITY_I18N_KEYS` (below) in 4 locales.

Changes from the first draft, each from the review: no "today/yesterday" (UTC vs the reader's day) → `community.thread`; no "Report on Bluesky" control that only opened the post → one honest `community.openOnBluesky`; status as text (`community.statusUpdated`, `community.statusStale`) instead of `SourceStatusChip`; the Q6 contact inside `community.contract`.

- [ ] **Step 1: Failing test** `src/lib/community/i18n.test.ts` (vitest does not type-check, so the test asserts presence and translation at runtime):

```ts
import { describe, it, expect } from 'vitest';
import { t, SUPPORTED_LOCALES, type TranslationKey } from '../../i18n/translations';

const COMMUNITY_I18N_KEYS = [
  'community.title', 'community.banner', 'community.open', 'community.close', 'community.loading',
  'community.comment', 'community.openOnBluesky', 'community.empty', 'community.error',
  'community.statusUpdated', 'community.statusStale', 'community.noThread', 'community.thread', 'community.more',
  'community.contract', 'community.aboutLink', 'layers.communityBluesky', 'layers.communityBlueskyRoots',
] as const;
const tt = (k: string, l: (typeof SUPPORTED_LOCALES)[number]) => t(k as TranslationKey, l);

describe('community strings', () => {
  it('exist in every locale and are translated (not the English fallback)', () => {
    for (const k of COMMUNITY_I18N_KEYS) {
      const en = tt(k, 'en');
      expect(en, k).not.toBe(k);
      for (const loc of SUPPORTED_LOCALES.filter((l) => l !== 'en')) expect(tt(k, loc), `${k} ${loc}`).not.toBe(en);
    }
  });
  it('every banner says "not a source" in its language', () => {
    expect(tt('community.banner', 'en')).toMatch(/not a Watchboard source/);
    expect(tt('community.banner', 'es')).toMatch(/no es una fuente/i);
    expect(tt('community.banner', 'fr')).toMatch(/pas une source/i);
    expect(tt('community.banner', 'pt')).toMatch(/não é uma fonte/i);
  });
  it('every contract carries the Q6 removal contact, never a placeholder', () => {
    for (const loc of SUPPORTED_LOCALES) {
      const c = tt('community.contract', loc);
      expect(c, loc).toMatch(/[^\s@]+@[^\s@]+\.[a-z]{2,}/);
      expect(c, loc).not.toMatch(/OWNER_CONTACT|example\.com/);
    }
  });
  it('no "today"/"yesterday" label and no separate report control', () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(tt('community.thread', loc)).toContain('{date}');
      expect(tt('community.openOnBluesky', loc)).toMatch(/Bluesky/);
    }
  });
  it('the error string never reads like a count', () => {
    for (const loc of SUPPORTED_LOCALES) expect(tt('community.error', loc)).not.toMatch(/\b0\b/);
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run src/lib/community/i18n.test.ts` → `community.title: expected 'community.title' not to be 'community.title'`.

- [ ] **Step 3: Add the keys.** Append each block at the end of its locale object (before its closing `};`):

```ts
  // en — Community comments (ADR-0003)
  'community.title': 'Community',
  'community.banner': 'Reader opinions on Bluesky · Not verified · Not a Watchboard source',
  'community.open': 'Show community comments',
  'community.close': 'Hide community comments',
  'community.loading': 'Loading comments…',
  'community.comment': 'Comment on Bluesky',
  'community.openOnBluesky': 'Open on Bluesky to reply or report',
  'community.empty': 'No replies yet. Start the conversation on Bluesky.',
  'community.error': 'Could not load comments from Bluesky right now.',
  'community.statusUpdated': 'Updated {age}',
  'community.statusStale': 'Could not refresh; showing the last comments loaded',
  'community.noThread': 'No conversation is open for this tracker right now.',
  'community.thread': 'Thread · {date}',
  'community.more': 'See all {n} replies on Bluesky',
  'community.contract': 'These are reader opinions hosted on Bluesky. Watchboard does not verify them, gives them no source tier and never uses them as data. Hidden here: replies the maintainer hid, accounts on our blocklist, and posts or accounts Bluesky labels as hidden from logged-out readers. To ask for a comment to stop being shown here, write to OWNER_CONTACT.',
  'community.aboutLink': 'How comments work',
  'layers.communityBluesky': 'Community replies (Bluesky)',
  'layers.communityBlueskyRoots': 'Community thread finder (Bluesky)',
```

```ts
  // es
  'community.title': 'Comunidad',
  'community.banner': 'Opiniones de lectores en Bluesky · Sin verificar · No es una fuente de Watchboard',
  'community.open': 'Ver comentarios de la comunidad',
  'community.close': 'Ocultar comentarios de la comunidad',
  'community.loading': 'Cargando comentarios…',
  'community.comment': 'Comentar en Bluesky',
  'community.openOnBluesky': 'Abrir en Bluesky para responder o reportar',
  'community.empty': 'Aún no hay respuestas. Empieza la conversación en Bluesky.',
  'community.error': 'No se pudieron cargar los comentarios de Bluesky ahora.',
  'community.statusUpdated': 'Actualizado {age}',
  'community.statusStale': 'No se pudo actualizar; se muestran los últimos comentarios cargados',
  'community.noThread': 'Ahora no hay conversación abierta para este tracker.',
  'community.thread': 'Hilo · {date}',
  'community.more': 'Ver las {n} respuestas en Bluesky',
  'community.contract': 'Son opiniones de lectores alojadas en Bluesky. Watchboard no las verifica, no les asigna tier de fuente y nunca las usa como datos. Aquí se ocultan: respuestas que el responsable ocultó, cuentas de nuestra lista de bloqueo y posts o cuentas que Bluesky oculta a quien no ha iniciado sesión. Para pedir que un comentario deje de mostrarse aquí, escribe a OWNER_CONTACT.',
  'community.aboutLink': 'Cómo funcionan los comentarios',
  'layers.communityBluesky': 'Respuestas de la comunidad (Bluesky)',
  'layers.communityBlueskyRoots': 'Buscador del hilo de la comunidad (Bluesky)',
```

```ts
  // fr
  'community.title': 'Communauté',
  'community.banner': 'Avis de lecteurs sur Bluesky · Non vérifié · Pas une source de Watchboard',
  'community.open': 'Afficher les commentaires de la communauté',
  'community.close': 'Masquer les commentaires de la communauté',
  'community.loading': 'Chargement des commentaires…',
  'community.comment': 'Commenter sur Bluesky',
  'community.openOnBluesky': 'Ouvrir sur Bluesky pour répondre ou signaler',
  'community.empty': 'Pas encore de réponses. Lancez la conversation sur Bluesky.',
  'community.error': 'Impossible de charger les commentaires de Bluesky pour le moment.',
  'community.statusUpdated': 'Mis à jour {age}',
  'community.statusStale': 'Actualisation impossible ; derniers commentaires chargés',
  'community.noThread': "Aucune conversation n'est ouverte pour ce tracker en ce moment.",
  'community.thread': 'Fil · {date}',
  'community.more': 'Voir les {n} réponses sur Bluesky',
  'community.contract': "Ce sont des avis de lecteurs hébergés sur Bluesky. Watchboard ne les vérifie pas, ne leur attribue aucun niveau de source et ne les utilise jamais comme données. Masqués ici : les réponses masquées par le responsable, les comptes de notre liste de blocage et les posts ou comptes que Bluesky masque aux lecteurs non connectés. Pour demander qu'un commentaire ne soit plus affiché ici, écrivez à OWNER_CONTACT.",
  'community.aboutLink': 'Fonctionnement des commentaires',
  'layers.communityBluesky': 'Réponses de la communauté (Bluesky)',
  'layers.communityBlueskyRoots': 'Recherche du fil de la communauté (Bluesky)',
```

```ts
  // pt
  'community.title': 'Comunidade',
  'community.banner': 'Opiniões de leitores no Bluesky · Não verificado · Não é uma fonte do Watchboard',
  'community.open': 'Ver comentários da comunidade',
  'community.close': 'Ocultar comentários da comunidade',
  'community.loading': 'Carregando comentários…',
  'community.comment': 'Comentar no Bluesky',
  'community.openOnBluesky': 'Abrir no Bluesky para responder ou denunciar',
  'community.empty': 'Ainda não há respostas. Comece a conversa no Bluesky.',
  'community.error': 'Não foi possível carregar os comentários do Bluesky agora.',
  'community.statusUpdated': 'Atualizado {age}',
  'community.statusStale': 'Não foi possível atualizar; mostrando os últimos comentários carregados',
  'community.noThread': 'Não há conversa aberta para este tracker agora.',
  'community.thread': 'Fio · {date}',
  'community.more': 'Ver as {n} respostas no Bluesky',
  'community.contract': 'São opiniões de leitores hospedadas no Bluesky. O Watchboard não as verifica, não lhes atribui tier de fonte e nunca as usa como dados. Ocultos aqui: respostas que o responsável ocultou, contas da nossa lista de bloqueio e posts ou contas que o Bluesky oculta de leitores sem sessão. Para pedir que um comentário deixe de ser exibido aqui, escreva para OWNER_CONTACT.',
  'community.aboutLink': 'Como funcionam os comentários',
  'layers.communityBluesky': 'Respostas da comunidade (Bluesky)',
  'layers.communityBlueskyRoots': 'Localizador do fio da comunidade (Bluesky)',
```

- [ ] **Step 4: Replace the placeholder, run, expect pass; type-check the key sets.**

```bash
grep -c OWNER_CONTACT src/i18n/translations.ts            # expect 0 after replacing with the Q6 address
npx vitest run src/lib/community/i18n.test.ts src/i18n/translations.test.ts
npx tsc --noEmit -p . 2>&1 | grep 'translations.ts'; echo "tsc lines above (must be none)"
```

Expected: `0`; all pass (5 in `i18n.test.ts`); no tsc lines (a missing key in `es`/`fr`/`pt` would show `Property 'community.…' is missing`).

- [ ] **Step 5: Commit.**

```bash
git add src/i18n/translations.ts src/lib/community/i18n.test.ts
git commit -m "feat(community): panel strings in en/es/fr/pt with the removal contact

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 11 — Panel view model and `CommunityPanel.tsx`

**`BLOCKED ON OWNER DECISION Q1`** (Q14 = yes re-plans this task to add the two anonymous events; this version has none).

**Files:** Create `src/lib/community/view.ts`, `src/lib/community/view.test.ts`, `src/components/islands/community/CommunityPanel.tsx`, `src/styles/community.css`, `src/data/community/blocklist.json`. Modify `src/lib/community/separation.test.ts` (palette check).
**Consumes:** `parseThread`, `ParsedThread` (Task 2); `findRoot`, `threadCadenceDays`, `COMMUNITY_ACTOR`, `RootRef` (Task 3); `getLiveLayer('community-bluesky-roots' | 'community-bluesky')` (Task 5); `useLiveSource` (`src/lib/use-live-source.ts:36-39`); `LiveStatus` (`src/lib/live-source.ts:27-34`); `t`, `useLocale` (Task 10). **Not** `SourceStatusChip` (spec 3.1: it renders `source-chip freshness-indicator`, `SourceStatusChip.tsx:86-87`, the tier-citation class with JetBrains Mono and trust colours, `global.css:979-994`).
**Produces:**

```ts
// view.ts
export interface RootsData { root: RootRef | null }
export type PanelView =
  | { kind: 'collapsed' }
  | { kind: 'loading' }
  | { kind: 'no-thread' }
  | { kind: 'error' }
  | { kind: 'thread'; comments: CommunityComment[]; total: number; truncated: boolean; createdAt: string; rootUrl: string; stale: boolean; updatedAt: number | null };
export function communityPanelView(i: {
  open: boolean;
  rootsStatus: LiveStatus; roots: RootsData | null;
  threadStatus: LiveStatus; thread: ParsedThread | null; threadUpdatedAt: number | null;
}): PanelView;
export function formatThreadDate(iso: string, locale: string, timeZone?: string): string;   // reader's zone by default
export type TextPart = { kind: 'text'; value: string } | { kind: 'link'; href: string; value: string };
export function splitLinks(text: string): TextPart[];
export function formatCommentTime(iso: string, now: Date, locale: string): string;
// CommunityPanel.tsx
export default function CommunityPanel(props: { trackerSlug: string; updateIntervalDays?: number; locale?: Locale }): JSX.Element;
```

An empty thread is `kind: 'thread'` with `comments: []` (the panel then shows `community.empty`); `error` is only reached when there is **no** data to show; with old data plus a failed refresh the view is `thread` with `stale: true`. That is the spec's "never show 0 comments as if it were true" rule, as code.

- [ ] **Step 1: Failing test** `src/lib/community/view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { communityPanelView, splitLinks, formatCommentTime, formatThreadDate } from './view';
import type { ParsedThread } from './parse-thread';

const NOW = new Date('2026-09-24T12:00:00Z');
const ROOT = { uri: 'at://did:plc:bot/app.bsky.feed.post/r', cid: 'c', createdAt: '2026-09-24T06:00:00.000Z', date: '2026-09-24',
  url: 'https://bsky.app/profile/watchboard.bsky.social/post/r' };
const THREAD: ParsedThread = { rootUri: ROOT.uri, rootUrl: ROOT.url, total: 1, truncated: false,
  comments: [{ uri: 'at://c', url: 'https://bsky.app/profile/a.test/post/c', authorDid: 'did:plc:a', authorHandle: 'a.test', text: 'hi', createdAt: '2026-09-24T11:00:00Z' }] };
const base = { open: true, rootsStatus: 'ok' as const, roots: { root: ROOT }, threadStatus: 'ok' as const, thread: THREAD, threadUpdatedAt: NOW.getTime() };

describe('communityPanelView', () => {
  it('collapsed until opened, whatever the data', () => {
    expect(communityPanelView({ ...base, open: false })).toEqual({ kind: 'collapsed' });
  });
  it('loading while either fetch has no data yet', () => {
    expect(communityPanelView({ ...base, rootsStatus: 'loading', roots: null }).kind).toBe('loading');
    expect(communityPanelView({ ...base, threadStatus: 'loading', thread: null }).kind).toBe('loading');
    expect(communityPanelView({ ...base, threadStatus: 'idle', thread: null }).kind).toBe('loading');
  });
  it('error only when there is nothing to show — never an empty list', () => {
    expect(communityPanelView({ ...base, rootsStatus: 'error', roots: null })).toEqual({ kind: 'error' });
    expect(communityPanelView({ ...base, threadStatus: 'error', thread: null })).toEqual({ kind: 'error' });
    expect(communityPanelView({ ...base, threadStatus: 'rate-limited', thread: null })).toEqual({ kind: 'error' });
  });
  it('keeps old comments and flags them stale when a refresh fails', () => {
    expect(communityPanelView({ ...base, threadStatus: 'stale' })).toMatchObject({ kind: 'thread', stale: true, comments: THREAD.comments });
  });
  it('no current root is its own state, not an error and not an empty list', () => {
    expect(communityPanelView({ ...base, roots: { root: null } })).toEqual({ kind: 'no-thread' });
  });
  it('an empty thread is a real, empty list — not an error', () => {
    expect(communityPanelView({ ...base, thread: { ...THREAD, comments: [], total: 0 } }))
      .toMatchObject({ kind: 'thread', comments: [], total: 0, stale: false, createdAt: ROOT.createdAt, rootUrl: ROOT.url });
  });
});

describe('formatThreadDate', () => {
  it("uses the reader's zone, so 02:00 UTC on the 25th is still the 24th in Mexico City", () => {
    expect(formatThreadDate('2026-09-25T02:00:00Z', 'en', 'America/Mexico_City')).toBe('Sep 24');
    expect(formatThreadDate('2026-09-25T02:00:00Z', 'en', 'UTC')).toBe('Sep 25');
    expect(formatThreadDate('bad', 'en', 'UTC')).toBe('');
  });
});

describe('splitLinks', () => {
  it('turns only http(s) URLs into links and trims trailing punctuation', () => {
    expect(splitLinks('see https://example.org/a, ok')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'link', href: 'https://example.org/a', value: 'https://example.org/a' },
      { kind: 'text', value: ', ok' },
    ]);
  });
  it('never links javascript: or data: and keeps HTML as literal text', () => {
    expect(splitLinks('javascript:alert(1) <img src=x onerror=1> data:text/html,x'))
      .toEqual([{ kind: 'text', value: 'javascript:alert(1) <img src=x onerror=1> data:text/html,x' }]);
  });
});

describe('formatCommentTime', () => {
  it('relative for recent, date for older', () => {
    expect(formatCommentTime('2026-09-24T11:59:30Z', NOW, 'en')).toBe('now');
    expect(formatCommentTime('2026-09-24T11:15:00Z', NOW, 'en')).toBe('45 min');
    expect(formatCommentTime('2026-09-24T07:00:00Z', NOW, 'en')).toBe('5 h');
    expect(formatCommentTime('2026-09-20T07:00:00Z', NOW, 'en')).toBe('Sep 20');
    expect(formatCommentTime('not a date', NOW, 'en')).toBe('');
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run src/lib/community/view.test.ts` → cannot resolve `./view`.

- [ ] **Step 3: Implement** `src/lib/community/view.ts`:

```ts
import type { LiveStatus } from '../live-source';
import type { RootRef } from '../community-shared';
import type { ParsedThread } from './parse-thread';
import type { CommunityComment } from './types';

export interface RootsData { root: RootRef | null }

export type PanelView =
  | { kind: 'collapsed' }
  | { kind: 'loading' }
  | { kind: 'no-thread' }
  | { kind: 'error' }
  | { kind: 'thread'; comments: CommunityComment[]; total: number; truncated: boolean; createdAt: string; rootUrl: string; stale: boolean; updatedAt: number | null };

const FAILED: readonly LiveStatus[] = ['error', 'rate-limited', 'stale'];

export function communityPanelView(i: {
  open: boolean;
  rootsStatus: LiveStatus; roots: RootsData | null;
  threadStatus: LiveStatus; thread: ParsedThread | null; threadUpdatedAt: number | null;
}): PanelView {
  if (!i.open) return { kind: 'collapsed' };
  if (!i.roots) return FAILED.includes(i.rootsStatus) ? { kind: 'error' } : { kind: 'loading' };
  const root = i.roots.root;
  if (!root) return { kind: 'no-thread' };
  if (!i.thread) return FAILED.includes(i.threadStatus) ? { kind: 'error' } : { kind: 'loading' };
  return {
    kind: 'thread',
    comments: i.thread.comments,
    total: i.thread.total,
    truncated: i.thread.truncated,
    createdAt: root.createdAt,
    rootUrl: root.url,
    stale: FAILED.includes(i.threadStatus),
    updatedAt: i.threadUpdatedAt,
  };
}

export function formatThreadDate(iso: string, locale: string, timeZone?: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) });
}

export type TextPart = { kind: 'text'; value: string } | { kind: 'link'; href: string; value: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;

export function splitLinks(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: 'text', value: text.slice(last, start) });
    out.push({ kind: 'link', href: url, value: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

export function formatCommentTime(iso: string, now: Date, locale: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const s = Math.max(0, Math.round((now.getTime() - ms) / 1000));
  if (s < 60) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return new Date(ms).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
```

- [ ] **Step 4: Run, expect pass.** `npx vitest run src/lib/community/view.test.ts` → 10 passed.

- [ ] **Step 5: Blocklist seed** `src/data/community/blocklist.json` (owner-maintained by PR; DIDs only, never text, never a reason — spec 7):

```json
{ "dids": [] }
```

- [ ] **Step 6: The island** `src/components/islands/community/CommunityPanel.tsx`. No `dangerouslySetInnerHTML`, no storage, no analytics, no `SourceStatusChip`; both fetches are disabled (`useLiveSource` `enabled: false` → status `disabled`, no network, `src/lib/use-live-source.ts:6`) until the reader opens the panel.

```tsx
/**
 * CommunityPanel — reader replies to the current Bluesky community thread (ADR-0003).
 * Comments carry no tier and are never data; this panel is their only surface.
 * The root is discovered at runtime (getAuthorFeed), so no deploy is needed per thread.
 */
import { useMemo, useState } from 'react';
import { useLiveSource } from '../../../lib/use-live-source';
import { getLiveLayer } from '../../../lib/live-layers';
import { COMMUNITY_ACTOR, findRoot, threadCadenceDays } from '../../../lib/community-shared';
import { parseThread, type ParsedThread } from '../../../lib/community/parse-thread';
import { communityPanelView, formatThreadDate, splitLinks, formatCommentTime, type RootsData } from '../../../lib/community/view';
import { t, type Locale, type TranslationKey } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import blocklist from '../../../data/community/blocklist.json';
import '../../../styles/community.css';

const ROOTS = getLiveLayer('community-bluesky-roots');
const THREAD = getLiveLayer('community-bluesky');
if (ROOTS?.kind !== 'feed' || THREAD?.kind !== 'feed') throw new Error('community-bluesky* not registered as feeds (Task 5)');
const BLOCKED = new Set<string>(blocklist.dids);

function basePath(): string {
  const raw = (import.meta as any).env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export default function CommunityPanel({ trackerSlug, updateIntervalDays, locale: fixed }: { trackerSlug: string; updateIntervalDays?: number; locale?: Locale }) {
  const detected = useLocale();
  const locale = fixed ?? detected;
  const tr = (k: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce((s, [a, b]) => s.replace(`{${a}}`, String(b)), t(k as TranslationKey, locale));
  const [open, setOpen] = useState(false);
  const now = new Date();
  const cadence = threadCadenceDays(updateIntervalDays);
  const bodyId = `community-body-${trackerSlug}`;

  const rootsSpec = useMemo(() => ({
    key: `community:roots:${trackerSlug}`, // parse depends on the slug, so the cache key must too
    url: ROOTS.url.replace('{actor}', encodeURIComponent(COMMUNITY_ACTOR)),
    ttlMs: ROOTS.ttlMs,
    parse: async (res: Response): Promise<RootsData> => ({ root: findRoot(await res.json(), trackerSlug, new Date(), cadence) }),
    isEmpty: () => false, // "no current thread" is real data
  }), [trackerSlug, cadence]);
  const roots = useLiveSource<RootsData>(rootsSpec, { enabled: open });

  const rootUri = roots.data?.root?.uri ?? null;
  const threadSpec = useMemo(() => (rootUri ? {
    key: `community:thread:${rootUri}`,
    url: THREAD.url.replace('{uri}', encodeURIComponent(rootUri)),
    ttlMs: THREAD.ttlMs,
    parse: async (res: Response): Promise<ParsedThread> => parseThread(await res.json(), { blockedDids: BLOCKED }),
    isEmpty: () => false, // a thread with no replies is real data
  } : null), [rootUri]);
  const thread = useLiveSource<ParsedThread>(threadSpec, { enabled: open && rootUri !== null });

  const view = communityPanelView({
    open,
    rootsStatus: roots.status, roots: roots.data,
    threadStatus: thread.status, thread: thread.data, threadUpdatedAt: thread.updatedAt ?? null,
  });
  const age = (ms: number | null) => (ms ? formatCommentTime(new Date(ms).toISOString(), now, locale).replace(/^now$/, t('source.justNow', locale)) : '');

  return (
    <section className="community-panel" data-testid="community-panel" aria-labelledby={`community-title-${trackerSlug}`}>
      <header className="community-head">
        <h2 id={`community-title-${trackerSlug}`} className="community-title">{tr('community.title')}</h2>
        <p className="community-banner" data-testid="community-banner">{tr('community.banner')}</p>
        <button type="button" className="community-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          {open ? tr('community.close') : tr('community.open')}
        </button>
      </header>

      <div className="community-body" id={bodyId} hidden={view.kind === 'collapsed'}>
        {view.kind !== 'collapsed' && (
          <>
            <p className="community-contract" data-testid="community-contract">
              {tr('community.contract')} <a href={`${basePath()}about/#community-comments`}>{tr('community.aboutLink')}</a>
            </p>
            {view.kind === 'loading' && <p className="community-state">{tr('community.loading')}</p>}
            {view.kind === 'error' && <p className="community-state" role="alert" data-testid="community-error">{tr('community.error')}</p>}
            {view.kind === 'no-thread' && <p className="community-state" data-testid="community-no-thread">{tr('community.noThread')}</p>}
            {view.kind === 'thread' && (
              <>
                <div className="community-meta">
                  <span data-testid="community-date">{tr('community.thread', { date: formatThreadDate(view.createdAt, locale) })}</span>
                  <span className="community-status" data-testid="community-status">
                    {view.stale ? tr('community.statusStale') : tr('community.statusUpdated', { age: age(view.updatedAt) })}
                  </span>
                </div>
                {view.comments.length === 0 && <p className="community-state" data-testid="community-empty">{tr('community.empty')}</p>}
                <ol className="community-list">
                  {view.comments.map((c) => (
                    <li key={c.uri} className="community-comment" data-testid="community-comment">
                      <div className="community-comment-meta">
                        <span className="community-handle">@{c.authorHandle}</span>
                        <time dateTime={c.createdAt}>{formatCommentTime(c.createdAt, now, locale).replace(/^now$/, t('source.justNow', locale))}</time>
                      </div>
                      <p className="community-text">
                        {splitLinks(c.text).map((p, i) => (p.kind === 'link'
                          ? <a key={i} href={p.href} rel="nofollow ugc noopener noreferrer" target="_blank">{p.value}</a>
                          : <span key={i}>{p.value}</span>))}
                      </p>
                      <div className="community-actions">
                        <a href={c.url} rel="nofollow ugc noopener noreferrer" target="_blank">{tr('community.openOnBluesky')}</a>
                      </div>
                    </li>
                  ))}
                </ol>
                {view.truncated && <a href={view.rootUrl} target="_blank" rel="noopener noreferrer">{tr('community.more', { n: view.total })}</a>}
                <a className="community-cta" href={view.rootUrl} target="_blank" rel="noopener noreferrer" data-testid="community-cta">{tr('community.comment')}</a>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
```

"Open on Bluesky to reply or report" is what the link does: there is no public deep link to Bluesky's report dialog, so the first draft's separate "Report on Bluesky" link (same `href`, English-only tooltip) promised more than it did. Watchboard-side removal requests go to the Q6 address inside `community.contract`, in every locale.

- [ ] **Step 7: Failing palette guard.** Append to `src/lib/community/separation.test.ts` inside the `describe`:

```ts
  it('the panel frame never borrows the tier palette, trust colours or the data font (spec 3.1)', () => {
    const css = readFileSync(resolve(ROOT, 'src/styles/community.css'), 'utf8');
    expect(css).not.toMatch(/--tier-\d|--accent-red|--accent-amber|--accent-green|JetBrains Mono|monospace/);
    expect(css).toMatch(/border:\s*1px dashed/);
    const tsx = readFileSync(resolve(ROOT, 'src/components/islands/community/CommunityPanel.tsx'), 'utf8');
    expect(tsx).not.toMatch(/dangerouslySetInnerHTML|tierClass|tierLabel|tier-badge|--tier-|tier-utils|SourceStatusChip/);
  });
```

Run `npx vitest run src/lib/community/separation.test.ts` → fails with `ENOENT … src/styles/community.css`.

- [ ] **Step 8: Styles** `src/styles/community.css` (neutral tokens from `src/styles/global.css:44-50`, body font `DM Sans` as at `global.css:81`):

```css
/* Community comments (ADR-0003): a frame that cannot be mistaken for tiered data. */
.community-panel {
  max-width: 900px;
  margin: 2rem auto;
  padding: 1rem 1.25rem;
  border: 1px dashed var(--border-light);
  border-radius: 8px;
  background: var(--bg-secondary);
  font-family: 'DM Sans', sans-serif;
  color: var(--text-secondary);
}
.community-panel * { font-family: inherit; }
.community-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1rem; }
.community-title { font-size: 1rem; font-weight: 600; margin: 0; color: var(--text-primary); }
.community-banner { flex: 1 1 18rem; margin: 0; font-size: 0.8rem; font-style: italic; color: var(--text-muted); }
.community-toggle, .community-cta {
  font: inherit; font-size: 0.85rem; padding: 0.35rem 0.75rem; border-radius: 6px;
  border: 1px solid var(--border-light); background: var(--bg-card); color: var(--text-primary); cursor: pointer;
  text-decoration: none; display: inline-block;
}
.community-body { margin-top: 0.75rem; }
.community-contract { font-size: 0.8rem; color: var(--text-muted); }
.community-meta { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; font-size: 0.8rem; margin: 0.5rem 0; }
.community-status { font-style: italic; color: var(--text-muted); }
.community-state { font-size: 0.9rem; }
.community-list { list-style: none; padding: 0; margin: 0 0 1rem; }
.community-comment { padding: 0.6rem 0; border-top: 1px solid var(--border); }
.community-comment-meta { display: flex; gap: 0.5rem; font-size: 0.75rem; color: var(--text-muted); }
.community-handle { color: var(--text-secondary); }
.community-text { margin: 0.25rem 0; color: var(--text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.community-actions { display: flex; gap: 1rem; font-size: 0.75rem; }
.community-actions a, .community-contract a { color: var(--text-secondary); }
```

- [ ] **Step 9: Run everything touched, expect pass; type-check.**

```bash
npx vitest run src/lib/community/ src/lib/community-shared.test.ts
npx tsc --noEmit -p . 2>&1 | grep -E 'community' ; echo "tsc lines above (must be none)"
```

Expected: all community tests pass; no tsc lines. The separation test's "no community file touches storage" and "never borrows the source-tier chip" cases now also scan `CommunityPanel.tsx`.

- [ ] **Step 10: Commit.**

```bash
git add src/lib/community/view.ts src/lib/community/view.test.ts src/lib/community/separation.test.ts \
  src/components/islands/community/CommunityPanel.tsx src/styles/community.css src/data/community/blocklist.json
git commit -m "feat(community): CommunityPanel island with runtime root discovery and text status

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 12 — Mount on the four tracker pages

**`BLOCKED ON OWNER DECISION Q1, Q12`** — Q12 decides where the panel lives. This task is the desktop mount, needed under every Q12 answer. If Q12 also asks for a mobile tab in `MobileTabShell` (`src/pages/[tracker]/index.astro:154-175`, hidden-desktop / shown-mobile via `src/styles/mobile-tabs.css:1221-1224`) or a "N comments" affordance near the hero, those are new tasks planned after the answer, and Task 16 does not start the 60-day clock until they ship (Deviation 8).

**Files:** Modify `src/pages/[tracker]/index.astro` (`<SourceLegend />` at `:148`), `src/pages/es/[tracker]/index.astro`, `src/pages/fr/[tracker]/index.astro`, `src/pages/pt/[tracker]/index.astro` (`<SourceLegend />` at `:85` in each). Create `src/lib/community/mount.test.ts`.
**Consumes:** `CommunityPanel` (Task 11), `communityEnabledFor`, `communityEnvFlag` (Task 3). **Produces:** the panel after `<SourceLegend />`, inside the desktop `<main>`, only when eligible (active + enabled + kill switch not `false`).

Placement follows spec rule 3.1: outside `.theater-layout` (so never between timeline, KPIs, map or military tabs), and far from `DegradedSources` (`:111`).

- [ ] **Step 1: Failing test** `src/lib/community/mount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const PAGES: [string, string | null][] = [
  ['src/pages/[tracker]/index.astro', null],
  ['src/pages/es/[tracker]/index.astro', 'es'],
  ['src/pages/fr/[tracker]/index.astro', 'fr'],
  ['src/pages/pt/[tracker]/index.astro', 'pt'],
];

describe('CommunityPanel mount', () => {
  for (const [file, locale] of PAGES) {
    it(`${file}: gated, lazy, after SourceLegend, outside the data layout`, () => {
      const src = readFileSync(resolve(ROOT, file), 'utf8');
      const mount = src.indexOf('<CommunityPanel');
      expect(mount, 'mounted').toBeGreaterThan(-1);
      expect(src.match(/<CommunityPanel/g)).toHaveLength(1);
      expect(mount).toBeGreaterThan(src.indexOf('<SourceLegend'));
      expect(mount).toBeLessThan(src.indexOf('<!-- Mobile layout -->'));
      expect(src).toMatch(/communityEnabledFor\(config, communityEnvFlag\(\)\) && \(\s*<CommunityPanel client:visible/);
      expect(src).toMatch(/updateIntervalDays=\{config\.ai\?\.updateIntervalDays\}/);
      if (locale) expect(src).toMatch(new RegExp(`updateIntervalDays=\\{config\\.ai\\?\\.updateIntervalDays\\} locale="${locale}"`));
    });
  }
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run src/lib/community/mount.test.ts` → 4 failed (`mounted: expected -1 to be greater than -1`).

- [ ] **Step 3: Edit the English page.** In `src/pages/[tracker]/index.astro`, add to the imports (after `:19`):

```astro
import CommunityPanel from '../../components/islands/community/CommunityPanel';
import { communityEnabledFor, communityEnvFlag } from '../../lib/community-shared';
```

and replace `      <SourceLegend />` (`:148`) with:

```astro
      <SourceLegend />
      {communityEnabledFor(config, communityEnvFlag()) && (
        <CommunityPanel client:visible trackerSlug={config.slug} updateIntervalDays={config.ai?.updateIntervalDays} />
      )}
```

- [ ] **Step 4: Edit the three locale pages.** In each of `src/pages/{es,fr,pt}/[tracker]/index.astro`, add after the `SourceLegend` import (`:9`):

```astro
import CommunityPanel from '../../../components/islands/community/CommunityPanel';
import { communityEnabledFor, communityEnvFlag } from '../../../lib/community-shared';
```

and replace `      <SourceLegend />` (`:85`) with (locale literal per file: `es`, `fr`, `pt`):

```astro
      <SourceLegend />
      {communityEnabledFor(config, communityEnvFlag()) && (
        <CommunityPanel client:visible trackerSlug={config.slug} updateIntervalDays={config.ai?.updateIntervalDays} locale="es" />
      )}
```

Quote the bracketed paths in every shell command (`"src/pages/[tracker]/index.astro"`); unquoted, zsh globs them and git pathspecs silently match nothing (memory: git pathspec bracket trap).

- [ ] **Step 5: Run, expect pass; check nothing renders when disabled.**

```bash
npx vitest run src/lib/community/mount.test.ts
npx tsc --noEmit -p . 2>&1 | grep -E 'community|\[tracker\]' ; echo "tsc lines above (must be none)"
```

Expected: 4 passed; no tsc lines. With no tracker enabled and the flag unset, the built HTML contains no panel; this is asserted against a real build in Task 17 Step 1 (`grep -c data-testid=\"community-panel\"` → `0`), because a full `npm run build` is too slow to repeat per task.

- [ ] **Step 6: Commit.**

```bash
git add -- "src/pages/[tracker]/index.astro" "src/pages/es/[tracker]/index.astro" "src/pages/fr/[tracker]/index.astro" "src/pages/pt/[tracker]/index.astro" src/lib/community/mount.test.ts
git status --short -- "src/pages/[tracker]/index.astro" "src/pages/es/[tracker]/index.astro"   # must print nothing (all staged)
git commit -m "feat(community): mount CommunityPanel after SourceLegend on tracker pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD | grep -c 'index.astro'   # expect 4
```

## Task 13 — `/about` section and blocklist

**`BLOCKED ON OWNER DECISION Q1, Q6`** — Q6 supplies the contact address for removal requests and says whether the text gets legal review before it ships. Nothing in this task is published with a placeholder address.

**Files:** Modify `src/pages/about.astro` (new `<section>` after "Data Quality & Source Tiers", which ends before `:111`). Create `src/lib/community/about.test.ts`.
**Consumes:** `src/data/community/blocklist.json` (Task 11). **Produces:** `/about/#community-comments` (linked from the panel, Task 11) and a validated blocklist.

The section is placed right after the tier explanation on purpose: it is the public contract that answers the 09-21 objection ("messages would be unverified Tier 4") with "comments have no tier at all".

- [ ] **Step 1: Failing test** `src/lib/community/about.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import blocklist from '../../data/community/blocklist.json';

const ROOT = resolve(__dirname, '../../..');

describe('/about community contract', () => {
  const about = readFileSync(resolve(ROOT, 'src/pages/about.astro'), 'utf8');
  const start = about.indexOf('id="community-comments"');
  const section = about.slice(start, about.indexOf('</section>', start));
  it('exists, after the source-tier section', () => {
    expect(start).toBeGreaterThan(about.indexOf('Data Quality &amp; Source Tiers'));
  });
  it('states the contract of spec 3.4', () => {
    expect(section).toMatch(/no source tier/i);
    expect(section).toMatch(/never used as data/i);
    expect(section).toMatch(/public\.api\.bsky\.app/);          // the reader's IP goes to Bluesky
    expect(section).toMatch(/Report/);
    expect(section).toMatch(/mailto:[^"<>\s]+@[^"<>\s]+/);       // Q6 contact, a real address
    expect(section).not.toMatch(/<Q6>|TODO|example\.com|OWNER_CONTACT/);
  });
  it('is honest about retention: git history keeps removed blocklist entries; no reasons in the repo', () => {
    expect(section).toMatch(/git history/i);
    expect(section).toMatch(/not (deleted|erased) from/i);
    expect(section).toMatch(/reasons? (are|is) (kept|recorded) privately/i);
    expect(section).toMatch(/logged-out/i);                        // what "hidden by Bluesky labels" means
  });
});

describe('blocklist.json', () => {
  it('holds DIDs only, unique, never text', () => {
    expect(Object.keys(blocklist)).toEqual(['dids']);
    for (const d of blocklist.dids) expect(d).toMatch(/^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]+)$/);
    expect(new Set(blocklist.dids).size).toBe(blocklist.dids.length);
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run src/lib/community/about.test.ts` → `exists…` fails (`-1`).

- [ ] **Step 3: Add the section** to `src/pages/about.astro`, immediately after the `</section>` that closes "Data Quality & Source Tiers" (the one before `:111`). Replace `OWNER_CONTACT` with the Q6 address before saving:

```astro
      <section id="community-comments">
        <h2>Community Comments</h2>
        <p>Some trackers show a <strong>Community</strong> panel. It lists public replies to the current thread (daily or weekly, following the tracker's update cadence) opened by <a href="https://bsky.app/profile/watchboard.bsky.social" target="_blank" rel="noopener noreferrer">@watchboard.bsky.social</a> on Bluesky.</p>
        <ul>
          <li><strong>Opinions, not sources.</strong> Comments carry <strong>no source tier</strong> — not even Tier 4 — because no editorial check was applied to them. They are never used as data: they never enter the timeline, KPIs, maps, feeds, the API, the daily video or the AI update prompts.</li>
          <li><strong>Hosted by Bluesky.</strong> Watchboard stores no comment text. When you open the panel, your browser asks <code>public.api.bsky.app</code> for the thread, so Bluesky sees your IP address, as OpenSky or Nominatim do for the map layers. No cookies, no tracking.</li>
          <li><strong>What is hidden.</strong> Replies the maintainer hides on Bluesky, accounts on a public blocklist kept in the repository (<code>src/data/community/blocklist.json</code>, account IDs only), and posts or accounts that Bluesky hides from logged-out readers (moderation labels such as sexual, graphic, spam or doxxing, and authors who chose not to be shown to logged-out users).</li>
          <li><strong>Report.</strong> “Open on Bluesky to reply or report” takes you to the comment on Bluesky, where the report action lives. To ask for a comment to stop being shown on watchboard.dev, write to <a href="mailto:OWNER_CONTACT">OWNER_CONTACT</a>.</li>
          <li><strong>Retention.</strong> The blocklist holds account IDs (DIDs), never comment text, and is reviewed every six months. The repository is public, so an ID removed from the list is not deleted from the git history. Reasons for a removal are kept privately by the maintainer, never in the repository.</li>
          <li><strong>Want a fact checked?</strong> Use the <a href="https://github.com/ArtemioPadilla/watchboard/issues/new?template=data-correction.yml" target="_blank" rel="noopener noreferrer">data-correction form</a>. A human reviews it; a comment never becomes data on its own.</li>
        </ul>
      </section>
```

Verify the correction-form link target exists before committing: `ls .github/ISSUE_TEMPLATE/data-correction.yml` must print the path (spec 3.3 cites it); and `grep -n OWNER_CONTACT src/pages/about.astro` must print nothing.

- [ ] **Step 4: Run, expect pass.** `npx vitest run src/lib/community/about.test.ts` → 4 passed.

Runbook note for the owner (goes into the ADR in Task 16, not into the repo history of any block): when blocking, the commit message is `chore(community): update blocklist` with no reason and no handle; the reason goes into the private log chosen in Q6.

- [ ] **Step 5: Commit.**

```bash
git add src/pages/about.astro src/lib/community/about.test.ts
git commit -m "docs(about): community comments contract (no tier, hosted by Bluesky, how to report)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 14 — Playwright spec wired into `e2e.yml`

**`BLOCKED ON OWNER DECISION Q1`**

**Files:** Create `e2e/community-panel.spec.ts`. Modify `playwright.config.ts` (`webServer.env`, `:35`), `.github/workflows/e2e.yml` (step env `:35-36` and the spec list `:37`).
**Consumes:** the mounted panel (Task 12) with `PUBLIC_COMMUNITY_ENABLED=force` (Task 3/6); fixture `src/lib/community/fixtures/thread.json` (Task 2); `TOUR_DONE` (`e2e/helpers/hydration.ts:17`). **Produces:** a CI check of the rendered behaviour that vitest (node-only) cannot see.

Mocks follow `e2e/dossier.spec.ts:10-12` (`page.route`). The CSP check is real: in `npm run dev` the policy comes from the `<meta>` tag at `src/layouts/BaseLayout.astro:97`, and a request blocked by CSP never reaches `page.route`, so a missing `connect-src` host shows up as a console violation and an error state. Two review fixes shape this spec: it is **ESM** (`package.json:3`), so it reads the fixture with `new URL(…, import.meta.url)` as `e2e/geo-layers.spec.ts:9` does (`__dirname` would crash at import); and the island bundles the real, empty blocklist, so the blocked reply `r6` **is** shown here (4 comments). The blocklist filter is covered by the unit test, which injects `blockedDids`.

- [ ] **Step 1: Turn the panel on for the e2e server only.** `playwright.config.ts:35`:

```ts
    env: { PUBLIC_ENABLE_DEEPSTATE: 'true', PUBLIC_COMMUNITY_ENABLED: 'force' },
```

and in `.github/workflows/e2e.yml`, step "Run shareable-view specs", add `PUBLIC_COMMUNITY_ENABLED: 'force'` under `env:` and append ` e2e/community-panel.spec.ts` to the `npx playwright test …` list before `--reporter=list`. (The Task 6 test allows `force` only in `e2e.yml`.)

- [ ] **Step 2: Write the spec** `e2e/community-panel.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TOUR_DONE } from './helpers/hydration';

const THREAD = readFileSync(new URL('../src/lib/community/fixtures/thread.json', import.meta.url), 'utf8');
// Built per run so the root is always inside the cadence window (fixtures with fixed dates would age out).
const feed = (roots: number) => JSON.stringify({ feed: roots ? [{ post: {
  uri: 'at://did:plc:bot/app.bsky.feed.post/root1', cid: 'c0', author: { handle: 'watchboard.bsky.social' },
  record: { text: 'Community thread\n\nhttps://watchboard.dev/iran-conflict/', createdAt: new Date().toISOString() } } }] : [] });

async function setup(page: Page, o: { thread?: { status: number; body: string }; roots?: number } = {}) {
  const thread = o.thread ?? { status: 200, body: THREAD };
  const requests: string[] = [];
  const cspViolations: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text()); });
  const json = { contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
  await page.route('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed**', (r) => {
    requests.push(r.request().url());
    return r.fulfill({ ...json, status: 200, body: feed(o.roots ?? 1) });
  });
  await page.route('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread**', (r) => {
    requests.push(r.request().url());
    return r.fulfill({ ...json, status: thread.status, body: thread.body });
  });
  await page.addInitScript(TOUR_DONE);
  await page.goto('./iran-conflict/');
  const panel = page.getByTestId('community-panel').first();
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  return { panel, requests, cspViolations };
}
const open = (panel: ReturnType<Page['getByTestId']>) => panel.getByRole('button', { name: /show community comments/i }).click();

test.describe('Community panel (ADR-0003)', () => {
  test('collapsed by default, labelled "not a source", and silent until opened', async ({ page }) => {
    const { panel, requests } = await setup(page);
    await expect(page.getByTestId('community-banner').first()).toContainText('Not a Watchboard source');
    await expect(panel.getByTestId('community-comment')).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(requests).toEqual([]);
  });

  test('opened: filtered replies oldest first, plain text, no source-chip styling, CSP clean', async ({ page }) => {
    const { panel, requests, cspViolations } = await setup(page);
    const toggle = panel.getByRole('button', { name: /show community comments/i });
    const bodyId = await toggle.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    await toggle.click();
    await expect(page.locator(`#${bodyId}`)).toBeVisible();
    const comments = panel.getByTestId('community-comment');
    await expect(comments).toHaveCount(4, { timeout: 15_000 });          // r1, r5, r6 (empty bundled blocklist), r2
    await expect(comments.nth(0)).toContainText('First in time');
    await expect(comments.nth(3)).toContainText('Second <b>in time</b>'); // literal text, not HTML
    await expect(panel.locator('b')).toHaveCount(0);
    for (const gone of ['hidden by owner', 'author opted out', 'doxxing label', 'account labelled spam', 'labeled', 'nested, depth 2']) {
      await expect(panel).not.toContainText(gone);
    }
    await expect(panel.locator('.source-chip, .freshness-indicator, .t1, .t2, .t3, .t4, [class*="tier"]')).toHaveCount(0);
    for (const sel of ['[data-testid="community-panel"]', '[data-testid="community-status"]', '[data-testid="community-comment"]']) {
      const font = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
      expect(font, sel).not.toMatch(/mono/i);
    }
    await expect(panel.locator('a[href="https://example.org/x"]')).toHaveAttribute('rel', /nofollow ugc/);
    await expect(panel.getByTestId('community-cta')).toHaveAttribute('href', /bsky\.app\/profile\/watchboard\.bsky\.social\/post\/root1/);
    await expect(panel.getByTestId('community-date')).toContainText('Thread ·');
    await expect(panel.getByTestId('community-contract')).toContainText('@');
    expect(requests[0]).toContain('app.bsky.feed.getAuthorFeed?actor=watchboard.bsky.social');
    expect(requests.some((u) => u.includes('app.bsky.feed.getPostThread?uri=at%3A%2F%2F'))).toBe(true);
    expect(cspViolations).toEqual([]);
  });

  test('an upstream failure says so and never shows an empty list', async ({ page }) => {
    const { panel } = await setup(page, { thread: { status: 503, body: 'down' } });
    await open(panel);
    await expect(panel.getByTestId('community-error')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId('community-empty')).toHaveCount(0);
    await expect(panel.getByTestId('community-comment')).toHaveCount(0);
  });

  test('a thread with no replies invites instead of looking broken', async ({ page }) => {
    const empty = JSON.parse(THREAD);
    empty.thread.replies = [];
    const { panel } = await setup(page, { thread: { status: 200, body: JSON.stringify(empty) } });
    await open(panel);
    await expect(panel.getByTestId('community-empty')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId('community-cta')).toBeVisible();
  });

  test('no current root is "no conversation", not an error and not zero comments', async ({ page }) => {
    const { panel, requests } = await setup(page, { roots: 0 });
    await open(panel);
    await expect(panel.getByTestId('community-no-thread')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId('community-error')).toHaveCount(0);
    expect(requests.some((u) => u.includes('getPostThread'))).toBe(false);
  });

  test('the degraded-sources block never mentions comments', async ({ page }) => {
    const { panel } = await setup(page, { thread: { status: 503, body: 'down' } });
    await open(panel);
    await expect(panel.getByTestId('community-error')).toBeVisible({ timeout: 15_000 });
    // DegradedSources re-reads the live-source cache every 15 s (DegradedSources.tsx POLL_MS); wait one cycle.
    await page.waitForTimeout(16_000);
    const degraded = (await page.getByTestId('degraded-sources').allTextContents()).join(' ');
    expect(degraded).not.toMatch(/community|bluesky/i);
  });
});
```

- [ ] **Step 3: Run it against a fresh dev server**, expect pass. Stop any running `npm run dev` first: `reuseExistingServer: true` (`playwright.config.ts:37`) would reuse a server started without the flag, and every test would fail on a missing panel.

```bash
npx playwright install chromium
npx playwright test e2e/community-panel.spec.ts --reporter=list
```

Expected: `6 passed`. If only the CSP assertion fails, Task 5 Step 6 did not land in `BaseLayout.astro`. If the file fails at import with `__dirname is not defined`, the fixture read was changed back to CommonJS style.

- [ ] **Step 4: Prove the CSP assertion bites.** Temporarily remove ` https://public.api.bsky.app` from `src/layouts/BaseLayout.astro:97`, restart the dev server, re-run the second test (`-g "opened"`): it must fail (no comments rendered, a CSP console message captured). Restore with `git checkout -- src/layouts/BaseLayout.astro`.

- [ ] **Step 5: Commit.**

```bash
git add e2e/community-panel.spec.ts playwright.config.ts .github/workflows/e2e.yml
git commit -m "test(e2e): community panel states, filtering, no source chip, CSP

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 15 — Live test

**`BLOCKED ON OWNER DECISION Q1`**

**Files:** Create `tests/live/community-bluesky.live.test.ts`.
**Consumes:** `liveDescribe`, `liveIt`, `LIVE_TEST_TIMEOUT_MS` (`tests/helpers/live.ts:17-23`); `parseThread` (Task 2); `getLiveLayer` (Task 5). **Produces:** an opt-in (`npm run test:live`) check that the real AppView still serves anonymous, CORS-enabled threads in the shape the parser expects. Skipped in `npm test`.

- [ ] **Step 1: Write the test.**

```ts
import { expect } from 'vitest';
import { liveDescribe, liveIt, LIVE_TEST_TIMEOUT_MS } from '../helpers/live';
import { parseThread } from '../../src/lib/community/parse-thread';
import { getLiveLayer } from '../../src/lib/live-layers';

import { COMMUNITY_ACTOR, findRoot } from '../../src/lib/community-shared';

liveDescribe('Bluesky AppView (community-bluesky*)', () => {
  liveIt('getAuthorFeed as the panel calls it: 200, CORS, a feed findRoot accepts', async () => {
    const roots = getLiveLayer('community-bluesky-roots');
    if (roots?.kind !== 'feed') throw new Error('community-bluesky-roots not registered as a feed');
    const res = await fetch(roots.url.replace('{actor}', encodeURIComponent(COMMUNITY_ACTOR)), { headers: { Origin: 'https://watchboard.dev' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toMatch(/^\*$|^https:\/\/watchboard\.dev$/);
    const body = await res.json();
    expect(() => findRoot(body, 'any-slug', new Date(), 7)).not.toThrow();
    expect(body.feed.length).toBeGreaterThan(0);
  }, LIVE_TEST_TIMEOUT_MS);

  liveIt('getPostThread on the latest Watchboard post: 200, CORS, parseable', async () => {
    const roots = getLiveLayer('community-bluesky-roots');
    if (roots?.kind !== 'feed') throw new Error('community-bluesky-roots not registered as a feed');
    const feed = await fetch(roots.url.replace('{actor}', encodeURIComponent(COMMUNITY_ACTOR))).then((r) => r.json());
    const uri: string = feed.feed[0].post.uri;
    const layer = getLiveLayer('community-bluesky');
    if (layer?.kind !== 'feed') throw new Error('community-bluesky not registered as a feed');
    const res = await fetch(layer.url.replace('{uri}', encodeURIComponent(uri)), { headers: { Origin: 'https://watchboard.dev' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toMatch(/^\*$|^https:\/\/watchboard\.dev$/);
    const parsed = parseThread(await res.json());
    expect(parsed.rootUri).toBe(uri);
    expect(Array.isArray(parsed.comments)).toBe(true);
  }, LIVE_TEST_TIMEOUT_MS);
});
```

- [ ] **Step 2: Run both ways.**

```bash
npx vitest run tests/live/community-bluesky.live.test.ts          # expect: 2 skipped
npm run test:live -- tests/live/community-bluesky.live.test.ts    # expect: 2 passed
```

- [ ] **Step 3: Commit.**

```bash
git add tests/live/community-bluesky.live.test.ts
git commit -m "test(live): Bluesky AppView thread contract for the community panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 16 — Pilot activation and the day-60 measurement

**`BLOCKED ON OWNER DECISION Q5, Q7, Q12, Q14`** (and every earlier question: this is the first task with a public effect). The 60-day clock starts only when the placement chosen in Q12 is live.

**Files:** Modify `trackers/{pilot slugs}/tracker.json` (from Q5), `.github/workflows/community-threads.yml`, `src/lib/community/workflow.test.ts`, `docs/adr/0003-community-comments-carry-no-tier.md`. Create `scripts/community-metrics.ts`, `scripts/community-metrics.test.ts`.
**Consumes:** Q5 slugs; Q7 threshold; repo variables `COMMUNITY_REPLY_POLICY` (Q4) and `COMMUNITY_ROOT_LANG` (Q10) set by the owner in GitHub → Settings → Variables; `findRoot`, `rootMarker`, `COMMUNITY_ACTOR` (Task 3); `parseThread` (Task 2). **Produces:** threads at each pilot tracker's cadence, a runbook in the ADR, and a read-only metric that counts **visible** replies per thread (what the panel shows), read once at the end so no thread is counted at the 0 it had when posted.

- [ ] **Step 1: Confirm the owner set the variables** (the script refuses to run otherwise):

```bash
gh variable list | grep -E 'COMMUNITY_REPLY_POLICY|COMMUNITY_ROOT_LANG|PUBLIC_COMMUNITY_ENABLED'
```

Expected: `COMMUNITY_REPLY_POLICY` and `COMMUNITY_ROOT_LANG` with the owner's values; `PUBLIC_COMMUNITY_ENABLED` absent or not `false`. Missing → stop, ask the owner.

- [ ] **Step 2: Enable the pilot trackers.** For each Q5 slug, add at the top level of its `tracker.json`:

```json
  "community": { "enabled": true }
```

Then check exactly the Q5 slugs are eligible and all configs still parse:

```bash
grep -l '"community"' trackers/*/tracker.json
npx tsx -e "import('./scripts/lib/load-trackers-node.ts').then(async m => { const { communityEnabledFor, threadCadenceDays } = await import('./src/lib/community-shared.ts'); console.log(m.loadAllTrackers().filter(t => communityEnabledFor(t, undefined)).map(t => t.slug + '/' + threadCadenceDays(t.ai?.updateIntervalDays) + 'd').join(',')) })"
```

Expected: exactly the Q5 slugs, each with its cadence (a missing one means its config failed Zod, or it is not `active`).

- [ ] **Step 3: Ship, deploy explicitly, first run by hand.** After merging Tasks 1-15 and this step's `tracker.json` changes (PR, checks green: `gh pr checks <n> --watch --fail-fast`, as CLAUDE.md "Merging" requires), dispatch the deploy yourself: `trackers/**` is in `paths-ignore` (`deploy.yml:19-26`), so the merge alone does not publish the `community.enabled` change.

```bash
gh workflow run deploy.yml --ref main
sleep 5; gh run watch "$(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
for s in <Q5 slugs>; do curl -s "https://watchboard.dev/$s/" | grep -c 'data-testid="community-panel"'; done   # expect 1 each
gh workflow run community-threads.yml
sleep 5; gh run watch "$(gh run list --workflow community-threads.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Expected: both runs green; the deployed pages contain the panel; the threads run summary lists every pilot slug as `posted at://…`. Then verify where the reader looks, not in the run log: open each pilot tracker on watchboard.dev, open the panel, and confirm it shows `Thread · <today>` and the empty-state invitation; open each root on bsky.app and confirm the reply policy Q4 chose.

- [ ] **Step 4: Turn on the schedule.** In `.github/workflows/community-threads.yml`, replace the `on:` block and its comment with (the script decides per tracker whether its cadence is due, so one daily trigger serves daily and weekly trackers):

```yaml
# Pilot approved by the owner (Q5) on <date of the owner's answer>; review 60 days after <date Q12 placement shipped> (Q7).
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
```

and change the first test in `src/lib/community/workflow.test.ts` to:

```ts
  it('runs daily at 06:00 UTC (cadence decided per tracker) and can be dispatched', () => {
    expect(onBlock).toMatch(/^\s+workflow_dispatch:/m);
    expect(onBlock).toMatch(/cron: '0 6 \* \* \*'/);
    expect(onBlock).not.toMatch(/^\s+push:/m);
  });
```

Run `npx vitest run src/lib/community/workflow.test.ts` → 4 passed.

- [ ] **Step 5: Record the pilot and the runbook in the ADR.** Append to `docs/adr/0003-community-comments-carry-no-tier.md`:

```markdown
## Piloto

- Trackers y cadencia: <Q5 slugs con su cadencia>. Colocación: <Q12>. Visible desde: <fecha>. Revisión: <fecha + 60 días>.
- Umbral (Q7): <n> respuestas visibles por hilo (mediana), medido con `scripts/community-metrics.ts`.
  Alcance (Q14): <sí: eventos community_panel_opened / community_cta_clicked | no: sin dato de alcance>.
- Línea base al empezar: 7 seguidores; 97 de 100 posts sin respuestas (2026-09-24).
- Si no se alcanza: borrar el panel y el workflow, y marcar este ADR como Retirado. Si no hay dato de
  alcance, el informe dice que no se puede separar visibilidad de demanda.

## Runbook de moderación

1. Ocultar una respuesta: app de Bluesky → ocultar (máx. 50 por hilo; pasadas ~40, paso 3).
2. Bloquear una cuenta: PR a `src/data/community/blocklist.json` con el mensaje
   `chore(community): update blocklist` (sin motivo, sin handle); el motivo va al registro privado <Q6>.
   El merge humano despliega solo (push a main).
3. Cerrar el hilo: threadgate `allow: []` desde la app de Bluesky (segundos).
4. Retirar el hilo: borrar el post raíz en Bluesky; el panel deja de mostrarlo en ≤ 5 min.
5. Apagar un tracker: `community.enabled: false` en su tracker.json, merge, y `gh workflow run deploy.yml`
   (`trackers/**` no despliega solo).
6. Apagar todo: `gh variable set PUBLIC_COMMUNITY_ENABLED --body false && gh workflow run deploy.yml`.
   El bot también deja de abrir hilos.
```

`grep -nE '<(Q[0-9]+|fecha|n)>|<Q5 slugs' docs/adr/0003-community-comments-carry-no-tier.md` must print nothing.

- [ ] **Step 6: Commit** (on a branch, via PR, merged only after checks pass).

```bash
git add trackers/*/tracker.json .github/workflows/community-threads.yml src/lib/community/workflow.test.ts docs/adr/0003-community-comments-carry-no-tier.md
git commit -m "feat(community): pilot trackers, daily trigger with per-tracker cadence, runbook

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: The day-60 metric, test first.** The first draft read `replyCount` from `threads.json` in git history: the day-D commit recorded ≈0 right after posting, `sort -u -k1,2` could keep that 0, and `replyCount` counted hidden, blocklisted and nested replies. This version reads each thread once, at review time, and counts what the panel shows. Failing test `scripts/community-metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import thread from '../src/lib/community/fixtures/thread.json';
import { visibleCount, summarize } from './community-metrics';

describe('community metrics', () => {
  it('counts what the panel shows, not the raw replyCount', () => {
    expect(visibleCount(thread, new Set())).toBe(4);                        // r1, r5, r6, r2
    expect(visibleCount(thread, new Set(['did:plc:blocked']))).toBe(3);
  });
  it('median, max and thread count per slug, including zero-reply threads', () => {
    const s = summarize([
      { slug: 'cdmx', date: '2026-10-01', visible: 0 }, { slug: 'cdmx', date: '2026-10-08', visible: 3 },
      { slug: 'cdmx', date: '2026-10-15', visible: 1 }, { slug: 'bts', date: '2026-10-01', visible: 0 },
    ]);
    expect(s).toEqual([
      { slug: 'bts', threads: 1, median: 0, max: 0 },
      { slug: 'cdmx', threads: 3, median: 1, max: 3 },
    ]);
  });
});
```

Run `npx vitest run scripts/community-metrics.test.ts` → cannot resolve `./community-metrics`. Implement `scripts/community-metrics.ts` (read-only: no file writes, no git, no POST — enforced by the separation test's named exception):

```ts
#!/usr/bin/env tsx
/** Day-60 pilot metric (ADR-0003): visible replies per community thread, printed, never stored. */
import { pathToFileURL } from 'node:url';
import { parseThread } from '../src/lib/community/parse-thread.js';
import { COMMUNITY_ACTOR, rootMarker } from '../src/lib/community-shared.js';
import blocklist from '../src/data/community/blocklist.json' with { type: 'json' };

export function visibleCount(threadJson: unknown, blocked: ReadonlySet<string>): number {
  return parseThread(threadJson, { blockedDids: blocked, max: Number.MAX_SAFE_INTEGER }).total;
}

export function summarize(rows: { slug: string; date: string; visible: number }[]) {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.slug, [...(by.get(r.slug) ?? []), r.visible]);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slug, v]) => {
    const s = [...v].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    return { slug, threads: s.length, median, max: s[s.length - 1] };
  });
}

const XRPC = 'https://public.api.bsky.app/xrpc';

async function main(): Promise<void> {
  const [since, ...slugs] = process.argv.slice(2);              // e.g. 2026-10-01 cdmx bts crispr-gene-therapy
  if (!since || !slugs.length) throw new Error('usage: community-metrics.ts <since YYYY-MM-DD> <slug…>');
  const rows: { slug: string; date: string; visible: number }[] = [];
  let cursor: string | undefined;
  do {
    const u = `${XRPC}/app.bsky.feed.getAuthorFeed?actor=${COMMUNITY_ACTOR}&filter=posts_no_replies&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await fetch(u).then((r) => { if (!r.ok) throw new Error(`getAuthorFeed HTTP ${r.status}`); return r.json(); });
    for (const it of page.feed ?? []) {
      const p = it.post; const text: string = p?.record?.text ?? ''; const date: string = (p?.record?.createdAt ?? '').slice(0, 10);
      if (it.reason || date < since) continue;
      const slug = slugs.find((s) => text.includes(rootMarker(s)));
      if (!slug) continue;
      const t = await fetch(`${XRPC}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(p.uri)}&depth=1&parentHeight=0`).then((r) => r.json());
      rows.push({ slug, date, visible: visibleCount(t, new Set(blocklist.dids)) });
    }
    const last = page.feed?.at(-1)?.post?.record?.createdAt ?? '';
    cursor = page.cursor && last.slice(0, 10) >= since ? page.cursor : undefined;
  } while (cursor);
  console.table(rows);
  console.table(summarize(rows));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

Then:

```bash
npx vitest run scripts/community-metrics.test.ts src/lib/community/separation.test.ts   # 2 passed + separation incl. the read-only exception
npx tsx scripts/community-metrics.ts <pilot start date> <Q5 slugs>
git add scripts/community-metrics.ts scripts/community-metrics.test.ts
git commit -m "feat(community): read-only day-60 metric of visible replies per thread

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Report the per-slug table to the owner next to the Q7 threshold, the baseline (7 followers, 97/100 posts without replies) and, if Q14 = yes, the panel-open and CTA-click counts. The decision (keep, phase 2, retire) is the owner's.

## Task 17 — Manual verification before the pilot goes public

**`BLOCKED ON OWNER DECISION Q6, Q13`** (legal review of the texts, if requested; Docker default) — and must be done before Task 16 Step 4 turns the cron on.

**Files:** none changed. **Consumes:** everything above. **Produces:** a checklist the owner signs off in the PR description.

- [ ] **Step 1: Static build, panel off by default, kill switch works.**

```bash
npm run build 2>&1 | tail -3
grep -c 'data-testid="community-panel"' dist/iran-conflict/index.html     # expect 0 (not enabled)
grep -o 'https://public.api.bsky.app' dist/_headers | head -1               # expect the host (public/_headers is copied)
ls dist/_community 2>/dev/null | wc -l                                      # expect 0: nothing about threads is baked
PUBLIC_COMMUNITY_ENABLED=false npm run build > /dev/null 2>&1; grep -lr 'data-testid="community-panel"' dist | wc -l   # expect 0 even for pilot trackers
```

- [ ] **Step 2: Preview in two locales.** `npm run build && npm run preview`, open a pilot tracker at `/{slug}/` and `/es/{slug}/`, open the panel, and confirm in DevTools: no CSP violation in the console; the only third-party requests are `public.api.bsky.app` `getAuthorFeed` and `getPostThread` (Network tab); no cookie or storage entry was created by the panel (Application tab, before vs after opening); the status line and comments render in the body font (Computed → font-family has no "Mono"); the `/es/` contract shows the Q6 address.

- [ ] **Step 3: Docker image, both ways.** The image turns `public/_headers` into nginx headers at build time (`scripts/headers-to-nginx.ts`):

```bash
docker build -t watchboard:community-default .
docker run --rm -d -p 8080:8080 --name wb-default watchboard:community-default
curl -s http://localhost:8080/<pilot slug>/ | grep -c 'data-testid="community-panel"'   # expect 0: off by default (Q13)
docker stop wb-default
docker build --build-arg PUBLIC_COMMUNITY_ENABLED=true -t watchboard:community .
bash tests/docker-smoke.sh watchboard:community          # takes the image as $1 (tests/docker-smoke.sh:6), runs on port 18080
docker run --rm -d -p 8080:8080 --name wb-community watchboard:community
curl -sI http://localhost:8080/ | grep -i content-security-policy | grep -o 'https://public.api.bsky.app'
curl -s http://localhost:8080/<pilot slug>/ | grep -c 'data-testid="community-panel"'   # expect 1
docker stop wb-community
```

Expected: `0`, the smoke test passes, the host is printed, `1`. Then open `http://localhost:8080/{slug}/` on the enabled image and open the panel: the current thread loads (Task 0 Step 5 confirmed `http://localhost:8080` is an allowed origin), with no dependency on the image's build date.

- [ ] **Step 4: Owner moderation path works end-to-end.** From the Bluesky app, hide one test reply on a pilot thread; within 60 s the open panel drops it. Delete a throwaway root post made for the test; within 5 min the panel stops showing it. Add a test account's DID to `src/data/community/blocklist.json` on a branch, run `npx vitest run src/lib/community/about.test.ts`, preview: that account's replies are gone. Revert the branch. Flip `gh variable set PUBLIC_COMMUNITY_ENABLED --body false && gh workflow run deploy.yml` on a quiet day and time how long until the panel is gone from watchboard.dev; record the minutes in the ADR runbook; set it back.

- [ ] **Step 5: The spec's subjective check, made explicit.** Screenshot the pilot tracker with the panel open next to the timeline and give it to the owner with one question: "Could a reader mistake a comment for a Watchboard data point?" A "yes" blocks the pilot until the frame is changed.

## Open questions for the owner

Q1-Q14 are the spec's P1-P14 (section 10). **No question has a default in this plan**; an executor that reaches a task whose `BLOCKED ON OWNER DECISION Qn` is unanswered stops and reports; it does not pick one. Put the baseline of spec section 1 in front of the owner with Q1: `watchboard.bsky.social` has 7 followers, and 97 of its last 100 posts have 0 replies.

| Q | Question | Options | Blocks |
|---|---|---|---|
| Q1 | Reverse the 09-21 exclusion of live chat (`docs/superpowers/specs/2026-09-21-radio-layer-and-community-design.md:26-29`)? | (a) yes, as option B with the "comments have no tier" contract, knowing it is a bet on growing an audience (7 followers today); (b) no — keep the exclusion and ship only the baseline below; (c) yes, but an own chat on Durable Objects (option C), accepting the hosting-provider role (DSA arts. 11, 12, 16, 17; GDPR for messages and IPs) — needs a new spec, this plan does not apply | Tasks 1-17 |
| Q2 | Is requiring a Bluesky account to comment acceptable? | yes / no (if the intent was anonymous chat, only option C does that) | Task 1 |
| Q3 | Where do root posts come from? | (a) dedicated roots by cadence on `watchboard.bsky.social`; (b) the same from a separate account (new secrets, canary step, `COMMUNITY_ACTOR` change); (c) fix `scripts/bluesky-post.ts` per-tracker output and use those posts (Tasks 8-9 re-planned); (d) the daily digest post as one global thread (Tasks 8-9 dropped, panel re-planned) | Tasks 8, 9 |
| Q4 | Who may reply? Repo variable `COMMUNITY_REPLY_POLICY`. | `everyone` (no threadgate) / `followers` (7 today: close to closed) / `closed` (nobody; emergencies) | Tasks 8, 9, 16 |
| Q5 | Which pilot trackers? | Real trade-off: low-polarisation ones (`cdmx`, `crispr-gene-therapy`, `bts`, …) are all weekly and low-traffic, so they measure little demand; a live conflict tracker measures demand but brings brigading and illegal-content risk. Name the slugs, and whether at least one is high-traffic | Task 16 |
| Q6 | Removal-request contact (shown in the panel in 4 locales and on `/about`), where the private reason log lives, and legal review of the texts? | address; log location; review yes / no | Tasks 10, 13, 17 |
| Q7 | Threshold after 60 days of **visible** panel: visible replies per thread (median)? What triggers phase 2 (atproto OAuth to comment in-app, or option C)? | a number, with the baseline in view; phase-2 trigger named | Tasks 1, 16 |
| Q8 | If Task 0 finds no CORS, or anonymous reads lack `hiddenReplies` or labels: | a minimal proxy in `worker/` (reintroduces a manually deployed worker and its CSP entry) / fall back to the baseline | Task 1 (only if Task 0 fails) |
| Q9 | Side findings, independent PRs: `push.watchboard.dev` missing from `connect-src` (`src/layouts/BaseLayout.astro:97`, `public/_headers:16`) while `src/lib/push-client.ts` and `src/pages/newsletter.astro` fetch it; and no per-tracker `bluesky-post.ts` output on the account since at least 2026-06-04 | open PRs yes / no | nothing here |
| Q10 | Root-post language? Repo variable `COMMUNITY_ROOT_LANG`. | `en` / `es` / `en+es` in one post (fits 300 graphemes, Task 8 test) / one post per locale (Task 8 re-planned) | Task 8 |
| Q11 | `/sources/`: list the comment feeds in their own "Community (not a source)" section (Task 5 Step 7), or not at all? | own section / omit (then Task 5 Step 7 filters them out without a section) | Task 5 |
| Q12 | Where does the panel live? The clock starts when this ships. | desktop bottom only (Task 12) / plus a tab in `MobileTabShell` / plus a "N comments" affordance near the hero (each extra is a new task) | Tasks 12, 16 |
| Q13 | Docker image default? | off, `--build-arg` to enable (blocklist frozen at image date) / on | Tasks 6, 17 |
| Q14 | Measure reach? | allow anonymous `community_panel_opened` / `community_cta_clicked` under the existing PostHog gate (Task 11 re-planned, separation test amended) / no, accept that a low count cannot separate visibility from demand | Tasks 11, 16 |

### Baseline if Q1 = (b) — "do nothing / link out"

One change, no new host, no new data: in `src/components/static/Footer.astro` (the Bluesky link is at `:40`), add a line "Discuss this tracker on Bluesky" linking to `https://bsky.app/profile/watchboard.bsky.social`. No reading back, no panel, no CSP change, no ADR (no new external source is fetched). Then delete this plan and mark the spec "Rejected — exclusion kept (Q1 = b)".