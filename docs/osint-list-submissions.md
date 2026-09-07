# OSINT & Tool List Submissions

Ready-to-submit PR descriptions for curated lists.

---

## 1. awesome-osint (github.com/jivoi/awesome-osint)

**Section:** Tools > Threat Intelligence (or Geospatial Search Tools)

**PR Title:** Add Watchboard — AI-powered multi-topic intelligence dashboard platform

**Entry to add:**
```markdown
- [Watchboard](https://github.com/ArtemioPadilla/watchboard) - Open-source platform for AI-powered intelligence dashboards with interactive maps, 3D globe, source tier classification, and nightly automated updates across 48 topics.
```

**PR Body:**
```
Watchboard is an open-source intelligence dashboard platform featuring:
- 48 topic trackers (active conflicts, disasters, political events, historical events)
- Interactive Leaflet maps + CesiumJS 3D globe
- Source tier classification (Tier 1–4)
- 4-pole media sourcing (Western, Middle Eastern, Eastern, International)
- Nightly AI-powered data updates via GitHub Actions
- Config-driven: create a new tracker in ~25 minutes

Live: https://watchboard.dev/
```

---

## 2. awesome-astro (github.com/one-aalam/awesome-astro)

**Section:** Projects Using Astro > Websites

**PR Title:** Add Watchboard — 48 intelligence dashboards built with Astro 5 + React islands

**Entry to add:**
```markdown
- [Watchboard](https://github.com/ArtemioPadilla/watchboard) - AI-powered intelligence dashboard platform with 48 trackers, CesiumJS 3D globe, Leaflet maps, and nightly automated data updates. Built with Astro 5, React islands, TypeScript, and Zod.
```

---

## 3. Astro Official Showcase (astro.build/showcase)

**Submission URL:** https://astro.build/showcase/submit/

**Fields:**
- Site URL: https://watchboard.dev/
- Source URL: https://github.com/ArtemioPadilla/watchboard
- Description: AI-powered intelligence dashboard platform with 48 trackers covering conflicts, disasters, political events, and more. Features CesiumJS 3D globe, Leaflet maps, source tier classification, and nightly automated data updates via Claude Code.

---

## 4. OSINT Framework (osintframework.com)

**Repo:** github.com/lockfale/osint-framework

**Section:** Tools > Threat Intelligence (or Geopolitical)

**PR Title:** Add Watchboard to threat intelligence tools

**Entry:** Add a node under the appropriate category with:
- Name: Watchboard
- URL: https://watchboard.dev/

---

## 5. ~~Bellingcat Digital Investigation Toolkit~~ (NOT accepting submissions)

The old Google Sheet toolkit (bit.ly/bcattools) is deprecated. The new toolkit at https://bellingcat.gitbook.io/toolkit **does not accept tool suggestions**. They only recruit long-term volunteer contributors via toolkit@bellingcat.com. Not a viable submission target.

---

## 6. awesome-selfhosted (github.com/awesome-selfhosted/awesome-selfhosted)

**Category:** News / Feed readers (or "Miscellaneous" if the maintainers prefer)
**Requirements met:** MIT license, Docker image on GHCR (`ghcr.io/artemiopadilla/watchboard`), amd64 + arm64, `docker-compose.yml`, documented in `docs/self-hosting.md`, no accounts or external services required to run.
**Proposed entry:**

> - [Watchboard](https://watchboard.dev/) - AI-curated intelligence dashboards for 100+ topics (conflicts, science, politics) with timelines, source tiers, interactive maps and a 3D globe. Static site served by nginx. ([Source Code](https://github.com/ArtemioPadilla/watchboard)) `MIT` `Docker`

**Blocker:** awesome-selfhosted asks for a project age of at least 4 months and an actively maintained repo; both hold. Submit once the first `v*` tag exists so the image has a stable version tag.

## 7. CasaOS / Umbrel app stores

**CasaOS:** `docker-compose.yml` already carries the `x-casaos` block (title, description, icon, port map). Submit a PR to `IceWhaleTech/CasaOS-AppStore` with that compose file under `Apps/Watchboard/`.
**Umbrel:** needs an `umbrel-app.yml` manifest plus a compose file with the `app_proxy` service; the image is compatible (single container, port 8080). Do after CasaOS.

## Submission Checklist

- [x] awesome-osint PR — [jivoi/awesome-osint#855](https://github.com/jivoi/awesome-osint/pull/855)
- [x] awesome-astro PR — [one-aalam/awesome-astro#85](https://github.com/one-aalam/awesome-astro/pull/85)
- [x] Astro showcase submission — [withastro/roadmap#521 comment](https://github.com/withastro/roadmap/discussions/521#discussioncomment-16374577)
- [x] OSINT Framework PR — [lockfale/OSINT-Framework#665](https://github.com/lockfale/OSINT-Framework/pull/665)
- [x] ~~Bellingcat outreach~~ — not accepting submissions

**Tips:**
- For awesome-* PRs: read their contributing guide, follow alphabetical sorting, keep description under 2 lines
- For Astro showcase: include a screenshot if they have a field for it
- Space submissions 2-3 days apart so you don't hit spam filters
