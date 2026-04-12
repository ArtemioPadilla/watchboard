# Watchboard i18n Audit Report

**Date:** 2026-04-12
**Audited by:** Claude Code (automated comprehensive audit)
**Codebase:** /tmp/watchboard-lockfix (main branch, commit 07e0558)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 7 |
| Major | 14 |
| Minor | 11 |
| **Total** | **32** |

The Watchboard i18n system has a **solid architectural foundation** — a typed translation module (`src/i18n/translations.ts`) with 65 keys across 4 languages (en, es, fr, pt), locale-aware data loading with fallbacks, and client-side locale switching. However, the implementation is **severely incomplete**: only 1 of 21 English page routes is available in other languages, ~480 hardcoded English strings exist across components, and critical SEO attributes (`<html lang>`, `og:locale`) are missing. The social posting pipeline is commendably language-aware, but newsletters, Telegram, and RSS feeds are English-only.

---

## 1. Critical Issues (Broken Functionality / SEO Damage)

### C1. `<html lang="en">` hardcoded for ALL pages
- **File:** `src/layouts/BaseLayout.astro:25`
- **Problem:** The `<html lang="en">` attribute is static. Spanish, French, and Portuguese pages all declare themselves as English to browsers and search engines.
- **Impact:** Screen readers announce wrong language; Google may misindex localized pages; Core Web Vitals accessibility audit fails.

### C2. Missing `og:locale` meta tags
- **File:** `src/layouts/BaseLayout.astro:32-38`
- **Problem:** Open Graph tags include `og:title`, `og:description`, `og:url`, `og:image` but NO `og:locale`. No `og:locale:alternate` tags either.
- **Impact:** Social media platforms (Facebook, LinkedIn) cannot determine page language when sharing.

### C3. 95% of pages have NO localized versions
- **Files:** `src/pages/es/`, `src/pages/pt/`, `src/pages/fr/` — each contains only 1 file
- **Problem:** Each locale directory has ONLY `[tracker]/index.astro`. The following 17 page routes exist only in English:

| Missing Page | Type |
|---|---|
| `index.astro` (homepage) | Core |
| `about.astro` | Informational |
| `api.astro` | Technical |
| `guide.astro` | Informational |
| `newsletter.astro` | Feature |
| `search.astro` | Feature |
| `social.astro` | Feature |
| `metrics.astro` | Feature |
| `404.astro` | Error |
| `briefing/index.astro` | Feature |
| `briefing/[date].astro` | Feature |
| `geo/index.astro` | Feature |
| `geo/[...path].astro` | Feature |
| `embed/[tracker].astro` | Feature |
| `[tracker]/about.astro` | Tracker sub-page |
| `[tracker]/globe.astro` | Tracker sub-page |
| `[tracker]/events/[...slug].astro` | Tracker sub-page |

### C4. hreflang tags point to non-existent pages
- **File:** `src/layouts/BaseLayout.astro:50-54`
- **Problem:** hreflang alternates are generated for ALL pages (es, fr, pt variants), but since localized versions don't exist for 17/18 routes, these links point to 404s.
- **Impact:** Google Search Console will flag dead hreflang links; crawl budget wasted on 404 pages.

### C5. RSS feeds are English-only with hardcoded `<language>en-us</language>`
- **Files:** `src/pages/rss.xml.ts:35-39`, `src/pages/[tracker]/rss.xml.ts:31-36`
- **Problem:** RSS title ("Watchboard — Intelligence Dashboard Updates"), description, and language tag are all hardcoded English. No localized RSS feeds exist.

### C6. Language switcher only shows 2 of 4 supported languages
- **File:** `src/components/islands/CommandCenter/LanguageToggle.tsx`
- **Problem:** UI displays only "EN / ES". French and Portuguese users have no way to discover their languages are supported. Cycling via keyboard works internally but is undiscoverable.
- **Impact:** French and Portuguese translations are effectively invisible to users.

