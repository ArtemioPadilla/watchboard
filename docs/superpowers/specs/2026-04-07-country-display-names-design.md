# Design Spec — Country Display Names

**Date:** 2026-04-07
**Status:** Draft
**Scope:** Replace ISO 2-letter country codes with human-readable names across geo surfaces

---

## Problem

Watchboard's geographic hierarchy exposes ISO 3166-1 alpha-2 codes ("MX", "IR", "UA") directly to users in four places:

1. **GeoAccordion sidebar** (`GeoAccordion.tsx`) — country-level nodes show raw codes as their label because `ensureChildNode` in `geo-utils.ts` sets `label: childId` and `childId` is the ISO code from `geoPath[0]`.
2. **`/geo/[...path].astro` page** — child node cards (the "Sub-regions" grid) get `label: segment` where `segment` is the raw ISO code, and the breadcrumb falls through to the raw code for all non-region segments.
3. **`GeoIndex.astro`** — renders `child.label` verbatim; if the parent page passes raw codes, this is what users see.
4. **`GeoBreadcrumb.astro`** — uses `country || geoPath[0]` as the first segment label. When the tracker config's `country` field contains the ISO code (not a display name), this shows the raw code.

Region labels already have a proper mapping (`REGION_LABELS` in `geo-utils.ts`, `[...path].astro`, and `index.astro`). Country names have no equivalent mapping.

---

## Current Data Model

```
tracker.json
  country: "MX"            ← ISO code, optional field
  geoPath: ["MX", "Sinaloa", "Culiacán"]   ← geoPath[0] = ISO code
  state:   "Sinaloa"       ← already human-readable
  city:    "Culiacán"      ← already human-readable
```

`TrackerConfigSchema` in `src/lib/tracker-config.ts`:
```ts
country: z.string().optional(),    // stores ISO code today
state:   z.string().optional(),
city:    z.string().optional(),
```

The `GeoNode` interface in `geo-utils.ts` has a `label: string` field. For country nodes, that label is currently set to the raw `childId` string (the ISO code).

---

## ISO Codes Currently in Use

From scanning all 48 trackers:

| Code | Country |
|------|---------|
| AF | Afghanistan |
| CL | Chile |
| CN | China |
| CU | Cuba |
| DE | Germany |
| ES | Spain |
| FR | France |
| HT | Haiti |
| IL | Israel |
| IN | India |
| IR | Iran |
| JP | Japan |
| KR | South Korea |
| ML | Mali |
| MM | Myanmar |
| MX | Mexico |
| PH | Philippines |
| PR | Puerto Rico |
| PS | Palestine |
| SD | Sudan |
| SO | Somalia |
| TW | Taiwan |
| UA | Ukraine |
| US | United States |

24 codes total as of 2026-04-07. The mapping table should be generous (≈40–50 entries) to avoid having to update the file every time a new tracker is added.

---

## Proposed Solution

### 1. Single Source of Truth: `src/lib/country-names.ts`

Create a new module that owns the complete mapping. Do not scatter it across the three files that currently duplicate `REGION_LABELS`.

```ts
// src/lib/country-names.ts

/**
 * ISO 3166-1 alpha-2 → display name lookup.
 * Used by geo surfaces to show human-readable country names
 * instead of raw codes (e.g. "Mexico" instead of "MX").
 *
 * Extend this table when adding trackers with new country codes.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan',
  AL: 'Albania',
  AM: 'Armenia',
  AO: 'Angola',
  AR: 'Argentina',
  AZ: 'Azerbaijan',
  BD: 'Bangladesh',
  BO: 'Bolivia',
  BR: 'Brazil',
  BY: 'Belarus',
  CL: 'Chile',
  CN: 'China',
  CO: 'Colombia',
  CU: 'Cuba',
  DE: 'Germany',
  EG: 'Egypt',
  ES: 'Spain',
  ET: 'Ethiopia',
  FR: 'France',
  GB: 'United Kingdom',
  GE: 'Georgia',
  HT: 'Haiti',
  ID: 'Indonesia',
  IL: 'Israel',
  IN: 'India',
  IQ: 'Iraq',
  IR: 'Iran',
  JP: 'Japan',
  KR: 'South Korea',
  KP: 'North Korea',
  LB: 'Lebanon',
  LY: 'Libya',
  ML: 'Mali',
  MM: 'Myanmar',
  MX: 'Mexico',
  NG: 'Nigeria',
  PH: 'Philippines',
  PK: 'Pakistan',
  PR: 'Puerto Rico',
  PS: 'Palestine',
  RU: 'Russia',
  SA: 'Saudi Arabia',
  SD: 'Sudan',
  SO: 'Somalia',
  SS: 'South Sudan',
  SY: 'Syria',
  TW: 'Taiwan',
  UA: 'Ukraine',
  US: 'United States',
  VE: 'Venezuela',
  VN: 'Vietnam',
  YE: 'Yemen',
  ZA: 'South Africa',
  ZW: 'Zimbabwe',
};

/**
 * Return the display name for a country code.
 * Falls back to the code itself if unknown (e.g. "XK" → "XK").
 * Never throws.
 */
export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
```

