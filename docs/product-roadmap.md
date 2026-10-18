# Watchboard Product Roadmap

This is the **platform** roadmap — performance, growth, content, accessibility,
infrastructure, UX. New tracker requests live in
[`docs/tracker-roadmap.md`](./tracker-roadmap.md) and the community vote at
`/vote`. The interactive view is at
**[/roadmap/](https://watchboard.dev/roadmap/)** (kanban + timeline + filters).

**Source of truth: [`src/data/roadmap-items.ts`](../src/data/roadmap-items.ts).**
The tables below are generated from it by `scripts/sync-roadmap-doc.ts`, and
`npm test` fails if they drift.

They used to be a hand-maintained "narrative mirror", and on **2026-10-18** that
arrangement had failed completely. The canonical file still stopped at PR #135
while **204 PRs had merged**. Twenty-one of its thirty-nine items were wrong:
cross-tracker search, the daily briefing pages, shareable deep links, Zod
validation in CI, build-failure alerting, the Content Security Policy, the
country trackers and the per-tracker feed redesign were all listed as *planned*
months after they shipped, while the public page advertised "M2 — May 2026 ·
next" in October. Nothing in CI looked at any of it.

## Horizons, not months

The old milestones were calendar promises — `M1 — April 2026`, `M2 — May 2026`,
`M3 — June 2026`, `M4 — Q3 2026`. Dates on a roadmap rot on their own schedule,
and these did: by October every label was in the past and the one marked "next"
contained shipped work. Items now sit in one of four horizons, and the honest
chronology lives on each item's own `date`:

| horizon | means |
| --- | --- |
| **Shipped** | live in production |
| **Now** | in flight, or waiting on one named decision or credential |
| **Next** | committed, not started |
| **Later** | captured so it is not forgotten, no commitment |

## Status legend

- ✅ **Shipped** — live in production
- 🚧 **In progress** — actively being built
- 📋 **Planned** — committed, not started
- 💡 **Idea** — captured, no commitment

## Priority

- **P0** must — drops everything if missing
- **P1** important — material impact on users or operations
- **P2** worth doing — clear ROI, scheduled
- **P3** maybe — captured for visibility, not blocking

---

<!-- roadmap:start -->

_Generated from `src/data/roadmap-items.ts` by `scripts/sync-roadmap-doc.ts`. Do not edit between the markers._

Last reviewed: **2026-10-18** · 75 items

✅ 50 shipped · 📋 16 planned · 💡 6 idea · 🚧 3 in progress

## Now — Being built, or waiting on one named decision or credential

3 items. in flight

| | Title | Area | Priority | Effort | PRs |
| --- | --- | --- | --- | --- | --- |
| 🚧 | **Per-tracker email / Telegram subscriptions** | Growth | P3 | M | — |
| 🚧 | **Restart X posting behind human approval** | Growth | P1 | S | #226, #306, #338 |
| 🚧 | **Automate the remaining video destinations** | Growth | P1 | M | #306, #325 |

- **Per-tracker email / Telegram subscriptions** — Telegram channel notifications and a newsletter page are live; the web-push worker exists but is not wired to a delivery schedule
- **Automate the remaining video destinations** — Blocked on credentials only — no code remains to write

## Next — The queue

13 items. committed, not started

| | Title | Area | Priority | Effort | PRs |
| --- | --- | --- | --- | --- | --- |
| 📋 | **Migrate from GitHub Pages to Cloudflare Pages** | Infrastructure | P0 | S | — |
| 📋 | **Cut homepage HTML payload** | Performance | P1 | M | — |
| 📋 | **Globe discoverability CTA** | UX | P1 | XS | — |
| 📋 | **Per-section "last updated" indicators** | UX | P0 | S | — |
| 📋 | **Accessibility audit (WCAG 2.1 AA)** | Accessibility | P1 | L | — |
| 📋 | **Decide the astro 5 → 7 migration** | Infrastructure | P2 | L | — |
| 📋 | **Ratchet the type baseline down** | Infrastructure | P2 | M | #342 |
| 📋 | **Repair or delete the legacy data updater** | Infrastructure | P2 | S | — |
| 📋 | **Decide whether the hook-first cut replaces the daily brief** | Growth | P2 | S | #228, #229 |
| 📋 | **Spanish narration reads English headlines** | Growth | P2 | S | — |
| 📋 | **Investigate the alerts-panel e2e flake** | Reliability | P2 | S | — |
| 📋 | **Wire or revoke CLOUDFLARE_API_TOKEN** | Infrastructure | P2 | XS | — |
| 📋 | **Gate the production build on pull requests** | Reliability | P1 | S | — |

- **Migrate from GitHub Pages to Cloudflare Pages** — Target: -1 to -2 seconds TTFB
- **Cut homepage HTML payload** — Estimate: HTML 157 KB → ~40 KB, -500-800 ms LCP
- **Decide the astro 5 → 7 migration** — Cheapest next step: run the dev server locally against astro 7 and time one page load, rather than paying for another 50-minute CI run
- **Ratchet the type baseline down** — 56 → 49 baselined errors. Target for the next pass: under 40 without touching the legacy updater.
- **Gate the production build on pull requests** — Found while verifying a src/ change had no build gate on its own PR. Measured cost: the deploy workflow's build takes 17-32 min on CI, so this is a real bill per PR and the path filter is the whole design — the counter-argument is that deploy.yml already fails loudly within minutes and the site keeps serving the last good deploy

## Later — Captured so it is not forgotten

9 items. no commitment

| | Title | Area | Priority | Effort | PRs |
| --- | --- | --- | --- | --- | --- |
| 📋 | **Tree-shake Cesium bundle** | Performance | P2 | L | — |
| 📋 | **Data export (CSV / JSON)** | Growth | P2 | S | — |
| 📋 | **Bundle analysis + Lighthouse CI budget** | Infrastructure | P2 | S | — |
| 💡 | **/compare page — side-by-side trackers** | UX | P3 | M | — |
| 💡 | **"On This Day" historical view** | Content | P3 | M | — |
| 💡 | **Migration corridors globe layer** | Content | P3 | M | — |
| 💡 | **Print-friendly view** | UX | P3 | S | — |
| 💡 | **Event partition scaling** | Infrastructure | P3 | M | — |
| 💡 | **Publish the May triage archive, or leave it in git** | Growth | P3 | XS | — |

- **Tree-shake Cesium bundle** — Not to be confused with the deferral that shipped in April: that moved the cost, this removes it.
- **Data export (CSV / JSON)** — The API shipped; the buttons did not.
- **Publish the May triage archive, or leave it in git** — Recoverable with: git show f654050be:public/_hourly/triage-log.json

## Shipped — What the site does today

50 items. live in production

| | Title | Area | Priority | Effort | PRs |
| --- | --- | --- | --- | --- | --- |
| ✅ | **Multi-step onboarding tour** | UX | P1 | L | #122 |
| ✅ | **Defer Cesium parse past LCP** | Performance | P1 | S | #123 |
| ✅ | **SSR mobile story carousel** | Performance | P1 | M | #124, #126 |
| ✅ | **PostHog Web Vitals capture** | Analytics | P1 | XS | #125 |
| ✅ | **Fix globe double-spin on tracker click** | UX | P2 | XS | #127 |
| ✅ | **Documentation sync** | Infrastructure | P2 | XS | #128 |
| ✅ | **Public /roadmap page** | Growth | P2 | M | #129 |
| ✅ | **CI hygiene: action versions + nightly headroom** | Reliability | P2 | S | #130 |
| ✅ | **Breaking-news pipeline redesign (light scan + per-tracker feeds + realtime + audit)** | Reliability | P0 | XL | #131 |
| ✅ | **Docs sync — README / CHANGELOG / roadmap for the breaking-news pipeline** | Infrastructure | P2 | XS | #132 |
| ✅ | **Consolidated freshness indicator (Header + audit page)** | UX | P1 | S | #133 |
| ✅ | **Docs sync — extensive sync for #133 (freshness) + #132** | Infrastructure | P2 | XS | #134 |
| ✅ | **Light-scan high-score hits now reach tracker data** | Reliability | P0 | S | #135 |
| ✅ | **OG meta tags / social sharing** | Growth | P1 | S | #288 |
| ✅ | **React error boundaries on all islands** | Reliability | P1 | S | #344 |
| ✅ | **Cross-tracker search & filter** | UX | P1 | XL | — |
| ✅ | **"What changed today" view** | Growth | P1 | M | — |
| ✅ | **Shareable deep links** | Growth | P2 | S | #269 |
| ✅ | **Zod validation in CI workflow** | Reliability | P0 | S | #144, #214 |
| ✅ | **Build / nightly failure alerting** | Reliability | P0 | S | #168, #170, #174, #175, #219 |
| ✅ | **Content Security Policy** | Reliability | P2 | S | #190, #196, #199, #218, #250, #322 |
| ✅ | **Country trackers — India / China / Russia / Iran / Turkey / Saudi** | Content | P0 | XL | — |
| ✅ | **Per-tracker RSS / Atom feed redesign** | Growth | P2 | S | #188, #189 |
| ✅ | **Embeddable mini-trackers** | Growth | P3 | L | — |
| ✅ | **E2E smoke tests (Playwright)** | Reliability | P3 | M | #214, #334, #340, #341, #343 |
| ✅ | **Daily intelligence brief video** | Growth | P1 | XL | #194, #227, #228, #229, #232, #301 |
| ✅ | **Spoken narration in two languages, news first** | Growth | P2 | M | #301, #333 |
| ✅ | **Social Command Center** | Growth | P1 | XL | #166, #233, #306, #307 |
| ✅ | **Approval alerts for the social queue** | Growth | P1 | S | #338 |
| ✅ | **Breaking-news scan hardening** | Reliability | P0 | L | #154, #155, #211, #213, #215, #296, #319, #321, #323 |
| ✅ | **Credential canary, freshness alarm and alert routing** | Reliability | P0 | M | #168, #170, #174, #175, #187, #219, #289, #310 |
| ✅ | **Self-hosting: Docker image, GHCR publish, generated nginx headers** | Infrastructure | P2 | L | #270, #279, #280 |
| ✅ | **One cache in front of every live feed, with visible status** | Reliability | P1 | L | #268, #271, #272 |
| ✅ | **Place dossier on right-click** | UX | P1 | XL | #273 |
| ✅ | **Provenance-stamped geo layers** | Content | P1 | L | #274 |
| ✅ | **Gazetteer geoparsing for scan candidates** | Content | P2 | L | #276 |
| ✅ | **Activity index with declared weights** | UX | P2 | L | #277 |
| ✅ | **Provenance badges, degraded sources and thumbnail fingerprints** | Reliability | P1 | L | #275 |
| ✅ | **Radio towers and stations, click to listen** | Content | P2 | L | #287, #290, #291, #293 |
| ✅ | **Declared interests and relevance ranking** | UX | P2 | L | #292, #294, #308 |
| ✅ | **Spanish, French and Portuguese locales** | Growth | P2 | L | #217, #245 |
| ✅ | **Tracker scout and lifecycle** | Infrastructure | P2 | L | #165, #176, #202, #225, #320, #332, #339 |
| ✅ | **Weekly self-review with a retirement path** | Infrastructure | P2 | M | #330, #335 |
| ✅ | **Type-check gate as a ratchet** | Infrastructure | P1 | M | #337 |
| ✅ | **Secrets and variables runbook** | Infrastructure | P1 | S | #327 |
| ✅ | **One place decides the model** | Infrastructure | P2 | S | #324 |
| ✅ | **Ingestion metrics dashboard** | Reliability | P1 | M | — |
| ✅ | **Community vote on the tracker backlog** | Growth | P2 | M | — |
| ✅ | **Machine-readable surfaces for agents** | Growth | P2 | L | — |
| ✅ | **Keep data-derived strings out of inline scripts** | Reliability | P1 | S | #340 |

- **Multi-step onboarding tour** — New visitors learn the navigation surfaces and source-tier system without leaving the homepage
- **Defer Cesium parse past LCP** — vendor-globe long-task: 5018 ms → 178 ms (verified post-deploy)
- **SSR mobile story carousel** — LCP-critical p.story-briefing-text element exists at first paint on mobile
- **PostHog Web Vitals capture** — Real-user perf samples flowing into PostHog → Insights → Web Vitals
- **Breaking-news pipeline redesign (light scan + per-tracker feeds + realtime + audit)** — Major-wire breaking news cadence: 6h → 15min. Mexican/Indian/Israeli trackers automatically pull native-language outlets. Every triage decision visible for tuning at /breaking-news-audit/.
- **Consolidated freshness indicator (Header + audit page)** — ~38 lines of vanilla DOM mutation deleted. 9 unit tests lock down classifyFreshness boundaries + formatAgo buckets. Locale-aware "unknown" copy (en/es/fr/pt). Reusable for future pages that need at-a-glance freshness.
- **Light-scan high-score hits now reach tracker data** — Closes the alert→triage→data-update loop the original two-tier redesign assumed but never wired. High-confidence breaking news now lands in tracker events files within ~6 h instead of being lost.
- **OG meta tags / social sharing** — og:image and twitter:card per page in BaseLayout.astro, generated by src/pages/og/[tracker].png.ts and og-card.png.ts
- **React error boundaries on all islands** — 7 of 20 island files carried a boundary before this; 16 do now, covering every page-level mount. The title used to say "all islands", which was never the right criterion.
- **Cross-tracker search & filter** — Live at /search/ — Pagefind UI over the built site, indexed by the postbuild step, with a client-side tracker filter as fallback
- **"What changed today" view** — Live at /briefing/{date}/ — per-day cross-tracker summary pages with provenance badges per digest
- **Shareable deep links** — src/lib/view-state.ts is the one URL format for every surface; ADR-0001 records why it stayed island-local, so no cross-island state library was needed
- **Zod validation in CI workflow** — The nightly validates JSON and Zod, dispatches a fix agent on failure, re-validates, and gates on a build before committing; the vitest suite now runs on every PR
- **Build / nightly failure alerting** — Daily credential canary, a freshness alarm that judges each tracker against its own cadence, and ops alerts routed to the private chat with a guard against the public channel
- **Content Security Policy** — Enforced, with per-page SHA-256 hashes replacing 'unsafe-inline' at postbuild and violations reported to PostHog — because report-uri is ignored in a meta element and Pages serves no CSP header
- **Country trackers — India / China / Russia / Iran / Turkey / Saudi** — 125 active trackers including India, China, Russia, Iran, Turkey and Saudi Arabia; new ones take ~25 minutes via the init-tracker workflow
- **Per-tracker RSS / Atom feed redesign** — Global, breaking, light-scan and per-tracker feeds, with an HTML index, a JSON list and an OPML bundle all discovered automatically from each endpoint's feedMeta export
- **Embeddable mini-trackers** — Live at /embed/{tracker}/
- **E2E smoke tests (Playwright)** — Playwright on every PR, with /search and /roadmap covered after both turned out to have none. Flakes get fixed by finding the race — a hydration wait, a disabled camera — not by raising a timeout.
- **Daily intelligence brief video** — Publishes unattended every night; the archive at /videos/ records items, KPIs, source tiers and run id per day
- **Spoken narration in two languages, news first** — Verified in production: 331 characters EN / 324 ES, three headlines, one brand mention at the end
- **Approval alerts for the social queue** — Measured before it existed: 0 posts a day reached X while 1-5 proposals a day waited unseen in the queue
- **Breaking-news scan hardening** — Hourly Breaking News Scan failure rate 26% → 0 over three days
- **One cache in front of every live feed, with visible status** — A hook that swallows a failure is now a bug with a name: docs/silent-failure-patterns.md
- **Tracker scout and lifecycle** — Backlog arrival ~2/week against a 60-66 day lifetime, so it settles near 15-20 open instead of growing
- **Type-check gate as a ratchet** — Caught a real latent error on its first three runs: JSX.Element resolving only on machines where another dependency declared it
- **Ingestion metrics dashboard** — Live at /metrics/ — src/components/islands/MetricsDashboard.tsx, public/_metrics/
- **Community vote on the tracker backlog** — Live at /vote/ — src/pages/vote.astro, .github/workflows/tally-tracker-votes.yml
- **Machine-readable surfaces for agents** — Live at /api/, /skill/, /feeds/, /feeds.json, /feeds.opml and /embed/{tracker}/
- **Keep data-derived strings out of inline scripts** — Control: the new test fails against the unfixed page, naming the leaked tracker titles

<!-- roadmap:end -->

---

## How priority gets set

1. **Impact ÷ effort.** A P0 has either large impact (the Pages migration is
   ‑1 to ‑2 s TTFB for every visitor) or a hard reliability cost (a revoked
   token once took seven workflows down for two weeks unnoticed).
2. **Measure before optimising.** Real-user Web Vitals shipped before the perf
   work specifically so those decisions rest on field data rather than on
   single-run Lighthouse noise.
3. **A gate beats a reminder.** Several items here exist because a green step
   was doing nothing: 225 tests no workflow ran, a CSP the browser ignored, a
   type check the build never performed. Where a defect class can be gated, it
   is gated — see [`silent-failure-patterns.md`](./silent-failure-patterns.md).
4. **Content and platform are tracked separately.**
   `docs/tracker-roadmap.md` covers which trackers to build; this covers
   everything else.

## Update protocol

Anyone — maintainer, contributor, agent — changing the roadmap:

1. Edit **`src/data/roadmap-items.ts`**. Nothing else is canonical.
2. When shipping, set `status: 'shipped'`, move it to `milestone: 'done'`, and
   fill `prs` (or `outcome` with the path or URL, for work that landed as a
   direct commit). `npm test` rejects a shipped item with neither.
3. Regenerate this file:
   `npx tsx scripts/sync-roadmap-doc.ts --write docs/product-roadmap.md`
4. Bump `ROADMAP_LAST_REVIEWED`. Past 45 days the test suite warns; the weekly
   self-review's `roadmap-drift` dimension files an issue, because blocking an
   unrelated PR over a stale document is how checks get switched off.