### C7. French and Portuguese have ZERO localized data
- **Directories:** No `data-fr/` or `data-pt/` directories exist in any tracker
- **Problem:** Spanish has 20+ trackers with `data-es/` directories. French and Portuguese users fall back to English data for ALL tracker content.
- **Impact:** Combined with C6, French and Portuguese localization is non-functional end-to-end.

---

## 2. Major Issues (Missing Translations / Hardcoded Strings)

### M1. ~480 hardcoded English strings across components

The translation system has 65 keys, but hundreds of user-facing strings bypass it entirely. Top offenders by file:

| File | Hardcoded Strings | Examples |
|---|---|---|
| `SocialCommandCenter.tsx` | ~100+ | "BUDGET", "Log out", "BATCH APPROVE", "Failed to load data", status filters |
| `MetricsDashboard.tsx` | ~80+ | "All Systems Operational", "Total Runs", "Success Rate", "Loading system status...", table headers |
| `CommandCenter.tsx` | ~60+ | "Watchboard — Intelligence Dashboard Platform", "View on GitHub", "BREAKING", "Press / to search" |
| `CesiumControls.tsx` | ~50+ | "Filters", "Camera Presets", "Satellites", "GPS Jamming", "Weather", "Connect" |
| `CesiumHud.tsx` | ~10+ | "NORMAL", "CRT", "NVG", "FLIR", "ALT:", "SUN:" |
| `MobileStoryCarousel.tsx` | ~10+ | "BRIEFING", "Read more →", "TAP TO RESUME", "SWIPE" |
| `WelcomeOverlay.tsx` | ~8 | "Welcome to Watchboard", "Don't show again", "Got it" |
| `Header.astro` | ~10+ | "ACTIVE TRACKER", "Updated", "3D Globe", "About", "Last update time unknown" |
| `Footer.astro` | ~8 | "About & Credits", "RSS Feed", "Status", "Social", "Last updated:" |
| `MissionIdentity.tsx` | ~5 | "Pre-Launch", "MET 00:00:00:00", "TRACK ORION" |

### M2. Entire pages with zero translation support

These pages have ALL content hardcoded in English with no i18n mechanism:

| Page | Approx. String Count |
|---|---|
| `about.astro` | 50+ (entire educational content) |
| `guide.astro` | 80+ (full tutorial content) |
| `newsletter.astro` | 20+ (form labels, descriptions, success/error messages) |
| `search.astro` | 5+ ("Search All Trackers", subtitle, page title) |
| `social.astro` | 10+ (page title, description, footer) |
| `404.astro` | 5 ("Page Not Found", description, nav links) |
| `briefing/index.astro` | 15+ ("Daily Briefings", "INTELLIGENCE ARCHIVE", pluralization) |
| `briefing/[date].astro` | 20+ ("DAILY BRIEFING", "Previous", "Next", breadcrumbs) |

### M3. Skip link not translated
- **File:** `src/layouts/BaseLayout.astro:118`
- **String:** `"Skip to main content"` — hardcoded English accessibility text

### M4. Feedback button tooltip not translated
- **File:** `src/layouts/BaseLayout.astro:125`
- **String:** `title="Report issue or suggest a feature"` / `aria-label="Report issue or suggest a feature"`

### M5. Newsletter generation script is English-only
- **File:** `scripts/newsletter-generate.ts:95,224`
- **Problem:** Uses hardcoded `'en-US'` locale for date formatting. No locale parameter accepted. All generated newsletter content is English.

### M6. Telegram channel script is English-only
- **File:** `scripts/telegram-channel.ts` (entire file, ~487 lines)
- **Problem:** All message formatting, labels, and content are in English. No locale support.

### M7. French "TRACKER" not translated
- **File:** `src/pages/fr/[tracker]/index.astro:49`
- **Problem:** The domain label `"TRACKER"` is left in English. Should be French (e.g., "SUIVI" or "DOSSIER").