**Why a separate module, not extending `geo-utils.ts`?**

- `geo-utils.ts` is already 330 lines and has a focused responsibility (tree building + merging).
- `country-names.ts` is a pure data table — zero logic, easy to maintain, easy to grep.
- React island files (`GeoAccordion.tsx`) import from `src/lib/` directly; a separate file keeps that import explicit.
- Future: if locale-aware names are added, this file is the only place to update.

### 2. Apply in `geo-utils.ts` — `ensureChildNode`

The root of the problem is in `ensureChildNode`:

```ts
// BEFORE
parentNode.children.push({
  id: childId,
  label: childId, // raw ISO code
  ...
});
```

Import `countryName` and resolve labels at node creation time:

```ts
// AFTER
import { countryName } from './country-names';

function ensureChildNode(
  parentNode: GeoNode,
  childId: string,
  level: GeoNode['level'],
): void {
  if (!parentNode.children.find(c => c.id === childId)) {
    parentNode.children.push({
      id: childId,
      label: level === 'country' ? countryName(childId) : childId,
      level,
      trackers: [],
      secondaryTrackers: [],
      children: [],
      trackerCount: 0,
    });
  }
}
```

`id` stays as the raw ISO code (used for URL path construction and tree lookups). `label` is the display string.

This single change fixes **GeoAccordion** automatically — it renders `node.label`.

### 3. Apply in `/geo/[...path].astro`

Two locations need updating:

**a) Child node labels** (the "Sub-regions" grid):

```ts
// BEFORE
const childNodes = [...childMap.entries()].map(([segment, count]) => ({
  id: segment,
  label: segment,
  ...
}));

// AFTER
import { countryName } from '../../lib/country-names';

const childNodes = [...childMap.entries()].map(([segment, count]) => {
  // depth 1 = country level (geoSegments.length === 0 means region page,
  // so the "next segment" is a country code)
  const isCountryLevel = geoSegments.length === 0;
  return {
    id: segment,
    label: isCountryLevel ? countryName(segment) : segment,
    trackerCount: count,
    href: `${basePath}geo/${[...pathSegments, segment].join('/')}/`,
  };
});
```

**b) Breadcrumb labels**:

```ts
// BEFORE
const breadcrumb = pathSegments.map((seg, i) => ({
  label: i === 0 ? (REGION_LABELS[seg] || seg) : seg,
  href: ...,
}));

// AFTER
const breadcrumb = pathSegments.map((seg, i) => ({
  label: i === 0
    ? (REGION_LABELS[seg] || seg)  // region segment
    : i === 1
      ? countryName(seg)           // country segment
      : seg,                       // state/city: already human-readable
  href: ...,
}));
```

**c) `currentLabel`** — for the page `<h1>`:

```ts
// BEFORE
const currentLabel = pathSegments.length === 1
  ? (REGION_LABELS[region] || region)
  : pathSegments[pathSegments.length - 1];

// AFTER
const currentLabel = pathSegments.length === 1
  ? (REGION_LABELS[region] || region)
  : pathSegments.length === 2
    ? countryName(pathSegments[1])   // country page title
    : pathSegments[pathSegments.length - 1];  // state/city
```

### 4. Apply in `GeoBreadcrumb.astro`

The component receives a `country` prop, which callers pass as the tracker's `country` field — and that field stores the ISO code. Fix it at the call site rather than in the component.

In `src/pages/[tracker]/index.astro` (and any other place that renders `GeoBreadcrumb`), resolve the display name before passing:

```astro
---
import { countryName } from '../lib/country-names';
---
<GeoBreadcrumb
  geoPath={config.geoPath}
  country={config.country ? countryName(config.country) : undefined}
  state={config.state}
  city={config.city}
/>
```

