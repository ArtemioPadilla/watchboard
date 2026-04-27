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
export type RoadmapMilestone = 'M1' | 'M2' | 'M3' | 'M4' | 'future';

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
  M1: { label: 'M1 — April 2026', window: 'shipped', theme: 'Onboarding + perf foundations' },
  M2: { label: 'M2 — May 2026',   window: 'next',    theme: 'Real-user perf + growth' },
  M3: { label: 'M3 — June 2026',  window: 'planning',theme: 'Search + retention' },
  M4: { label: 'M4 — Q3 2026',    window: 'horizon', theme: 'A11y + content depth' },
  future: { label: 'Future',      window: 'horizon', theme: 'Ideas with no commitment' },
};

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
    status: 'shipped', area: 'ux', priority: 'P1', effort: 'L', milestone: 'M1',
    prs: [122], date: '2026-04-25',
    outcome: 'New visitors learn the navigation surfaces and source-tier system without leaving the homepage',
  },
  {
    id: 'rm-defer-cesium',
    title: 'Defer Cesium parse past LCP',
    description:
      'Wrap the lazy GlobePanel import in a deferImport helper that yields to requestIdleCallback so Cesium\'s ~5s of CPU on mobile no longer competes with the homepage paint and React hydration.',
    status: 'shipped', area: 'performance', priority: 'P1', effort: 'S', milestone: 'M1',
    prs: [123], date: '2026-04-26',
    outcome: 'vendor-globe long-task: 5018 ms → 178 ms (verified post-deploy)',
  },
  {
    id: 'rm-ssr-mobile-carousel',
    title: 'SSR mobile story carousel',
    description:
      'Render MobileStoryCarousel unconditionally so the LCP-critical text exists in the initial HTML; control visibility purely via CSS @media. Adds cc-mobile-tab-{live|trackers} root class to also CSS-drive the mobile sidebar (no pre-hydration flash).',
    status: 'shipped', area: 'performance', priority: 'P1', effort: 'M', milestone: 'M1',
    prs: [124, 126], date: '2026-04-26',
    outcome: 'LCP-critical p.story-briefing-text element exists at first paint on mobile',
  },
  {
    id: 'rm-web-vitals',
    title: 'PostHog Web Vitals capture',
    description:
      'Enable capture_performance: { web_vitals: true } so we collect real-user LCP / INP / CLS / FCP / TTFB samples and stop relying on noisy synthetic Lighthouse runs.',
    status: 'shipped', area: 'analytics', priority: 'P1', effort: 'XS', milestone: 'M1',
    prs: [125], date: '2026-04-26',
    outcome: 'Real-user perf samples flowing into PostHog → Insights → Web Vitals',
  },
  {
    id: 'rm-globe-double-spin',
    title: 'Fix globe double-spin on tracker click',
    description:
      'handleSelect was triggering two camera flights — broadcast.jumpTo() then GlobePanel\'s activeTracker useEffect. Skip the latter when broadcastMode is on.',
    status: 'shipped', area: 'ux', priority: 'P2', effort: 'XS', milestone: 'M1',
    prs: [127], date: '2026-04-26',
  },
  {
    id: 'rm-docs-sync',
    title: 'Documentation sync',
    description:
      'Update CLAUDE.md, CHANGELOG.md, BACKLOG.md, posthog-setup.md to reflect the April 26 batch (onboarding, defer Cesium, SSR carousel, Web Vitals, hydration fix, globe spin fix) and register the deferred perf levers as BL-025/026/027.',
    status: 'shipped', area: 'infrastructure', priority: 'P2', effort: 'XS', milestone: 'M1',
    prs: [128], date: '2026-04-26',
  },

  // ─── M2 — May 2026: Real-user perf + growth ─────────────────────────
  {
    id: 'rm-cloudflare-pages',
    title: 'Migrate from GitHub Pages to Cloudflare Pages',
    description:
      'GH Pages TTFB is 1.8-2.5s; Cloudflare Pages typically 200-400ms + automatic Brotli compression + better LATAM/EU edge presence. No code changes, only DNS swap. Highest ROI/hour of the remaining perf levers.',
    status: 'planned', area: 'infrastructure', priority: 'P0', effort: 'S', milestone: 'M2',
    date: '2026-04-26', dependsOn: ['rm-web-vitals'],
    outcome: 'Target: -1 to -2 seconds TTFB',
  },
  {
    id: 'rm-cut-html-payload',
    title: 'Cut homepage HTML payload',
    description:
      'serializedTrackers passes all 95 trackers\' headlines, KPIs, eventImages, digestSummary in initial HTML (~157 KB). Lazy-load detail fields per tracker; keep only what\'s needed for first paint.',
    status: 'planned', area: 'performance', priority: 'P1', effort: 'M', milestone: 'M2',
    date: '2026-04-26', dependsOn: ['rm-cloudflare-pages'],
    outcome: 'Estimate: HTML 157 KB → ~40 KB, -500-800 ms LCP',
  },
  {
    id: 'rm-og-meta-tags',
    title: 'OG meta tags / social sharing',
    description:
      'Twitter/X card previews + Open Graph tags per tracker so shared links render with hero image, headline, and tier-color accent. Highest effort-to-impact for organic reach.',
    status: 'planned', area: 'growth', priority: 'P1', effort: 'S', milestone: 'M2',
    date: '2026-04-26',
  },
  {
    id: 'rm-globe-cta',
    title: 'Globe discoverability CTA',
    description:
      'A "View 3D Globe" prompt in the hero or header — the showpiece feature is invisible from the main entry. Trivial effort, high visibility.',
    status: 'planned', area: 'ux', priority: 'P1', effort: 'XS', milestone: 'M2',
    date: '2026-04-26',
  },
  {
    id: 'rm-error-boundaries',
    title: 'React error boundaries on all islands',
    description:
      'Wrap each island (CommandCenter, IntelMap, CesiumGlobe, MetricsDashboard, etc.) with a fallback UI. WebGL/Cesium failures currently render a white screen.',
    status: 'planned', area: 'reliability', priority: 'P1', effort: 'S', milestone: 'M2',
    date: '2026-04-26',
  },
  {
    id: 'rm-data-freshness',
    title: 'Per-section "last updated" indicators',
    description:
      'Visible per-section timestamps so readers can judge data recency at a glance. Spec exists from earlier and was never shipped.',
    status: 'planned', area: 'ux', priority: 'P0', effort: 'S', milestone: 'M2',
    date: '2026-04-26',
  },

  // ─── M3 — June 2026: Search + retention ─────────────────────────────
  {
    id: 'rm-search-filter',
    title: 'Cross-tracker search & filter',
    description:
      'Keyword search + filter chips (weapon type, region, date range) over events and timelines. Build a search index at build time. Requires cross-island state; needs an architecture decision on nanostores before coding.',
    status: 'planned', area: 'ux', priority: 'P1', effort: 'XL', milestone: 'M3',
    date: '2026-04-26', dependsOn: ['rm-data-freshness'],
  },
  {
    id: 'rm-what-changed-today',
    title: '"What changed today" view',
    description:
      'Diff/changelog view for returning users showing what updated since their last visit. Uses daily event partitions + localStorage last-visit timestamp. Primary retention driver for a live tracker.',
    status: 'planned', area: 'growth', priority: 'P1', effort: 'M', milestone: 'M3',
    date: '2026-04-26',
  },
  {
    id: 'rm-shareable-deeplinks',
    title: 'Shareable deep links',
    description:
      'URL parameters for date / event / view state so a link to a specific event in a specific tracker reopens with that exact view. Depends on the cross-island state shipped with rm-search-filter.',
    status: 'planned', area: 'growth', priority: 'P2', effort: 'M', milestone: 'M3',
    date: '2026-04-26', dependsOn: ['rm-search-filter'],
  },
  {
    id: 'rm-tree-shake-cesium',
    title: 'Tree-shake Cesium bundle',
    description:
      'Migrate from monolithic cesium import to @cesium/engine + @cesium/widgets modular packages. Should drop bundle from 4.3 MB → ~1.5-2 MB and mobile parse from 5s → ~2s.',
    status: 'planned', area: 'performance', priority: 'P2', effort: 'L', milestone: 'M3',
    date: '2026-04-26', dependsOn: ['rm-cut-html-payload', 'rm-cloudflare-pages'],
  },
  {
    id: 'rm-zod-ci-validation',
    title: 'Zod validation in CI workflow',
    description:
      'Nightly update workflow only runs JSON.parse(), not Zod schema checks. Schema-valid-but-corrupt data can break the build. Run Zod validation inside the update script before writing to disk.',
    status: 'planned', area: 'reliability', priority: 'P0', effort: 'S', milestone: 'M3',
    date: '2026-04-26',
  },
  {
    id: 'rm-build-fail-alerts',
    title: 'Build / nightly failure alerting',
    description:
      'Notify the maintainer when the nightly update or deploy fails so the site does not silently serve stale data for days.',
    status: 'planned', area: 'reliability', priority: 'P0', effort: 'S', milestone: 'M3',
    date: '2026-04-26',
  },
  {
    id: 'rm-csp',
    title: 'Content Security Policy',
    description:
      'CSP meta tag allowlisting Cesium Ion, Carto, OpenSky, USGS, Open-Meteo, PostHog, Cloudflare. Defense in depth for AI-generated content.',
    status: 'planned', area: 'reliability', priority: 'P2', effort: 'S', milestone: 'M3',
    date: '2026-04-26',
  },

  // ─── M4 — Q3 2026: Accessibility + content depth ─────────────────────
  {
    id: 'rm-a11y-audit',
    title: 'Accessibility audit (WCAG 2.1 AA)',
    description:
      'Keyboard navigation on maps, ARIA attributes, screen reader support across timelines, military tabs, and the globe. Spec must define which components get full a11y vs text alternatives (Cesium has limits).',
    status: 'planned', area: 'accessibility', priority: 'P1', effort: 'L', milestone: 'M4',
    date: '2026-04-26',
  },
  {
    id: 'rm-india-china-russia',
    title: 'Country trackers — India / China / Russia / Iran / Turkey / Saudi',
    description:
      'Tier 1 country trackers from tracker-roadmap.md. Each ships with full historical eras (e.g. Achaemenid Empire → Pezeshkian for Iran), maps, KPIs, claims, and political grids.',
    status: 'in-progress', area: 'content', priority: 'P0', effort: 'XL', milestone: 'M4',
    date: '2026-04-26',
  },
  {
    id: 'rm-data-export',
    title: 'Data export (CSV / JSON)',
    description:
      'Per-section download buttons (military, casualties, econ). Must escape formula-injection chars for safe Excel imports.',
    status: 'planned', area: 'growth', priority: 'P2', effort: 'S', milestone: 'M4',
    date: '2026-04-26',
  },
  {
    id: 'rm-bundle-analysis',
    title: 'Bundle analysis + Lighthouse CI budget',
    description:
      'Add rollup-plugin-visualizer + a Lighthouse CI budget so future PRs that bloat the bundle are caught before merge.',
    status: 'planned', area: 'infrastructure', priority: 'P2', effort: 'S', milestone: 'M4',
    date: '2026-04-26',
  },
  {
    id: 'rm-rss-feed-improvement',
    title: 'Per-tracker RSS / Atom feed redesign',
    description:
      'Per-tracker /feed.xml via @astrojs/rss with proper XML encoding for AI-generated content. Existing feeds work but lack rich item bodies.',
    status: 'planned', area: 'growth', priority: 'P2', effort: 'S', milestone: 'M4',
    date: '2026-04-26',
  },

  // ─── Future: Ideas with no commitment ───────────────────────────────
  {
    id: 'rm-compare-page',
    title: '/compare page — side-by-side trackers',
    description:
      'Side-by-side 2–3 tracker view (e.g. AMLO vs Sheinbaum, AR vs CL economy) for analysts who want to contrast.',
    status: 'idea', area: 'ux', priority: 'P3', effort: 'M', milestone: 'future',
    date: '2026-04-26',
  },
  {
    id: 'rm-on-this-day',
    title: '"On This Day" historical view',
    description:
      'Daily chronological view across the 1300+ events embedded in tracker timelines.',
    status: 'idea', area: 'content', priority: 'P3', effort: 'M', milestone: 'future',
    date: '2026-04-26',
  },
  {
    id: 'rm-migration-corridors',
    title: 'Migration corridors globe layer',
    description:
      'Visual layer connecting linked trackers (VE → CO → PE → CL, NCA → MX → US). Dataviz for a story Watchboard is uniquely positioned to tell.',
    status: 'idea', area: 'content', priority: 'P3', effort: 'M', milestone: 'future',
    date: '2026-04-26',
  },
  {
    id: 'rm-tracker-subscriptions',
    title: 'Per-tracker email / Telegram subscriptions',
    description:
      'Subscribe to a specific tracker and receive a digest when it updates. Bsky / Telegram dispatch already exist as backend; needs subscriber UI + per-user routing.',
    status: 'idea', area: 'growth', priority: 'P3', effort: 'M', milestone: 'future',
    date: '2026-04-26',
  },
  {
    id: 'rm-embed-widgets',
    title: 'Embeddable mini-trackers',
    description:
      'iframe-able mini-trackers for partner sites (newsrooms, NGOs). Needs a CSP-friendly embed mode and a per-embed analytics signal.',
    status: 'idea', area: 'growth', priority: 'P3', effort: 'L', milestone: 'future',
    date: '2026-04-26',
  },
  {
    id: 'rm-print-view',
    title: 'Print-friendly view',
    description: '@media print styles so analysts can produce briefing PDFs from any tracker.',
    status: 'idea', area: 'ux', priority: 'P3', effort: 'S', milestone: 'future',
    date: '2026-04-26',
  },
  {
    id: 'rm-e2e-tests',
    title: 'E2E smoke tests (Playwright)',
    description:
      '5-10 smoke tests covering page load, timeline expansion, map render, globe load. Catches regressions that unit tests miss.',
    status: 'idea', area: 'reliability', priority: 'P3', effort: 'M', milestone: 'future',
    date: '2026-04-26',
  },
  {
    id: 'rm-event-partition-scaling',
    title: 'Event partition scaling',
    description:
      'Daily event JSON files grow linearly; ~85+ trackers × daily files will eventually hit Astro\'s ergonomic limits. Plan migration to content collections with pagination before it bites.',
    status: 'idea', area: 'infrastructure', priority: 'P3', effort: 'M', milestone: 'future',
    date: '2026-04-26',
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