### M8. Localized page titles missing diacritics
- **Files:** `src/pages/pt/[tracker]/index.astro:53`, `src/pages/fr/[tracker]/index.astro:53`
- **Problem:** Portuguese title uses `"Painel de Inteligencia"` (missing accent: should be `"Inteligência"`). The French title `"Tableau de Renseignement"` is grammatically acceptable but could be improved.

### M9. BroadcastOverlay hardcoded strings
- **File:** `src/components/islands/CommandCenter/BroadcastOverlay.tsx`
- **Problem:** Various status messages, navigation hints, and pause/resume text are hardcoded in English despite `broadcast.live` and `broadcast.paused` existing in translations.

### M10. CoachMark accessibility text hardcoded
- **File:** `src/components/islands/CommandCenter/CoachMark.tsx:17`
- **String:** `"Dismiss hint"` — aria-label not translated

### M11. Date formatting hardcoded to en-US in scripts
- **Files:** `scripts/newsletter-generate.ts:95`, `scripts/backfill.ts:289`, `scripts/update-data.ts:1108`
- **Problem:** All use `toLocaleDateString('en-US', ...)` — dates always formatted as English regardless of context.

### M12. Geo and Embed pages have no translation support
- **Files:** `src/pages/geo/index.astro`, `src/pages/geo/[...path].astro`, `src/pages/embed/[tracker].astro`
- **Problem:** These pages have user-facing content with no i18n mechanism.

### M13. Briefing pages use English-only pluralization
- **Files:** `src/pages/briefing/index.astro:132,137`, `src/pages/briefing/[date].astro:169-170`
- **Problem:** Uses simple English pluralization patterns like `event(s)`, `tracker(s)` — not locale-aware.

### M14. Command Center "trackers" and "updated today" badges not translated
- **File:** `src/components/islands/CommandCenter/CommandCenter.tsx:486,489`
- **Strings:** `"trackers"`, `"updated today"` — hardcoded English in the main navigation header.

---

## 3. Minor Issues (Quality / Consistency)

### m1. 11 missing diacritical marks in translations.ts

**Spanish (4 issues):**
| Key | Current | Correct |
|---|---|---|
| `cc.noResults` | "Ningun rastreador coincide con tu busqueda." | "Ning**ú**n rastreador coincide con tu b**ú**squeda." |
| `shortcuts.search` | "Enfocar busqueda" | "Enfocar b**ú**squeda" |
| `shortcuts.broadcast` | "Alternar modo transmision" | "Alternar modo transmisi**ó**n" |
| Additional accent issues in domain/section categories | — | — |

**French (4 issues):**
| Key | Current | Correct |
|---|---|---|
| `cc.globeHint` | "...Defiler pour zoomer · Cliquer pour selectionner" | "...D**é**filer pour zoomer · Cliquer pour s**é**lectionner" |
| `footer.disclaimer` | "Ne soutient aucun recit en particulier." | "Ne soutient aucun r**é**cit en particulier." |
| `shortcuts.deselect` | "Deselectionner / fermer" | "D**é**s**é**lectionner / fermer" |
| Additional accent issues | — | — |

**Portuguese (3 issues):**
| Key | Current | Correct |
|---|---|---|
| `footer.disclaimer` | "Nao endossa nenhuma narrativa em particular." | "N**ã**o endossa nenhuma narrativa em particular." |
| `status.SEGURANCA` (page-level) | "SEGURANCA" | "SEGURAN**Ç**A" |
| `status.GOVERNANCA` (page-level) | "GOVERNANCA" | "GOVERNAN**Ç**A" |

### m2. Inconsistent translation key coverage for static components
- **Problem:** The `t()` function is used extensively in `CommandCenter.tsx` and `SidebarPanel.tsx`, but static `.astro` components (`Header.astro`, `Footer.astro`) use their own hardcoded strings rather than the translation system.

### m3. No locale-aware number formatting in frontend components
- **Files:** `MetricsDashboard.tsx`, `SocialCommandCenter.tsx`, `LeafletMap.tsx`
- **Problem:** Number formatting (decimal separators, thousands separators) does not use locale-aware formatters.

