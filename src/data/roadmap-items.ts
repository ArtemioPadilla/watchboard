/**
 * Source of truth for the public-facing /roadmap page and the markdown
 * mirror at docs/product-roadmap.md. When you ship/start/plan an item,
 * update its status here — the Astro page reads this file at build time.
 */

export type RoadmapStatus = 'shipped' | 'in-progress' | 'planned' | 'idea';
export type RoadmapArea =
  | 'performance'
  | 'growth'
  | 'content'
  | 'accessibility'
  | 'infrastructure'
  | 'analytics'
  | 'ux'
  | 'reliability';
export type RoadmapPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type RoadmapEffort = 'XS' | 'S' | 'M' | 'L' | 'XL';
/**
 * Horizons, not months.
 *
 * These were `M1 — April 2026` through `M4 — Q3 2026`. Calendar labels on a
 * roadmap rot on their own schedule, and these did: by October 2026 every one
 * was in the past, the one marked "next" held work that had shipped in May, and
 * the public page was advertising a May milestone as upcoming. The honest
 * chronology lives on each item's own `date`.
 */
export type RoadmapMilestone = 'done' | 'now' | 'next' | 'later';

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  area: RoadmapArea;
  priority: RoadmapPriority;
  effort: RoadmapEffort;
  milestone: RoadmapMilestone;
  /** Closed PRs that delivered this item. */
  prs?: number[];
  /** Other item IDs this depends on. */
  dependsOn?: string[];
  /** Date in ISO yyyy-mm-dd. For shipped: when it shipped. For others: when last updated/added. */
  date: string;
  /** Optional one-line evidence or measured outcome. */
  outcome?: string;
}

export const MILESTONES: Record<RoadmapMilestone, { label: string; window: string; theme: string }> = {
  done:  { label: 'Shipped', window: 'live in production',    theme: 'What the site does today' },
  now:   { label: 'Now',     window: 'in flight',             theme: 'Being built, or waiting on one named decision or credential' },
  next:  { label: 'Next',    window: 'committed, not started',theme: 'The queue' },
  later: { label: 'Later',   window: 'no commitment',         theme: 'Captured so it is not forgotten' },
};

/** Display order, shared by the /roadmap board and the generated markdown. */
export const MILESTONE_ORDER: RoadmapMilestone[] = ['now', 'next', 'later', 'done'];

/**
 * When the roadmap was last reconciled against the repository.
 *
 * It sat at PR #135 from 7 September to 18 October while 204 PRs merged, so
 * this is now a checked value: tests/roadmap.test.ts warns once it is more
 * than 45 days old, and the weekly self-review's `roadmap-drift` dimension
 * files an issue. It is deliberately not a hard CI failure — blocking an
 * unrelated PR over a stale document is how checks get switched off.
 */
export const ROADMAP_LAST_REVIEWED = '2026-10-18';

export const AREA_META: Record<RoadmapArea, { label: string; color: string; emoji: string }> = {
  performance:    { label: 'Performance',    color: 'var(--accent-blue,   #58a6ff)', emoji: '⚡' },
  growth:         { label: 'Growth',         color: 'var(--accent-green,  #2ecc71)', emoji: '📈' },
  content:        { label: 'Content',        color: 'var(--accent-amber,  #f39c12)', emoji: '📚' },
  accessibility:  { label: 'Accessibility',  color: 'var(--accent-purple, #a371f7)', emoji: '♿' },
  infrastructure: { label: 'Infrastructure', color: 'var(--text-muted,    #8b949e)', emoji: '🛠️' },
  analytics:      { label: 'Analytics',      color: 'var(--tier-2,        #58a6ff)', emoji: '📊' },
  ux:             { label: 'UX',             color: 'var(--accent-red,    #e74c3c)', emoji: '🎨' },
  reliability:    { label: 'Reliability',    color: 'var(--tier-3,        #f39c12)', emoji: '🛡️' },
};

