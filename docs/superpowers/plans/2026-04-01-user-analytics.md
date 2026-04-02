# User Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare Web Analytics + PostHog to Watchboard for page views, unique visitors, session recordings, heatmaps, and custom domain events.

**Architecture:** Two script tags in `BaseLayout.astro` `<head>` — Cloudflare always loaded, PostHog gated by env var. A thin `analytics.ts` wrapper centralizes PostHog calls. Custom events added to existing handlers in React islands and Astro page scripts.

**Tech Stack:** Cloudflare Web Analytics (beacon.min.js), PostHog JS SDK (snippet), Astro, React, TypeScript

---

### Task 1: Create analytics wrapper

**Files:**
- Create: `src/lib/analytics.ts`

- [ ] **Step 1: Create `src/lib/analytics.ts`**

```typescript
declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
  }
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(name, props);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/analytics.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics.ts
git commit -m "feat(analytics): add PostHog trackEvent wrapper"
```

---

### Task 2: Add Cloudflare Web Analytics + PostHog scripts to BaseLayout

**Files:**
- Modify: `src/layouts/BaseLayout.astro:22-61` (inside `<head>`)

- [ ] **Step 1: Add both script tags at the end of `<head>`**

In `src/layouts/BaseLayout.astro`, insert the following immediately before the closing `</head>` tag (line 61):

```html
  <!-- Cloudflare Web Analytics -->
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "e1a664e3c0b34e03b06b74bb10f199f5"}'></script>
  <!-- PostHog Analytics (only when env var is set) -->
  {import.meta.env.PUBLIC_POSTHOG_KEY && (
    <script define:vars={{
      posthogKey: import.meta.env.PUBLIC_POSTHOG_KEY,
      posthogHost: import.meta.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    }}>
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageviewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: 'identified_only',
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
      });
    </script>
  )}
```

- [ ] **Step 2: Verify dev server starts without errors**

Run: `npm run dev` and open the homepage in a browser. Check that:
- No console errors from the Cloudflare script
- PostHog script does NOT load (no `PUBLIC_POSTHOG_KEY` in local env)

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(analytics): add Cloudflare Web Analytics + PostHog scripts to BaseLayout"
```

---

### Task 3: Add custom events to tracker dashboard page

**Files:**
- Modify: `src/pages/[tracker]/index.astro` (add inline script at end of body)

- [ ] **Step 1: Add `tracker_viewed` event**

In `src/pages/[tracker]/index.astro`, add this inline script block just before the closing of the page content (after all component renders, before closing tags):

```html
<script define:vars={{ trackerSlug: config.slug }}>
  if (window.posthog) {
    window.posthog.capture('tracker_viewed', { tracker_slug: trackerSlug });
  }
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/[tracker]/index.astro
git commit -m "feat(analytics): add tracker_viewed event on dashboard page"
```

---

### Task 4: Add custom event to globe page

**Files:**
- Modify: `src/pages/[tracker]/globe.astro` (add inline script)

- [ ] **Step 1: Add `globe_opened` event**

In `src/pages/[tracker]/globe.astro`, add this script after the existing `<script>` block (after line 58):

```html
<script define:vars={{ trackerSlug: config.slug }}>
  if (window.posthog) {
    window.posthog.capture('globe_opened', { tracker_slug: trackerSlug });
  }
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/[tracker]/globe.astro
git commit -m "feat(analytics): add globe_opened event on globe page"
```

---

### Task 5: Add custom events to React islands

**Files:**
- Modify: `src/components/islands/IntelMap.tsx:127-134` (toggleFilter handler)
- Modify: `src/components/islands/TimelineSection.tsx:23-25` (handleClick handler)
- Modify: `src/components/islands/MilitaryTabs.tsx:101` (tab onClick)
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx:159-163` (broadcast toggle)

- [ ] **Step 1: Add `map_filter_toggled` to IntelMap**

In `src/components/islands/IntelMap.tsx`, add the import at the top of the file:

```typescript
import { trackEvent } from '../../lib/analytics';
```

Then modify the `toggleFilter` function (line 127) to add tracking:

```typescript
  const toggleFilter = (cat: string) => {
    trackEvent('map_filter_toggled', { category: cat });
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
```

- [ ] **Step 2: Add `timeline_event_expanded` to TimelineSection**

In `src/components/islands/TimelineSection.tsx`, add the import at the top:

```typescript
import { trackEvent } from '../../lib/analytics';
```

Then modify the `handleClick` function (line 23) to add tracking:

```typescript
  const handleClick = (ev: TimelineEvent) => {
    trackEvent('timeline_event_expanded', { event_title: ev.title, year: ev.year });
    setSelected(prev => prev === ev ? null : ev);
  };
```

