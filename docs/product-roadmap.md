# Watchboard Product Roadmap

Last updated: 2026-04-28

This is the **platform** roadmap — performance, growth, content, accessibility, infrastructure, UX. New tracker requests live in [`docs/tracker-roadmap.md`](./tracker-roadmap.md) and the community vote at `/vote`.

The interactive view is at **[/roadmap/](https://watchboard.dev/roadmap/)** (kanban + timeline + filters). Source of truth: [`src/data/roadmap-items.ts`](../src/data/roadmap-items.ts) — this markdown is a narrative mirror, not the canonical list.

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

## M1 — April 2026 ✅ shipped

**Theme:** Onboarding + perf foundations + breaking-news pipeline.

| Status | Title | Area | Priority | PRs |
|---|---|---|---|---|
| ✅ | Multi-step onboarding tour | UX | P1 | #122 |
| ✅ | Defer Cesium parse past LCP | Performance | P1 | #123 |
| ✅ | SSR mobile story carousel + hydration fix | Performance | P1 | #124, #126 |
| ✅ | PostHog Web Vitals capture | Analytics | P1 | #125 |
| ✅ | Fix globe double-spin on tracker click | UX | P2 | #127 |
| ✅ | Documentation sync | Infrastructure | P2 | #128 |
| ✅ | Public roadmap page | Growth | P2 | #129 |
| ✅ | CI hygiene (action versions + nightly headroom) | Reliability | P2 | #130 |
| ✅ | **Breaking-news pipeline redesign** (light scan + per-tracker feeds + realtime + audit) | Reliability / Growth | **P0** | #131 |
| ✅ | Docs sync — README / CHANGELOG / roadmap for the breaking-news pipeline | Infrastructure | P2 | #132 |
| ✅ | Consolidated freshness indicator (Header + audit page) — implements the freshness slice of the 2026-03-04 P0 data-freshness-indicators spec | UX | P1 | #133 |

**Verified outcomes:**
- vendor-globe long-task: **5018 ms → 178 ms** (Lighthouse mobile post-deploy).
- LCP element (`p.story-briefing-text`) now exists in initial HTML on mobile.
- Real-user perf samples flowing into PostHog → Insights → Web Vitals.
- Breaking-news cadence: **6 h → 15 min** for major-wire stories. Per-tracker feeds auto-extend coverage when a new tracker is added (no scan-script edits). Every triage decision now visible at `/breaking-news-audit/` for threshold tuning.
- Single, typed freshness component drives both the page-header "Updated Xh ago" pill and the audit-page "Last scan: …" label. ~38 lines of vanilla DOM mutation deleted, 9 unit tests added to lock down boundary inclusivity (the failure mode that originally let stale data render as fresh).

---

## M2 — May 2026 📋 next

**Theme:** Real-user perf wins + first growth lever.

| Title | Area | Priority | Effort | Notes |
|---|---|---|---|---|
| Migrate from GitHub Pages to Cloudflare Pages | Infrastructure | **P0** | S | Highest ROI/hour. Target -1 to -2s TTFB |
| Cut homepage HTML payload | Performance | P1 | M | 95 trackers serialized = 157 KB doc. Lazy-load detail fields |
| OG meta tags / social sharing | Growth | P1 | S | Twitter card previews, Open Graph per tracker |
| Globe discoverability CTA | UX | P1 | XS | The 3D globe is invisible from the main entry |
| React error boundaries on all islands | Reliability | P1 | S | WebGL/Cesium failures currently render a white screen |
| Per-section "last updated" indicators | UX | **P0** | S | Spec exists, never shipped |

---

## M3 — June 2026 📋 planning

**Theme:** Search + retention + reliability hardening.

| Title | Area | Priority | Effort | Notes |
|---|---|---|---|---|
| Cross-tracker search & filter | UX | P1 | XL | Needs ADR on cross-island state (nanostores) before coding |
| "What changed today" view | Growth | P1 | M | Diff/changelog for returning users — primary retention driver |
| Shareable deep links | Growth | P2 | M | Depends on cross-island state from search |
| Tree-shake Cesium bundle | Performance | P2 | L | 4.3 MB → ~1.5-2 MB; mobile parse 5s → ~2s |
| Zod validation in CI workflow | Reliability | **P0** | S | Schema-valid-but-corrupt data can break the build today |
| Build / nightly failure alerting | Reliability | **P0** | S | Site silently serves stale data on pipeline failure |
| Content Security Policy | Reliability | P2 | S | Defense-in-depth for AI-generated content |

---

## M4 — Q3 2026 📋 horizon

**Theme:** Accessibility + content depth.

| Title | Area | Priority | Effort | Notes |
|---|---|---|---|---|
| Accessibility audit (WCAG 2.1 AA) | Accessibility | P1 | L | Keyboard nav on maps, ARIA, screen reader. Cesium has limits |
| Country trackers — India / China / Russia / Iran / Turkey / Saudi | Content | **P0** | XL | Tier 1 from `tracker-roadmap.md`; in progress |
| Data export (CSV / JSON) | Growth | P2 | S | Per-section download buttons; sanitize for Excel formula injection |
| Bundle analysis + Lighthouse CI budget | Infrastructure | P2 | S | Catch bloat before merge |
| Per-tracker RSS / Atom feed redesign | Growth | P2 | S | Existing feeds work; need richer item bodies |

---

## Future 💡 ideas

No commitment. Captured here so they don't slip out of memory.

- `/compare` page — side-by-side 2–3 tracker view (UX / P3)
- "On This Day" historical view across 1300+ events (Content / P3)
- Migration corridors globe layer (Content / P3)
- Per-tracker email / Telegram subscriptions (Growth / P3)
- Embeddable mini-trackers for partner sites (Growth / P3)
- Print-friendly view for analyst briefings (UX / P3)
- E2E smoke tests with Playwright (Reliability / P3)
- Event partition scaling plan — content collections + pagination (Infrastructure / P3)

---

## How priority and milestones get set

1. **Impact ÷ effort.** A P0 in M2 has either huge impact (Cloudflare Pages = -2s TTFB for every user) or hard reliability cost (Zod-in-CI prevents bad deploys).
2. **Measure before optimizing.** PostHog Web Vitals shipped first specifically so M2 perf decisions can be backed by real-user data, not Lighthouse single-run noise (~30-40% spread on identical loads).
3. **Milestones are 4–6 week windows**, not deadlines. Items re-slot when measurement or user feedback changes priority. Moving an item M2 → M3 is normal, not a failure.
4. **Content vs platform are tracked separately.** `docs/tracker-roadmap.md` covers which trackers to build; this doc covers everything else.

## Update protocol

Anyone (maintainer, contributor, AI agent) editing this roadmap:

1. Update `src/data/roadmap-items.ts` with the new/changed item — the `/roadmap` page picks it up at the next build.
2. Mirror the change in this markdown so the doc and the page agree.
3. If shipping, set `status: 'shipped'`, fill `prs: [...]`, optionally `outcome: '...'`.
4. If re-slotting, change `milestone` and add a one-line rationale in commit message.
5. Bump the "Last updated" date at the top of this file.