### m4. Social Command Center @handle hardcoded
- **File:** `src/components/islands/SocialCommandCenter.tsx:1082`
- **String:** `"@watchaborddotdev"` — note: this appears to be a typo ("watchaboard" vs "watchboard")

### m5. Time-relative strings partially translated
- **Problem:** The `time` category in translations.ts has 7 keys (justNow, minAgo, hourAgo, etc.), but `Header.astro` implements its own English-only time-ago logic (lines 134-140) without using these translation keys.

### m6. No RTL language support
- **Status:** Not currently needed (en, es, fr, pt are all LTR). However, if Arabic or Hebrew were added, no RTL infrastructure exists.

### m7. Tracker names not localized
- **Problem:** Tracker `shortName` and `name` from `tracker.json` are always displayed in English (e.g., "Iran Conflict", "Chernobyl Disaster"). No mechanism exists for localized tracker names.

### m8. Social queue language distribution unknown
- **File:** `scripts/generate-social-queue.ts:194`
- **Problem:** While the social pipeline supports `lang` field per tweet, the LLM prompt's language distribution strategy is opaque. No guarantee of balanced multilingual output.

### m9. `x-default` hreflang points to English URL
- **File:** `src/layouts/BaseLayout.astro:54`
- **Problem:** `<link rel="alternate" hreflang="x-default" href={pageUrl} />` — This is technically correct (English as default), but combined with C4 (dead hreflang links), it creates a confusing signal to crawlers.

### m10. No translation for structured data / JSON-LD
- **File:** `src/pages/index.astro:176-180`
- **Problem:** Schema.org structured data is English-only. While not strictly required, `inLanguage` should reflect the page locale.

### m11. Font paths assume single language
- **File:** `src/styles/global.css` (font declarations)
- **Problem:** Font files may not support all characters needed for French (ç, é, è, ê, ë, à, â, ù, û, ï, ô, œ) and Portuguese (ã, õ, ç, á, â, é, ê, í, ó, ô, ú). Should be verified.

---

## 4. Positive Findings

These aspects of the i18n system are well-implemented:

1. **Translation module architecture** (`src/i18n/translations.ts`) — TypeScript-typed, 65 keys, fallback chain, URL-based locale detection, localStorage persistence
2. **100% key coverage** — All 65 keys present in all 4 languages (quality issues aside)
3. **Locale-aware data loading** (`src/lib/data.ts`) — Tries `data-{locale}/` first, falls back to `data/` seamlessly
4. **Social posting pipeline** — `generate-social-queue.ts`, `post-social-queue.ts`, `bluesky-post.ts` all respect per-tweet `lang` field
5. **Comprehensive test suite** — 21 tests in `translations.test.ts` covering all locales, fallback behavior, URL detection
6. **Client-side locale switching** — `BaseLayout.astro:140-161` uses `data-i18n` attributes and `locale-change` events for real-time updates
7. **Spanish data localization** — 20+ trackers have `data-es/` directories with localized content

---

## 5. Recommendations (Prioritized)

### Priority 1 — Fix broken SEO (1-2 hours)
1. **Make `<html lang>` dynamic** — Pass locale to `BaseLayout.astro` and set `lang={locale}` on the `<html>` tag
2. **Add `og:locale` meta tags** — `og:locale` for current page + `og:locale:alternate` for other languages
3. **Conditionally emit hreflang** — Only emit hreflang links for pages that actually exist in that locale (or create a mapping)

### Priority 2 — Fix diacritical marks (30 minutes)
4. **Fix 11 accent issues** in `src/i18n/translations.ts` — All are single-character fixes
5. **Fix page-level diacritics** in `src/pages/pt/[tracker]/index.astro` and `src/pages/fr/[tracker]/index.astro`