- [ ] **Step 3: Add `military_tab_switched` to MilitaryTabs**

In `src/components/islands/MilitaryTabs.tsx`, add the import at the top:

```typescript
import { trackEvent } from '../../lib/analytics';
```

Then modify the tab button onClick (line 101) to add tracking:

```tsx
onClick={() => {
  trackEvent('military_tab_switched', { tab_id: t.id });
  setActiveTab(t.id);
}}
```

- [ ] **Step 4: Add `broadcast_mode_toggled` to CommandCenter**

In `src/components/islands/CommandCenter/CommandCenter.tsx`, add the import at the top:

```typescript
import { trackEvent } from '../../../lib/analytics';
```

Then modify the broadcast toggle (line 162) to add tracking:

```typescript
        case 'b':
        case 'B':
          e.preventDefault();
          trackEvent('broadcast_mode_toggled', { enabled: broadcastOff });
          setBroadcastOff(prev => !prev);
          break;
```

Note: `broadcastOff` is the current state before toggling — `true` means broadcast is being turned ON (since `broadcastOff` is being flipped to `false`).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript or runtime errors

- [ ] **Step 6: Commit**

```bash
git add src/components/islands/IntelMap.tsx src/components/islands/TimelineSection.tsx src/components/islands/MilitaryTabs.tsx src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(analytics): add custom PostHog events to React islands"
```

---

### Task 6: Add search and homepage events

**Files:**
- Modify: `src/pages/search.astro:23-46` (pagefind script block)
- Modify: `src/pages/index.astro` (homepage)

- [ ] **Step 1: Add `search_performed` to search page**

In `src/pages/search.astro`, modify the existing pagefind `script.onload` callback (line 33) to add a debounced search tracker after PagefindUI initialization:

```javascript
    script.onload = function() {
      new PagefindUI({
        element: '#search',
        showSubResults: true,
        showImages: false,
        excerptLength: 30,
        baseUrl: pagefindBase.replace('pagefind/', ''),
      });
      // Auto-focus the search input for immediate typing
      var input = document.querySelector('.pagefind-ui__search-input');
      if (input) input.focus();

      // Track search events (debounced, query length only)
      var searchTimeout;
      if (input) {
        input.addEventListener('input', function() {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function() {
            if (window.posthog && input.value.length > 0) {
              window.posthog.capture('search_performed', { query_length: input.value.length });
            }
          }, 1000);
        });
      }
    };
```

- [ ] **Step 2: Add `tracker_card_clicked` to homepage**

In `src/pages/index.astro`, this is a React island (CommandCenter). The tracker card clicks are handled inside the CommandCenter component. Add tracking there.

In `src/components/islands/CommandCenter/CommandCenter.tsx`, find where tracker cards are clicked/selected (the `setActiveTracker` or navigation handler). Add tracking when a tracker is opened:

```typescript
trackEvent('tracker_card_clicked', { tracker_slug: tracker.slug });
```

This goes wherever the user navigates from the homepage to a tracker (e.g., the link/button click handler for tracker cards). The exact location depends on how CommandCenter handles tracker navigation — look for `window.location` or `<a href>` patterns. If navigation is via `<a>` tags, PostHog autocapture will already catch these clicks, so this event can be skipped.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/search.astro src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(analytics): add search and homepage tracking events"
```

---

### Task 7: Add `.env.example` and update documentation

**Files:**
- Create: `.env.example` (if it doesn't exist, otherwise modify)

- [ ] **Step 1: Add/update `.env.example`**

Add these lines to `.env.example` (create if it doesn't exist):

```bash
# PostHog Analytics (optional — omit to disable tracking in local dev)
# PUBLIC_POSTHOG_KEY=phc_your_project_key
# PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

- [ ] **Step 2: Verify full build passes**

Run: `npm run build`
Expected: Build succeeds. No analytics scripts in output HTML (since env vars are not set locally).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(analytics): add .env.example with PostHog config"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run dev server and inspect HTML**

Run: `npm run dev`

Open browser, view page source on the homepage. Verify:
- Cloudflare beacon script IS present in `<head>`
- PostHog script is NOT present (no env var set)

- [ ] **Step 2: Test with PostHog key**

Create a temporary `.env` file:
```bash
PUBLIC_POSTHOG_KEY=phc_test_key_here
```

Restart dev server. Verify PostHog snippet IS present in page source with the test key.

Delete the `.env` file after testing.

- [ ] **Step 3: Run full production build**

Run: `npm run build`
Expected: Build succeeds with no errors or warnings related to analytics.
