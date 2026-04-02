---
title: User Analytics — Cloudflare Web Analytics + PostHog
date: 2026-04-01
status: draft
---

# User Analytics Design

## Overview

Add user analytics to Watchboard using a two-layer approach:

1. **Cloudflare Web Analytics** — cookieless, privacy-first baseline (page views, uniques, referrers, countries, Core Web Vitals)
2. **PostHog Cloud** — full behavioral analytics (session recordings, heatmaps, funnels, retention, autocapture)

Anonymous-only. No consent banner needed. No new pages or components.

## Tools & Rationale

| Layer | Tool | Purpose | Cost |
|-------|------|---------|------|
| Baseline | Cloudflare Web Analytics | Cookieless page views, uniques, referrers, countries, Web Vitals | Free |
| Behavioral | PostHog Cloud | Session recordings, heatmaps, funnels, retention, autocapture | Free (1M events/mo, 5K recordings/mo) |

**Why two layers:** Cloudflare provides a clean, cookieless signal that works even if PostHog is blocked by ad blockers. PostHog provides the deep behavioral data. They complement each other.

## Script Integration

Both scripts go in `src/layouts/BaseLayout.astro` `<head>`.

### Cloudflare Web Analytics

Hardcoded token (public client-side key):

```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "e1a664e3c0b34e03b06b74bb10f199f5"}'></script>
```

Always loaded. No env var gating.

### PostHog

Gated by `PUBLIC_POSTHOG_KEY` env var — does not render when the var is absent (local dev runs tracking-free):

```html
{import.meta.env.PUBLIC_POSTHOG_KEY && (
  <script define:vars={{ posthogKey: import.meta.env.PUBLIC_POSTHOG_KEY, posthogHost: import.meta.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com' }}>
    // PostHog snippet with:
    //   person_profiles: 'identified_only'
    //   autocapture: true
    //   capture_pageview: true
    //   capture_pageleave: true
  </script>
)}
```

## Custom Events

PostHog autocapture handles generic clicks and page views. These domain-specific events are tracked explicitly via `posthog.capture()`:

| Event | Where | Properties |
|-------|-------|------------|
| `tracker_viewed` | `src/pages/[tracker]/index.astro` | `tracker_slug` |
| `globe_opened` | `src/pages/[tracker]/globe.astro` | `tracker_slug` |
| `map_filter_toggled` | `src/components/islands/IntelMap.tsx` | `tracker_slug`, `category` |
| `timeline_event_expanded` | `src/components/islands/TimelineSection.tsx` | `tracker_slug`, `event_id` |
| `military_tab_switched` | `src/components/islands/MilitaryTabs.tsx` | `tracker_slug`, `tab_id` |
| `broadcast_mode_toggled` | `src/components/islands/BroadcastOverlay.tsx` | `enabled` (boolean) |
| `search_performed` | `src/pages/search.astro` | `query_length` (NOT query text) |
| `tracker_card_clicked` | `src/pages/index.astro` | `tracker_slug` |

## New File

### `src/lib/analytics.ts`

Thin wrapper that no-ops if PostHog isn't loaded:

```typescript
export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(name, props);
  }
}
```

Single import point for all islands. Keeps PostHog coupling in one place.

## Modified Files

| File | Change |
|------|--------|
| `src/layouts/BaseLayout.astro` | Add CF + PostHog script tags in `<head>` |
| `src/lib/analytics.ts` | New — `trackEvent()` wrapper |
| `src/components/islands/TimelineSection.tsx` | Add `trackEvent('timeline_event_expanded', ...)` in click handler |
| `src/components/islands/IntelMap.tsx` | Add `trackEvent('map_filter_toggled', ...)` in filter toggle |
| `src/components/islands/MilitaryTabs.tsx` | Add `trackEvent('military_tab_switched', ...)` in tab handler |
| `src/components/islands/BroadcastOverlay.tsx` | Add `trackEvent('broadcast_mode_toggled', ...)` |
| `src/pages/[tracker]/index.astro` | Add `tracker_viewed` inline script |
| `src/pages/[tracker]/globe.astro` | Add `globe_opened` inline script |
| `src/pages/search.astro` | Add `search_performed` capture |
| `src/pages/index.astro` | Add `tracker_card_clicked` capture |

## Environment Variables

| Variable | Required | Where | Purpose |
|----------|----------|-------|---------|
| `PUBLIC_POSTHOG_KEY` | For PostHog | GitHub repo env vars | PostHog project API key |
| `PUBLIC_POSTHOG_HOST` | No (defaults to `https://us.i.posthog.com`) | GitHub repo env vars | PostHog API host |

CF token is hardcoded (public, client-side).

## Privacy

- **Cloudflare Web Analytics**: Cookieless, no PII, GDPR-compliant by design
- **PostHog**: `person_profiles: 'identified_only'` — anonymous users don't create person profiles. No cookies in anonymous mode. No PII collected.
- **No consent banner needed** for the anonymous-only configuration
- **Search queries are NOT tracked** — only query length, to protect user privacy
- **Future**: If user identification is added later (e.g., newsletter signup calling `posthog.identify()`), a consent banner will be required at that point

## External Setup (Manual, One-Time)

1. **Cloudflare Web Analytics** — already enabled, token: `e1a664e3c0b34e03b06b74bb10f199f5`
2. **PostHog Cloud** — sign up at posthog.com, create project, copy API key
3. **GitHub** — add `PUBLIC_POSTHOG_KEY` as repository environment variable

## Deployment

No changes to `.github/workflows/deploy.yml`. Astro picks up `PUBLIC_*` env vars via Vite at build time. The CF script loads unconditionally; PostHog renders only when the env var is present.

## What This Does NOT Include

- No consent banner (not needed for anonymous-only)
- No privacy policy page (can be added later if needed)
- No identified user profiles
- No server-side analytics
- No custom PostHog dashboards (use PostHog's built-in UI)