### Priority 3 — Expand language switcher (1-2 hours)
6. **Show all 4 languages** in `LanguageToggle.tsx` — Either inline ("EN / ES / FR / PT") or as a dropdown

### Priority 4 — Externalize component strings (1-2 days)
7. **Move hardcoded strings to translation keys** — Start with high-traffic components:
   - `CommandCenter.tsx` (60+ strings)
   - `Header.astro` / `Footer.astro` (20+ strings)
   - `MobileStoryCarousel.tsx` (10+ strings)
   - `BroadcastOverlay.tsx` (10+ strings)
   - `WelcomeOverlay.tsx` (8 strings)

### Priority 5 — Create localized page shells (2-3 days)
8. **Add locale wrappers** for high-value pages: `index.astro` (homepage), `about.astro`, `search.astro`, `404.astro`
9. **Consider a shared page factory pattern** — Localized pages currently duplicate the entire English page. A shared template with locale props would reduce maintenance.

### Priority 6 — Localize remaining surfaces (1 week)
10. **RSS feeds** — Create per-locale RSS endpoints or add locale parameter
11. **Newsletter** — Accept locale parameter in `newsletter-generate.ts`
12. **Telegram** — Add locale support to `telegram-channel.ts`
13. **Briefing pages** — Add locale-aware pluralization and translated labels

### Priority 7 — Data localization (ongoing)
14. **French and Portuguese tracker data** — Start with highest-traffic trackers. This is the largest effort and should be gradual.

### Priority 8 — Infrastructure improvements (optional)
15. **Add i18n linting** — CI check that all translation keys exist in all locales and have proper diacritics
16. **Locale-aware date/number formatting** — Pass locale to all `toLocaleDateString()` and `toLocaleString()` calls
17. **Consider an i18n framework** — The hand-rolled system works but scaling to 480+ keys may benefit from `astro-i18n`, `i18next`, or similar

---

## Appendix: File Index

### Core i18n Files
| File | Purpose |
|---|---|
| `src/i18n/translations.ts` | Translation keys (65 keys × 4 languages) |
| `src/i18n/translations.test.ts` | 21 test cases |
| `src/lib/data.ts` | Locale-aware data loader |
| `src/layouts/BaseLayout.astro` | hreflang tags, client-side locale script |

### Localized Pages (3 files total)
| File | Status |
|---|---|
| `src/pages/es/[tracker]/index.astro` | Functional |
| `src/pages/pt/[tracker]/index.astro` | Functional (missing diacritics) |
| `src/pages/fr/[tracker]/index.astro` | Functional (untranslated "TRACKER" key) |

### Language-Aware Scripts
| Script | Language Support |
|---|---|
| `scripts/generate-social-queue.ts` | en, es, fr, pt |
| `scripts/post-social-queue.ts` | Respects per-tweet lang |
| `scripts/bluesky-post.ts` | Respects per-tweet lang |
| `scripts/newsletter-generate.ts` | English only |
| `scripts/telegram-channel.ts` | English only |
| `scripts/backfill-media.ts` | N/A (language-neutral) |

### Components With Most Hardcoded Strings
| Component | Count | Category |
|---|---|---|
| `SocialCommandCenter.tsx` | ~100+ | Dashboard UI |
| `MetricsDashboard.tsx` | ~80+ | Dashboard UI |
| `CommandCenter.tsx` | ~60+ | Navigation/Core |
| `CesiumControls.tsx` | ~50+ | Globe controls |
| `about.astro` | ~50+ | Page content |
| `guide.astro` | ~80+ | Page content |
| `briefing/*.astro` | ~35+ | Page content |
| `Header.astro` | ~10+ | Layout |
| `Footer.astro` | ~8 | Layout |
| `MobileStoryCarousel.tsx` | ~10+ | Mobile UI |
| `WelcomeOverlay.tsx` | ~8 | Onboarding |
| `newsletter.astro` | ~20+ | Page content |
| `search.astro` | ~5+ | Page content |
| `404.astro` | ~5 | Error page |

---

*End of audit report.*
