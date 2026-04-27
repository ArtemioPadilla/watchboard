# PostHog Configuration Checklist

## 1. Verify Events Are Flowing

- [ ] Visit [watchboard.dev](https://watchboard.dev) and click through 2-3 tracker pages
- [ ] Open PostHog dashboard → Activity → confirm events appear (may take 1-2 min)
- [ ] Verify `$pageview`, `$pageleave`, and `$autocapture` events are coming in
- [ ] Verify custom events: `tracker_viewed`, `globe_opened`, `map_filter_toggled`, `timeline_event_expanded`, `military_tab_switched`, `broadcast_mode_toggled`, `search_performed`
- [ ] Check that `tracker_slug` appears as a property on custom events (set via `posthog.register()`)

## 2. Enable Session Recordings

- [ ] Go to PostHog → Project Settings → Session Replay
- [ ] Enable session recording
- [ ] Set sampling rate (100% for low traffic, reduce later if needed)
- [ ] Optionally enable console log capture and network request capture
- [ ] Watch a recording to confirm it captures user interactions

## 3. Enable Heatmaps

- [ ] Go to PostHog → Heatmaps (toolbar)
- [ ] Enable the PostHog toolbar on your domain
- [ ] View click heatmaps on key pages: homepage, tracker dashboard, globe

## 4. Create Dashboards

### Overview Dashboard

- [ ] Create dashboard: "Watchboard — Overview"
- [ ] Add insight: **Unique visitors** (daily/weekly/monthly trend)
- [ ] Add insight: **Page views** (daily trend)
- [ ] Add insight: **Top pages** (breakdown by `$current_url`)
- [ ] Add insight: **Top trackers** (breakdown by `tracker_slug` on `tracker_viewed`)
- [ ] Add insight: **Traffic sources** (breakdown by `$referring_domain`)
- [ ] Add insight: **Countries** (breakdown by `$geoip_country_name`)
- [ ] Add insight: **Devices** (breakdown by `$device_type`: desktop/mobile/tablet)

### Engagement Dashboard

- [ ] Create dashboard: "Watchboard — Engagement"
- [ ] Add insight: **Globe usage** — count of `globe_opened` events by tracker
- [ ] Add insight: **Map filter activity** — count of `map_filter_toggled` by category
- [ ] Add insight: **Timeline engagement** — count of `timeline_event_expanded` by tracker
- [ ] Add insight: **Search activity** — count of `search_performed` per day
- [ ] Add insight: **Broadcast mode usage** — count of `broadcast_mode_toggled`
- [ ] Add insight: **Session duration** distribution

## 5. Set Up Funnels

- [ ] **Discovery funnel**: Homepage → Tracker page → Globe (how many users go deep?)
- [ ] **Engagement funnel**: Tracker page → Map filter toggle → Timeline expand (do users interact?)
- [ ] **Search funnel**: Search page → Search performed → Tracker page (do searches lead to exploration?)

## 6. Set Up Retention

- [ ] Create retention insight: users who visited on Day 0 → returned on Day 1, 7, 30
- [ ] Group by `tracker_slug` to see which trackers have the stickiest audience

## 7. Web Vitals (Enabled)

Watchboard collects Core Web Vitals from real users via PostHog's built-in capture. Configured in `src/layouts/BaseLayout.astro` as `capture_performance: { web_vitals: true }` on `posthog.init`.

PostHog auto-buffers and sends LCP, INP (replaces FID), CLS, FCP, and TTFB samples with each `$pageview`. No additional client code required.

- [ ] In PostHog → **Web Analytics** → **Web Vitals** tab, confirm samples are arriving (typically 1-2 hours of normal traffic for a meaningful baseline)
- [ ] Filter by `$device_type` (desktop vs mobile) — perf budgets differ
- [ ] Filter by `$current_url` to compare homepage vs tracker pages
- [ ] Watch the **p75 LCP** trend over time as the canonical mobile perf metric
- [ ] Cross-check against Cloudflare Web Analytics Core Web Vitals (independent measurement source)

**Tip:** real-user metrics smooth out the variance that simulated Lighthouse runs suffer (~30-40% spread on the same site). Use these for go/no-go on perf changes; reserve Lighthouse for deep dives on individual loads.

## 8. Alerts (Optional)

- [ ] Set up alert: notify if daily unique visitors drops below a threshold
- [ ] Set up alert: notify if error events spike (via `$exception` autocapture)

## Notes

- **PostHog project API key**: stored as `PUBLIC_POSTHOG_KEY` in GitHub repo environment variables
- **PostHog host**: `https://us.i.posthog.com` (US cloud)
- **Cloudflare Web Analytics**: runs independently — use as a second source of truth for page views/uniques (cookieless, ad-blocker resistant)
- **Privacy**: anonymous-only mode (`person_profiles: 'identified_only'`). No PII collected. Search queries are NOT tracked (only `query_length`).
- **Free tier limits**: 1M events/month, 5K session recordings/month