export const STATUS_META: Record<RoadmapStatus, { label: string; color: string; description: string }> = {
  shipped:       { label: 'Shipped',     color: 'var(--accent-green, #2ecc71)', description: 'Live in production' },
  'in-progress': { label: 'In progress', color: 'var(--accent-amber, #f39c12)', description: 'Actively being built' },
  planned:       { label: 'Planned',     color: 'var(--accent-blue,  #58a6ff)', description: 'Committed, not started' },
  idea:          { label: 'Idea',        color: 'var(--text-muted,   #8b949e)', description: 'Captured, no commitment' },
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
  // ─── M1 — Shipped April 2026 ───────────────────────────────────────
  {
    id: 'rm-onboarding-tour',
    title: 'Multi-step onboarding tour',
    description:
      '6-step desktop guided tour (hero → globe → sidebar → broadcast ticker → source-tier explainer → closing) and a 3-step mobile bottom-sheet, replacing the single-toast welcome. SVG-mask spotlight primitive, replayable via the ? menu.',
    status: 'shipped', area: 'ux', priority: 'P1', effort: 'L', milestone: 'done',
    prs: [122], date: '2026-04-25',
    outcome: 'New visitors learn the navigation surfaces and source-tier system without leaving the homepage',
  },
  {
    id: 'rm-defer-cesium',
    title: 'Defer Cesium parse past LCP',
    description:
      'Wrap the lazy GlobePanel import in a deferImport helper that yields to requestIdleCallback so Cesium\'s ~5s of CPU on mobile no longer competes with the homepage paint and React hydration.',
    status: 'shipped', area: 'performance', priority: 'P1', effort: 'S', milestone: 'done',
    prs: [123], date: '2026-04-26',
    outcome: 'vendor-globe long-task: 5018 ms → 178 ms (verified post-deploy)',
  },
  {
    id: 'rm-ssr-mobile-carousel',
    title: 'SSR mobile story carousel',
    description:
      'Render MobileStoryCarousel unconditionally so the LCP-critical text exists in the initial HTML; control visibility purely via CSS @media. Adds cc-mobile-tab-{live|trackers} root class to also CSS-drive the mobile sidebar (no pre-hydration flash).',
    status: 'shipped', area: 'performance', priority: 'P1', effort: 'M', milestone: 'done',
    prs: [124, 126], date: '2026-04-26',
    outcome: 'LCP-critical p.story-briefing-text element exists at first paint on mobile',
  },
  {
    id: 'rm-web-vitals',
    title: 'PostHog Web Vitals capture',
    description:
      'Enable capture_performance: { web_vitals: true } so we collect real-user LCP / INP / CLS / FCP / TTFB samples and stop relying on noisy synthetic Lighthouse runs.',
    status: 'shipped', area: 'analytics', priority: 'P1', effort: 'XS', milestone: 'done',
    prs: [125], date: '2026-04-26',
    outcome: 'Real-user perf samples flowing into PostHog → Insights → Web Vitals',
  },
  {
    id: 'rm-globe-double-spin',
    title: 'Fix globe double-spin on tracker click',
    description:
      'handleSelect was triggering two camera flights — broadcast.jumpTo() then GlobePanel\'s activeTracker useEffect. Skip the latter when broadcastMode is on.',
    status: 'shipped', area: 'ux', priority: 'P2', effort: 'XS', milestone: 'done',
    prs: [127], date: '2026-04-26',
  },
  {
    id: 'rm-docs-sync',
    title: 'Documentation sync',
    description:
      'Update CLAUDE.md, CHANGELOG.md, BACKLOG.md, posthog-setup.md to reflect the April 26 batch (onboarding, defer Cesium, SSR carousel, Web Vitals, hydration fix, globe spin fix) and register the deferred perf levers as BL-025/026/027.',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'XS', milestone: 'done',
    prs: [128], date: '2026-04-26',
  },
  {
    id: 'rm-public-roadmap-page',
    title: 'Public /roadmap page',
    description:
      '33-item interactive roadmap (kanban + timeline + area filters + expandable cards) sourced from src/data/roadmap-items.ts and mirrored at docs/product-roadmap.md. Linked from About + footer.',
    status: 'shipped', area: 'growth', priority: 'P2', effort: 'M', milestone: 'done',
    prs: [129], date: '2026-04-26',
  },
  {
    id: 'rm-ci-hygiene',
    title: 'CI hygiene: action versions + nightly headroom',
    description:
      'Bump actions/checkout v4 → v5 and actions/setup-node v4 → v5 across all 14 workflow files (Node 20 deprecation 2026-06-02). Bump nightly finalize timeout-minutes 20 → 45 (Astro build + social queue was hitting the wall). Drop invalid timeout_minutes input from claude-code-action.',
    status: 'shipped', area: 'reliability', priority: 'P2', effort: 'S', milestone: 'done',
    prs: [130], date: '2026-04-27',
  },
  {
    id: 'rm-breaking-news-pipeline',
    title: 'Breaking-news pipeline redesign (light scan + per-tracker feeds + realtime + audit)',
    description:
      'Two-tier scan cadence (15-min light scan + 6h heavy scan) + per-tracker dynamic feeds (COUNTRY_FEEDS keyed by ISO codes + REGION_FEEDS + DOMAIN_FEEDS) + realtime sources (Bluesky firehose + Telegram public channels) + persistent triage audit log + public /breaking-news-audit/ page. Light scan uses deterministic keyword matching (no LLM cost); heavy scan keeps Sonnet triage. Adding a tracker auto-extends source coverage with no scan-script edits.',
    status: 'shipped', area: 'reliability', priority: 'P0', effort: 'XL', milestone: 'done',
    prs: [131], date: '2026-04-27',
    outcome:
      'Major-wire breaking news cadence: 6h → 15min. Mexican/Indian/Israeli trackers automatically pull native-language outlets. Every triage decision visible for tuning at /breaking-news-audit/.',
  },
  {
    id: 'rm-docs-sync-breaking-news',
    title: 'Docs sync — README / CHANGELOG / roadmap for the breaking-news pipeline',
    description:
      'Documents PR #131 across README (rewritten "Hourly Breaking News Scan" → two-tier flow with realtime + audit), CHANGELOG (full Added entry), product-roadmap.md (M1 shipped table + outcomes), and src/data/roadmap-items.ts (so the live /roadmap page stat counters and Kanban view include #132).',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'XS', milestone: 'done',
    prs: [132], date: '2026-04-27',
  },
  {
    id: 'rm-freshness-badge',
    title: 'Consolidated freshness indicator (Header + audit page)',
    description:
      'Replaces Header.astro\'s vanilla-JS freshness span with a typed, SSR-safe React island (FreshnessBadge) that ticks every 60s and emits the static date during SSR to avoid React #418 hydration errors. Same strings, classes, and 30h staleness threshold as before. The audit page (/breaking-news-audit/) now also surfaces "Last scan: X ago" with tighter thresholds (1h fresh / 6h stale) since the light scan runs every 15 min. Implements the freshness slice of the long-pending data-freshness-indicators spec (P0, approved 2026-03-04).',
    status: 'shipped', area: 'ux', priority: 'P1', effort: 'S', milestone: 'done',
    prs: [133], date: '2026-04-27',
    outcome:
      '~38 lines of vanilla DOM mutation deleted. 9 unit tests lock down classifyFreshness boundaries + formatAgo buckets. Locale-aware "unknown" copy (en/es/fr/pt). Reusable for future pages that need at-a-glance freshness.',
  },
  {
    id: 'rm-docs-sync-freshness',
    title: 'Docs sync — extensive sync for #133 (freshness) + #132',
    description:
      'README, CHANGELOG, product-roadmap.md, CLAUDE.md, and src/data/roadmap-items.ts updated so that documentation, the live /roadmap page stat counters, and the Kanban view all reflect PR #132 and #133 (freshness consolidation). Mirrors the FreshnessBadge React island into the islands catalog; documents TriageLogBoard\'s "Last scan:" mount.',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'XS', milestone: 'done',
    prs: [134], date: '2026-04-28',
  },
  {
    id: 'rm-light-scan-pending-fix',
    title: 'Light-scan high-score hits now reach tracker data',
    description:
      'Two bugs in the breaking-news pipeline silently swallowed every queued candidate. (1) hourly-light-scan.ts routed score ≥ 0.85 only to Telegram + audit log, never to pending-candidates.json — so the AI-triage heavy scan (which is what writes tracker JSON) never saw the candidate. The CJNG El Jardinero detention was the canary: detected 2× at 0.87 on 2026-04-27, posted to Telegram, but mencho-cjng/data/events/* unchanged. (2) hourly-scan.ts deduped pending entries against state.seen — but every pending URL was guaranteed to be in state.seen by the time the heavy scan ran, so all of them were filtered out. Fix: high-score branch also pushes to pending; pending-promotion extracted into testable helper that dedups only against the in-flight batch. 4 new unit tests, [hourly-scan] promoted N log line for observability.',
    status: 'shipped', area: 'reliability', priority: 'P0', effort: 'S', milestone: 'done',
    prs: [135], date: '2026-04-28',
    outcome:
      'Closes the alert→triage→data-update loop the original two-tier redesign assumed but never wired. High-confidence breaking news now lands in tracker events files within ~6 h instead of being lost.',
  },

  // ─── M2 — May 2026: Real-user perf + growth ─────────────────────────
  {
    id: 'rm-cloudflare-pages',
    title: 'Migrate from GitHub Pages to Cloudflare Pages',
    description:
      'GH Pages TTFB is 1.8-2.5s; Cloudflare Pages typically 200-400ms + automatic Brotli compression + better LATAM/EU edge presence. No code changes, only DNS swap. Highest ROI/hour of the remaining perf levers.',
    status: 'planned', area: 'infrastructure', priority: 'P0', effort: 'S', milestone: 'next',
    date: '2026-04-26', dependsOn: ['rm-web-vitals'],
    outcome: 'Target: -1 to -2 seconds TTFB',
  },
  {
    id: 'rm-cut-html-payload',
    title: 'Cut homepage HTML payload',
    description:
      'The homepage serialises every tracker into the initial HTML. Part of this shipped with the activity index: the factor breakdown moved out to /api/cards/{slug}.json so the HTML stays slim. What is left is the rest of the per-tracker detail, and a measured before/after — the original 157 KB figure predates 125 trackers and has not been re-measured.',
    status: 'planned', area: 'performance', priority: 'P1', effort: 'M', milestone: 'next',
    date: '2026-04-26', dependsOn: ['rm-cloudflare-pages'],
    outcome: 'Estimate: HTML 157 KB → ~40 KB, -500-800 ms LCP',
  },
  {
    id: 'rm-og-meta-tags',
    title: 'OG meta tags / social sharing',
    description:
      'Twitter/X card previews + Open Graph tags per tracker so shared links render with hero image, headline, and tier-color accent. Highest effort-to-impact for organic reach.',
    status: 'shipped', area: 'growth', priority: 'P1', effort: 'S', milestone: 'done',
    prs: [288],
    date: '2026-04-26',
    outcome:
      'og:image and twitter:card per page in BaseLayout.astro, generated by src/pages/og/[tracker].png.ts and og-card.png.ts',
  },
  {
    id: 'rm-globe-cta',
    title: 'Globe discoverability CTA',
    description:
      'A "View 3D Globe" prompt in the hero or header — the showpiece feature is invisible from the main entry. Trivial effort, high visibility.',
    status: 'planned', area: 'ux', priority: 'P1', effort: 'XS', milestone: 'next',
    date: '2026-04-26',
  },
  {
    id: 'rm-error-boundaries',
    title: 'React error boundaries on all islands',
    description:
      'A WebGL or Cesium failure still renders a white panel on most islands. Measured on 2026-10-18: 7 of the 20 island files have an error boundary, so this was never the "all islands" the title claimed.',
    status: 'planned', area: 'reliability', priority: 'P1', effort: 'S', milestone: 'next',
    date: '2026-04-26',
    outcome:
      'Today: 7 of 20 island files. The remaining 13 are the work.',

  },
  {
    id: 'rm-data-freshness',
    title: 'Per-section "last updated" indicators',
    description:
      'Visible per-section timestamps so readers can judge data recency at a glance. Spec exists from earlier and was never shipped.',
    status: 'planned', area: 'ux', priority: 'P0', effort: 'S', milestone: 'next',
    date: '2026-04-26',
  },

  // ─── M3 — June 2026: Search + retention ─────────────────────────────
  {
    id: 'rm-search-filter',
    title: 'Cross-tracker search & filter',
    description:
      'Full-text search across every tracker and its events, with a client-side filter as a fallback when the index is unavailable. The ADR on cross-island state turned out to be unnecessary: the page is self-contained, which is also what ADR-0001 concluded for shareable view state.',
    status: 'shipped', area: 'ux', priority: 'P1', effort: 'XL', milestone: 'done',
    date: '2026-04-26', dependsOn: ['rm-data-freshness'],
    outcome:
      'Live at /search/ — Pagefind UI over the built site, indexed by the postbuild step, with a client-side tracker filter as fallback',
  },
  {
    id: 'rm-what-changed-today',
    title: '"What changed today" view',
    description:
      'Diff/changelog view for returning users showing what updated since their last visit. Uses daily event partitions + localStorage last-visit timestamp. Primary retention driver for a live tracker.',
    status: 'shipped', area: 'growth', priority: 'P1', effort: 'M', milestone: 'done',
    date: '2026-04-26',
    outcome:
      'Live at /briefing/{date}/ — per-day cross-tracker summary pages with provenance badges per digest',
  },
  {
    id: 'rm-shareable-deeplinks',
    title: 'Shareable deep links',
    description:
      'URL parameters for camera, zoom, layers, date, event and selected tracker so a link reopens the exact view on the globe, the 2D map and the homepage. Island-local per ADR-0001 (docs/adr/0001-url-view-state-is-island-local.md), so it no longer waits for cross-island search state.',
    status: 'shipped', area: 'growth', priority: 'P2', effort: 'S', milestone: 'done',
    prs: [269],
    date: '2026-09-07',
    outcome:
      'src/lib/view-state.ts is the one URL format for every surface; ADR-0001 records why it stayed island-local, so no cross-island state library was needed',
  },
  {
    id: 'rm-tree-shake-cesium',
    title: 'Tree-shake Cesium bundle',
    description:
      'Cesium is 4.3 MB and is now deferred past the LCP window rather than reduced — deferImport yields the parse to requestIdleCallback, which moved the cost off the critical path without removing it. Tree-shaking the bundle is still the only thing that shrinks it.',
    status: 'planned', area: 'performance', priority: 'P2', effort: 'L', milestone: 'later',
    date: '2026-04-26', dependsOn: ['rm-cut-html-payload', 'rm-cloudflare-pages'],
    outcome:
      'Not to be confused with the deferral that shipped in April: that moved the cost, this removes it.',

  },
  {
    id: 'rm-zod-ci-validation',
    title: 'Zod validation in CI workflow',
    description:
      'Nightly update workflow only runs JSON.parse(), not Zod schema checks. Schema-valid-but-corrupt data can break the build. Run Zod validation inside the update script before writing to disk.',
    status: 'shipped', area: 'reliability', priority: 'P0', effort: 'S', milestone: 'done',
    prs: [144, 214],
    date: '2026-04-26',
    outcome:
      'The nightly validates JSON and Zod, dispatches a fix agent on failure, re-validates, and gates on a build before committing; the vitest suite now runs on every PR',
  },
  {
    id: 'rm-build-fail-alerts',
    title: 'Build / nightly failure alerting',
    description:
      'Notify the maintainer when the nightly update or deploy fails so the site does not silently serve stale data for days.',
    status: 'shipped', area: 'reliability', priority: 'P0', effort: 'S', milestone: 'done',
    prs: [168, 170, 174, 175, 219],
    date: '2026-04-26',
    outcome:
      'Daily credential canary, a freshness alarm that judges each tracker against its own cadence, and ops alerts routed to the private chat with a guard against the public channel',
  },
  {
    id: 'rm-csp',
    title: 'Content Security Policy',
    description:
      'CSP meta tag allowlisting Cesium Ion, Carto, OpenSky, USGS, Open-Meteo, PostHog, Cloudflare. Defense in depth for AI-generated content.',
    status: 'shipped', area: 'reliability', priority: 'P2', effort: 'S', milestone: 'done',
    prs: [190, 196, 199, 218, 250, 322],
    date: '2026-04-26',
    outcome:
      'Enforced, with per-page SHA-256 hashes replacing \'unsafe-inline\' at postbuild and violations reported to PostHog — because report-uri is ignored in a meta element and Pages serves no CSP header',
  },

  // ─── M4 — Q3 2026: Accessibility + content depth ─────────────────────
  {
    id: 'rm-a11y-audit',
    title: 'Accessibility audit (WCAG 2.1 AA)',
    description:
      'Keyboard navigation on maps, ARIA attributes, screen reader support across timelines, military tabs, and the globe. Spec must define which components get full a11y vs text alternatives (Cesium has limits).',
    status: 'planned', area: 'accessibility', priority: 'P1', effort: 'L', milestone: 'next',
    date: '2026-04-26',
  },
  {
    id: 'rm-india-china-russia',
    title: 'Country trackers — India / China / Russia / Iran / Turkey / Saudi',
    description:
      'Tier 1 country trackers from tracker-roadmap.md. Each ships with full historical eras (e.g. Achaemenid Empire → Pezeshkian for Iran), maps, KPIs, claims, and political grids.',
    status: 'shipped', area: 'content', priority: 'P0', effort: 'XL', milestone: 'done',
    date: '2026-04-26',
    outcome:
      '125 active trackers including India, China, Russia, Iran, Turkey and Saudi Arabia; new ones take ~25 minutes via the init-tracker workflow',
  },
  {
    id: 'rm-data-export',
    title: 'Data export (CSV / JSON)',
    description:
      'Per-section CSV and JSON download buttons, sanitised against Excel formula injection. The machine-readable half already exists — public/api/v1/*.json, /api/cards/{slug}.json, the feeds and the MCP server — so what is missing is the in-page download affordance for a reader who wants one section as a spreadsheet.',
    status: 'planned', area: 'growth', priority: 'P2', effort: 'S', milestone: 'later',
    date: '2026-04-26',
    outcome:
      'The API shipped; the buttons did not.',

  },
  {
    id: 'rm-bundle-analysis',
    title: 'Bundle analysis + Lighthouse CI budget',
    description:
      'Add rollup-plugin-visualizer + a Lighthouse CI budget so future PRs that bloat the bundle are caught before merge.',
    status: 'planned', area: 'infrastructure', priority: 'P2', effort: 'S', milestone: 'later',
    date: '2026-04-26',
  },
  {
    id: 'rm-rss-feed-improvement',
    title: 'Per-tracker RSS / Atom feed redesign',
    description:
      'Per-tracker /feed.xml via @astrojs/rss with proper XML encoding for AI-generated content. Existing feeds work but lack rich item bodies.',
    status: 'shipped', area: 'growth', priority: 'P2', effort: 'S', milestone: 'done',
    prs: [188, 189],
    date: '2026-04-26',
    outcome:
      'Global, breaking, light-scan and per-tracker feeds, with an HTML index, a JSON list and an OPML bundle all discovered automatically from each endpoint\'s feedMeta export',
  },

  // ─── Future: Ideas with no commitment ───────────────────────────────
  {
    id: 'rm-compare-page',
    title: '/compare page — side-by-side trackers',
    description:
      'Side-by-side 2–3 tracker view (e.g. AMLO vs Sheinbaum, AR vs CL economy) for analysts who want to contrast.',
    status: 'idea', area: 'ux', priority: 'P3', effort: 'M', milestone: 'later',
    date: '2026-04-26',
  },
  {
    id: 'rm-on-this-day',
    title: '"On This Day" historical view',
    description:
      'Daily chronological view across the 1300+ events embedded in tracker timelines.',
    status: 'idea', area: 'content', priority: 'P3', effort: 'M', milestone: 'later',
    date: '2026-04-26',
  },
  {
    id: 'rm-migration-corridors',
    title: 'Migration corridors globe layer',
    description:
      'Visual layer connecting linked trackers (VE → CO → PE → CL, NCA → MX → US). Dataviz for a story Watchboard is uniquely positioned to tell.',
    status: 'idea', area: 'content', priority: 'P3', effort: 'M', milestone: 'later',
    date: '2026-04-26',
  },
  {
    id: 'rm-tracker-subscriptions',
    title: 'Per-tracker email / Telegram subscriptions',
    description:
      'Subscribe to a specific tracker and receive a digest when it updates. Bsky / Telegram dispatch already exist as backend; needs subscriber UI + per-user routing.',
    status: 'in-progress', area: 'growth', priority: 'P3', effort: 'M', milestone: 'now',
    date: '2026-04-26',
    outcome:
      'Telegram channel notifications and a newsletter page are live; the web-push worker exists but is not wired to a delivery schedule',
  },
  {
    id: 'rm-embed-widgets',
    title: 'Embeddable mini-trackers',
    description:
      'iframe-able mini-trackers for partner sites (newsrooms, NGOs). Needs a CSP-friendly embed mode and a per-embed analytics signal.',
    status: 'shipped', area: 'growth', priority: 'P3', effort: 'L', milestone: 'done',
    date: '2026-04-26',
    outcome:
      'Live at /embed/{tracker}/',
  },
  {
    id: 'rm-print-view',
    title: 'Print-friendly view',
    description: '@media print styles so analysts can produce briefing PDFs from any tracker.',
    status: 'idea', area: 'ux', priority: 'P3', effort: 'S', milestone: 'later',
    date: '2026-04-26',
  },
  {
    id: 'rm-e2e-tests',
    title: 'E2E smoke tests (Playwright)',
    description:
      '5-10 smoke tests covering page load, timeline expansion, map render, globe load. Catches regressions that unit tests miss.',
    status: 'shipped', area: 'reliability', priority: 'P3', effort: 'M', milestone: 'done',
    prs: [214, 334],
    date: '2026-04-26',
    outcome:
      'Playwright suite running on every PR; the flake it did have was fixed with a measured control rather than a retry',
  },
  {
    id: 'rm-event-partition-scaling',
    title: 'Event partition scaling',
    description:
      'Daily event JSON files grow linearly; ~85+ trackers × daily files will eventually hit Astro\'s ergonomic limits. Plan migration to content collections with pagination before it bites.',
    status: 'idea', area: 'infrastructure', priority: 'P3', effort: 'M', milestone: 'later',
    date: '2026-04-26',
  },

  // ─── Shipped between the last roadmap sync (#135) and 2026-10-18 ─────
  // 204 PRs landed in this window with no roadmap entry. Grouped by the
  // thing they built rather than one row per PR.
  {
    id: 'rm-daily-video',
    title: 'Daily intelligence brief video',
    description:
      'A 30s vertical 1080×1920 brief rendered nightly with Remotion and posted to Telegram and Bluesky: breaking and progress cuts, a canvas globe, per-tracker slides, escalation-ranked selection, and a /videos archive page fed by video/state/daily-log.json. All typography and motion values live in slide-style.ts so Studio preview and production render identically.',
    status: 'shipped', area: 'growth', priority: 'P1', effort: 'XL', milestone: 'done',
    prs: [194, 227, 228, 229, 232, 301], date: '2026-10-18',
    outcome: 'Publishes unattended every night; the archive at /videos/ records items, KPIs, source tiers and run id per day',
  },
  {
    id: 'rm-video-narration',
    title: 'Spoken narration in two languages, news first',
    description:
      'ElevenLabs narration (replacing AWS Polly) mixed under the music in English and Spanish. The script now speaks up to three real headlines from breaking.json and says the brand exactly once, at the end; the earlier version opened with the brand and read tracker names instead of news. A missing API key ships the video silent with a warning rather than failing the render.',
    status: 'shipped', area: 'growth', priority: 'P2', effort: 'M', milestone: 'done',
    prs: [301, 333], date: '2026-10-18',
    outcome: 'Verified in production: 331 characters EN / 324 ES, three headlines, one brand mention at the end',
  },
  {
    id: 'rm-social-command-center',
    title: 'Social Command Center',
    description:
      'AI-curated posting queue with a judge (score, verdict, fact checks against tracker data), a $1/month budget, four daily slots, and a /social/ dashboard for approving or rejecting each entry. One voice and eight data-derived tweet types; hot takes and memes were removed after the April 2026 X suspension. Bluesky and X share one queue through per-platform state.',
    status: 'shipped', area: 'growth', priority: 'P1', effort: 'XL', milestone: 'done',
    prs: [166, 233, 306, 307], date: '2026-10-18',
  },
  {
    id: 'rm-social-proposal-alerts',
    title: 'Approval alerts for the social queue',
    description:
      'Every queue entry waiting on a human is announced once in the private ops chat with its type, tracker, judge score and verdict, the judge comment, a fact-check summary, its slot and a link to /social/. A failed send records nothing, so the next run retries rather than losing the proposal.',
    status: 'shipped', area: 'growth', priority: 'P1', effort: 'S', milestone: 'done',
    prs: [338], date: '2026-10-18',
    outcome: 'Measured before it existed: 0 posts a day reached X while 1-5 proposals a day waited unseen in the queue',
  },
  {
    id: 'rm-light-scan-hardening',
    title: 'Breaking-news scan hardening',
    description:
      'The two-tier scan kept losing work in ways that reported success: the pending queue sat in public/, duplicates slipped past the 0.6 ratio, state stopped committing, scores routed without substance, pushes conflicted, schema slips were discarded wholesale, and an agent out of turns threw away completed data. Each one is now a named fix with a test.',
    status: 'shipped', area: 'reliability', priority: 'P0', effort: 'L', milestone: 'done',
    prs: [154, 155, 211, 213, 215, 296, 319, 321, 323], date: '2026-10-18',
    outcome: 'Hourly Breaking News Scan failure rate 26% → 0 over three days',
  },
  {
    id: 'rm-observability',
    title: 'Credential canary, freshness alarm and alert routing',
    description:
      'A revoked token took seven workflows down for two weeks unnoticed. A daily canary now checks Telegram, Bluesky, Claude OAuth and PostHog liveness; a freshness alarm judges each tracker against its own cadence; and every infrastructure alert goes to the private ops chat, never the public channel, with a guard that refuses when the two ids match.',
    status: 'shipped', area: 'reliability', priority: 'P0', effort: 'M', milestone: 'done',
    prs: [168, 170, 174, 175, 187, 219, 289, 310], date: '2026-10-18',
  },
  {
    id: 'rm-self-hosting',
    title: 'Self-hosting: Docker image, GHCR publish, generated nginx headers',
    description:
      'Multi-stage Dockerfile (node build → nginx serving dist/ as a non-root user), docker-compose with CasaOS metadata, headers-to-nginx.ts so public/_headers is declared once, a smoke test that verifies routes and CORS/CSP headers on the running container, and a generated environment-variable table that CI checks against the code.',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'L', milestone: 'done',
    prs: [270, 279, 280], date: '2026-10-18',
  },
  {
    id: 'rm-live-source-cache',
    title: 'One cache in front of every live feed, with visible status',
    description:
      'A shared TTL cache with in-flight dedupe, stale-on-error (last good data kept and reported as stale or rate-limited), 429 backoff on its own counter and a hard entry cap, plus a live-layer registry whose test fails CI when a feed host is missing from connect-src. Every globe and map hook exposes status, updatedAt and error, and source status chips surface degraded layers to the reader.',
    status: 'shipped', area: 'reliability', priority: 'P1', effort: 'L', milestone: 'done',
    prs: [268, 271, 272], date: '2026-10-18',
    outcome: 'A hook that swallows a failure is now a bug with a name: docs/silent-failure-patterns.md',
  },
  {
    id: 'rm-place-dossier',
    title: 'Place dossier on right-click',
    description:
      'Right-click or long-press anywhere on the globe, the 2D map or the homepage globe composes a dossier from Nominatim reverse geocoding, Wikidata country facts, a Wikipedia summary, the trackers covering that country and the events near the point. Every provider failure is isolated and named in a degraded list instead of hiding the panel.',
    status: 'shipped', area: 'ux', priority: 'P1', effort: 'XL', milestone: 'done',
    prs: [273], date: '2026-10-18',
  },
  {
    id: 'rm-geo-layers',
    title: 'Provenance-stamped geo layers',
    description:
      'DeepStateMAP frontlines (licence-gated), GDACS disaster alerts that also enter the pipeline as geo-tagged candidates, and curated static GeoJSON for nuclear plants, submarine cables and chokepoints — each with a provenance record and a licence file. Trackers opt in per layer; /sources/ lists everything from the registries.',
    status: 'shipped', area: 'content', priority: 'P1', effort: 'L', milestone: 'done',
    prs: [274], date: '2026-10-18',
  },
  {
    id: 'rm-gazetteer',
    title: 'Gazetteer geoparsing for scan candidates',
    description:
      'Every map-point label, tracker centre and country alias becomes a gazetteer entry (~5.4k) rebuilt at the start of each light scan. Candidate titles are geoparsed longest-match-first with stopword, common-word and non-place lists, so alerts carry coordinates and the homepage globe can show unverified candidates as dotted pins that disappear once a real event cites the same URL.',
    status: 'shipped', area: 'content', priority: 'P2', effort: 'L', milestone: 'done',
    prs: [276], date: '2026-10-18',
  },
  {
    id: 'rm-activity-index',
    title: 'Activity index with declared weights',
    description:
      'A 0-100 activity score per tracker computed from real data — events in the window, breaking flag, digest freshness, sections updated, KPI deltas, mean source tier — where every factor reports its value and contribution so a badge can say why. Live trackers use a 7-day window, historical ones twice their update interval. Consumed by the homepage, the sidebar sort, the public API, the MCP server and the video scorer.',
    status: 'shipped', area: 'ux', priority: 'P2', effort: 'L', milestone: 'done',
    prs: [277], date: '2026-10-18',
  },
  {
    id: 'rm-provenance-honesty',
    title: 'Provenance badges, degraded sources and thumbnail fingerprints',
    description:
      'Digests and tracker meta carry a provenance record (AI with model and date, editorial, or "no provenance recorded" — shown, never hidden). A collapsed block under the KPI strip lists live layers that are stale or erroring and digest gaps of three days or more. Media thumbnails carry a hash, ETag and length, and a nightly probe marks a changed one suspect so every surface degrades to the next fallback instead of pairing a confident caption with a photo nobody has seen.',
    status: 'shipped', area: 'reliability', priority: 'P1', effort: 'L', milestone: 'done',
    prs: [275], date: '2026-10-18',
  },
  {
    id: 'rm-radio-layers',
    title: 'Radio towers and stations, click to listen',
    description:
      'Transmitter and station layers for 22 conflict trackers plus a worldwide homepage layer, with per-country refresh, bounded and visible staleness, SVG icons and a visible failure state rather than an empty map.',
    status: 'shipped', area: 'content', priority: 'P2', effort: 'L', milestone: 'done',
    prs: [287, 290, 291, 293], date: '2026-10-18',
  },
  {
    id: 'rm-interests-relevance',
    title: 'Declared interests and relevance ranking',
    description:
      'Visitors declare domain and region interests that boost homepage relevance below an explicit follow, with an interests band in the sidebar, a one-time nudge for visitors who have set none, and a documented ranking design. Relevance is explicitly not freshness: activity and breaking outweigh recency, pinned by a unit test.',
    status: 'shipped', area: 'ux', priority: 'P2', effort: 'L', milestone: 'done',
    prs: [292, 294, 308], date: '2026-10-18',
  },
  {
    id: 'rm-i18n',
    title: 'Spanish, French and Portuguese locales',
    description:
      'Locale roots, translated UI strings and locale-aware freshness copy across the site, after a pass that restored twelve stripped diacritics and fixed locale roots that returned 404 while the homepage advertised 48 trackers it could not reach.',
    status: 'shipped', area: 'growth', priority: 'P2', effort: 'L', milestone: 'done',
    prs: [217, 245], date: '2026-10-18',
  },
  {
    id: 'rm-scout-lifecycle',
    title: 'Tracker scout and lifecycle',
    description:
      'A weekly scout proposes new trackers as labelled issues, deduped by the event and by what existing trackers actually cover rather than by slug, with a 60-day closure that keeps the backlog bounded and fails loudly if it cannot close. Labels are created rather than silently dropped, and the turn budget and structured output were fixed after the issue-creation step failed at runtime.',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'L', milestone: 'done',
    prs: [165, 176, 202, 225, 320, 332, 339], date: '2026-10-18',
    outcome: 'Backlog arrival ~2/week against a 60-66 day lifetime, so it settles near 15-20 open instead of growing',
  },
  {
    id: 'rm-self-review',
    title: 'Weekly self-review with a retirement path',
    description:
      'One dimension per week by rotation, each traceable to a real defect in this repo, filing at most a few verified findings as issues and retiring findings whose cited file is gone before it analyses anything. Zero findings is a valid result. The first dry run proved the step could never authenticate and the job still reported success.',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'M', milestone: 'done',
    prs: [330, 335], date: '2026-10-18',
  },
  {
    id: 'rm-type-ratchet',
    title: 'Type-check gate as a ratchet',
    description:
      'npm run build never type-checked and astro check runs out of memory on this project, so nothing in CI had ever looked at the types while CLAUDE.md claimed otherwise. tsc now runs in the Tests workflow against a baseline of the 56 pre-existing errors and fails on anything new; the count can shrink and never grow.',
    status: 'shipped', area: 'infrastructure', priority: 'P1', effort: 'M', milestone: 'done',
    prs: [337], date: '2026-10-18',
    outcome: 'Caught a real latent error on its first three runs: JSX.Element resolving only on machines where another dependency declared it',
  },
  {
    id: 'rm-secrets-runbook',
    title: 'Secrets and variables runbook',
    description:
      'Every secret and repository variable the workflows read, what breaks without each one, which are configured, and the rule that a missing secret is an empty string rather than an error — so a step goes green having done nothing. Written after discovering all eight repository variables were unset, which is why several features looked broken.',
    status: 'shipped', area: 'infrastructure', priority: 'P1', effort: 'S', milestone: 'done',
    prs: [327], date: '2026-10-18',
  },
  {
    id: 'rm-model-single-source',
    title: 'One place decides the model',
    description:
      'The model id had drifted across seven call sites, including a generation-old pin in the workflow with the worst failure history. A single variable with a current default now decides, overridable without a commit.',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'S', milestone: 'done',
    prs: [324], date: '2026-10-18',
  },
  {
    id: 'rm-metrics-dashboard',
    title: 'Ingestion metrics dashboard',
    description:
      'Per-run JSON written by the nightly finalize phase and served as static assets, with a status page showing an uptime calendar, per-tracker health, an expandable run log and an error trend. Fetched at runtime so metrics from runs after the last deploy are still visible.',
    status: 'shipped', area: 'reliability', priority: 'P1', effort: 'M', milestone: 'done',
    date: '2026-10-18',
    outcome: 'Live at /metrics/ — src/components/islands/MetricsDashboard.tsx, public/_metrics/',
  },
  {
    id: 'rm-vote-page',
    title: 'Community vote on the tracker backlog',
    description:
      'Tier 2-4 backlog candidates with a pre-filled GitHub issue per candidate, a nightly tally that counts unique accounts across the author, reactions and +1 comments, and a graduation issue opened when a candidate first crosses the threshold.',
    status: 'shipped', area: 'growth', priority: 'P2', effort: 'M', milestone: 'done',
    date: '2026-10-18',
    outcome: 'Live at /vote/ — src/pages/vote.astro, .github/workflows/tally-tracker-votes.yml',
  },
  {
    id: 'rm-agent-surfaces',
    title: 'Machine-readable surfaces for agents',
    description:
      'A public JSON API, an MCP server, a /skill page describing how an agent should use the site, a feed index in HTML, JSON and OPML discovered automatically from each endpoint, and embeddable per-tracker pages.',
    status: 'shipped', area: 'growth', priority: 'P2', effort: 'L', milestone: 'done',
    date: '2026-10-18',
    outcome: 'Live at /api/, /skill/, /feeds/, /feeds.json, /feeds.opml and /embed/{tracker}/',
  },

  // ─── Now: in flight, or waiting on one decision or credential ────────
  {
    id: 'rm-x-restart',
    title: 'Restart X posting behind human approval',
    description:
      'X_POSTING_ENABLED is now true and the poster runs, but it sends only entries a human approved in /social/ and X_ALLOW_AUTO_APPROVED stays unset deliberately — the account was suspended once for inauthentic behaviour. The loop is complete as of the approval alerts; what remains is a week of approving real entries and deciding whether the output reads well enough to widen the gate.',
    status: 'in-progress', area: 'growth', priority: 'P1', effort: 'S', milestone: 'now',
    prs: [226, 306, 338], date: '2026-10-18', dependsOn: ['rm-social-proposal-alerts'],
  },
  {
    id: 'rm-video-publishing',
    title: 'Automate the remaining video destinations',
    description:
      'Instagram Reels and the Facebook Page adapters are written and tested with injectable fetch, and the public MP4 URL they need is already produced as a rolling release asset. YouTube Shorts is written too. All three are dormant until their credentials exist: META_PAGE_ACCESS_TOKEN plus two page ids, and three YouTube OAuth secrets (an API key cannot upload).',
    status: 'in-progress', area: 'growth', priority: 'P1', effort: 'M', milestone: 'now',
    prs: [306, 325], date: '2026-10-18',
    outcome: 'Blocked on credentials only — no code remains to write',
  },

  // ─── Next: committed, not started ───────────────────────────────────
  {
    id: 'rm-astro-7',
    title: 'Decide the astro 5 → 7 migration',
    description:
      'The audit reads alarming and almost nothing is reachable: the server-island advisory needs SSR (this is static output with no deferred islands), and the sharp/libvips advisories are about decoding untrusted input, and the only image sharp receives here is a texture checked into the repo (it is imported directly by the OG endpoint, not through Astro\'s image service, which this project never invokes). The one reachable path — tracker names reaching an inline script through define:vars — was closed separately. What remains is cost: the e2e suite never finished in 50 minutes against astro 7 even with the Vite fix, and nested zod 4 adds about fifteen type errors that the new gate would now reject.',
    status: 'planned', area: 'infrastructure', priority: 'P2', effort: 'L', milestone: 'next',
    date: '2026-10-18', dependsOn: ['rm-type-ratchet'],
    outcome: 'Cheapest next step: run the dev server locally against astro 7 and time one page load, rather than paying for another 50-minute CI run',
  },
  {
    id: 'rm-type-debt',
    title: 'Ratchet the type baseline down',
    description:
      'Of the 56 baselined errors, 6 are one BufferSource cast in the push worker, 4 are translation keys, 4 are a geo-layer hook and 6 more are single errors in six files. Cheapest first, each PR lowering the baseline.',
    status: 'planned', area: 'infrastructure', priority: 'P2', effort: 'M', milestone: 'next',
    date: '2026-10-18', dependsOn: ['rm-type-ratchet'],
    outcome: 'Target: 56 → about 36 without touching the legacy updater',
  },
  {
    id: 'rm-legacy-updater',
    title: 'Repair or delete the legacy data updater',
    description:
      'scripts/update-data.ts holds 14 of the 56 baselined type errors and is the pre-workflow updater that runs on direct API keys. No workflow uses it. Either it is a supported path and gets typed, or it is dead weight and goes.',
    status: 'planned', area: 'infrastructure', priority: 'P2', effort: 'S', milestone: 'next',
    date: '2026-10-18',
  },
  {
    id: 'rm-hook-vs-brief',
    title: 'Decide whether the hook-first cut replaces the daily brief',
    description:
      'Both compositions render in Studio: 23s logo → three trackers → outro, against 18s headline hook → lead → two secondary → on-screen CTA. Part of the original argument was that opening on branding wastes the only moment that decides whether anyone watches, and the narration change already fixed that in the audio. What remains is a visual and structural comparison.',
    status: 'planned', area: 'growth', priority: 'P2', effort: 'S', milestone: 'next',
    prs: [228, 229], date: '2026-10-18', dependsOn: ['rm-video-narration'],
  },
  {
    id: 'rm-spanish-narration',
    title: 'Spanish narration reads English headlines',
    description:
      'The Spanish track speaks the English headlines with a Spanish closing line. It always did for the lead headline; it is three times as audible now that three are spoken. breaking.json carries no localised headline, so fixing it means translating about six headlines a day at render time.',
    status: 'planned', area: 'growth', priority: 'P2', effort: 'S', milestone: 'next',
    date: '2026-10-18', dependsOn: ['rm-video-narration'],
  },
  {
    id: 'rm-alerts-panel-flake',
    title: 'Investigate the alerts-panel e2e flake',
    description:
      'alerts-panel.spec.ts showed a failure in one run and passed on retry, and was never investigated. The dossier flake next to it turned out to be broadcast mode flying the camera mid-click, found only by running a control three times with and without the fix.',
    status: 'planned', area: 'reliability', priority: 'P2', effort: 'S', milestone: 'next',
    date: '2026-10-18',
  },
  {
    id: 'rm-cloudflare-token',
    title: 'Wire or revoke CLOUDFLARE_API_TOKEN',
    description:
      'The secret has been set since April and is read by zero workflows; its only mention is a plan document, the worker-deploy workflow does not exist and the account id was never set. Either it belongs to the Pages migration or it should be revoked.',
    status: 'planned', area: 'infrastructure', priority: 'P2', effort: 'XS', milestone: 'next',
    date: '2026-10-18', dependsOn: ['rm-cloudflare-pages'],
  },

  {
    id: 'rm-pr-build-gate',
    title: 'Gate the production build on pull requests',
    description:
      'No check on a pull request builds the site. The Playwright suite runs against `npm run dev`, vitest does not build, and the type ratchet type-checks without emitting — so the first real build of a change happens in the deploy workflow after it is already on main, where a failure stops the site updating rather than stopping the merge. A build job behind a path filter (src/, astro.config.mjs, package.json) is the cheap version; the full build is slow enough that running it on every PR is a real cost worth naming.',
    status: 'planned', area: 'reliability', priority: 'P1', effort: 'S', milestone: 'next',
    date: '2026-10-18',
    outcome:
      'Found while verifying a src/ change had no build gate on its own PR. Measured cost: the deploy workflow\'s build takes 17-32 min on CI, so this is a real bill per PR and the path filter is the whole design — the counter-argument is that deploy.yml already fails loudly within minutes and the site keeps serving the last good deploy',
  },

  // ─── Later: captured, no commitment ─────────────────────────────────
  {
    id: 'rm-triage-archive-may',
    title: 'Publish the May triage archive, or leave it in git',
    description:
      'The audit page offers each weekly triage archive the light scan finds on disk, and the three May 2026 weeks exist only as local files: 9,426 entries, 4,525 unique, 7 MB. Committing them would add May 7-21 to the public audit page permanently; the same entries are already recoverable from the triage log as it stood in git. There is no history at all between 1 June and 16 August, because none was recorded.',
    status: 'idea', area: 'growth', priority: 'P3', effort: 'XS', milestone: 'later',
    date: '2026-10-18',
    outcome: 'Recoverable with: git show f654050be:public/_hourly/triage-log.json',
  },
];

/** Convenience selectors for the page. */
export function itemsByStatus(status: RoadmapStatus): RoadmapItem[] {
  return ROADMAP_ITEMS.filter((i) => i.status === status);
}
export function itemsByMilestone(milestone: RoadmapMilestone): RoadmapItem[] {
  return ROADMAP_ITEMS.filter((i) => i.milestone === milestone);
}
export function counts() {
  return {
    shipped: ROADMAP_ITEMS.filter((i) => i.status === 'shipped').length,
    inProgress: ROADMAP_ITEMS.filter((i) => i.status === 'in-progress').length,
    planned: ROADMAP_ITEMS.filter((i) => i.status === 'planned').length,
    idea: ROADMAP_ITEMS.filter((i) => i.status === 'idea').length,
    total: ROADMAP_ITEMS.length,
  };
}