This keeps `GeoBreadcrumb.astro` a simple presentational component — it uses whatever string it's given. The raw ISO code never reaches the template.

### 5. `/geo/index.astro` — No Change Needed

The root geo index only shows region nodes (`REGION_LABELS`), not country codes. No change required.

---

## Locale-Aware Names: Deferred

The i18n system (`src/i18n/translations.ts`) supports `en | es | fr | pt`. Country names could in principle be localized:

- "Mexico" → "México" (same in Spanish)
- "United States" → "Estados Unidos" (Spanish)
- "United Kingdom" → "Royaume-Uni" (French)

**Decision: do not implement locale-aware country names in this iteration.**

Rationale:
1. Country names in the user's current locale are a minor UX improvement. The primary bug is showing "MX" at all.
2. The i18n system's `useTranslation` hook is only available in React islands (runtime locale from `localStorage`). Static Astro components (`GeoBreadcrumb`, `[...path].astro`) don't have runtime locale access at all — they would need a build-time locale or server context.
3. The translation key space would grow by ~50 keys × 4 locales = 200 entries, making `translations.ts` unwieldy for what is purely reference data.
4. Most country names are recognizable across language contexts (especially the ones Watchboard tracks).

**If locale support is added later**, the cleanest path is:

```ts
// country-names.ts
export const COUNTRY_NAMES_BY_LOCALE: Record<Locale, Record<string, string>> = {
  en: { MX: 'Mexico', US: 'United States', ... },
  es: { MX: 'México', US: 'Estados Unidos', ... },
  fr: { MX: 'Mexique', US: 'États-Unis', ... },
  pt: { MX: 'México', US: 'Estados Unidos', ... },
};

export function countryName(code: string, locale: Locale = 'en'): string {
  return COUNTRY_NAMES_BY_LOCALE[locale]?.[code] ?? COUNTRY_NAMES_BY_LOCALE.en[code] ?? code;
}
```

This is backward-compatible with the single-argument signature.

---

## Fallback Behavior

`countryName(code)` falls back to the raw code string when the code is not in the table. This is intentional:

- Unknown codes remain visible (better than silently showing nothing or crashing).
- The fallback still works — it just degrades to the current behavior.
- Developers will see the raw code in the UI and know to add it to the table.

No error is thrown. No console warning is needed (ISO codes are valid strings).

---

## Files to Change

| File | Change |
|------|--------|
| `src/lib/country-names.ts` | **Create** — the lookup table + `countryName()` helper |
| `src/lib/geo-utils.ts` | Import `countryName`, apply in `ensureChildNode` for `level === 'country'` |
| `src/pages/geo/[...path].astro` | Import `countryName`, apply to child node labels, breadcrumb at depth 1, `currentLabel` at depth 2 |
| `src/pages/[tracker]/index.astro` | Resolve `countryName(config.country)` before passing to `GeoBreadcrumb` |

**No changes needed:**
- `GeoAccordion.tsx` — already renders `node.label`; fix is upstream in `geo-utils.ts`
- `GeoIndex.astro` — already renders `child.label`; fix is upstream in the page that builds `childNodes`
- `GeoBreadcrumb.astro` — stays presentational; fix is at the call site
- `src/pages/geo/index.astro` — only shows region labels, no country codes
- `src/i18n/translations.ts` — no changes in this iteration

---

## Implementation Notes

- `id` on `GeoNode` and child node objects always stays as the raw ISO code. URL paths, tree lookups, and `geoPath` comparisons all use `id`. Only `label` changes.
- The `REGION_LABELS` copies in `[...path].astro` and `index.astro` can optionally be consolidated into `geo-utils.ts` as a follow-up (already exists there as `REGION_LABELS` and exported via `regionLabel()`), but that is out of scope for this spec.
- This spec does not change `tracker.json` files. The `country` field stays as the ISO code — it is used for lookups, not display.

---

## Acceptance Criteria

- Visiting `/geo/north-america/MX/` shows "Mexico" in the `<h1>`, breadcrumb, and child node cards — never "MX".
- The GeoAccordion sidebar shows "Mexico" (amber label) instead of "MX" for the country node under Latin America.
- `GeoBreadcrumb` on any MX tracker page shows "Mexico" as the first geo segment.
- Unknown codes (e.g. a future tracker with `geoPath: ["XK"]`) degrade gracefully to showing "XK".
- No build errors; `npm run build` passes.
- No TypeScript errors; `countryName` is typed as `(code: string) => string`.
