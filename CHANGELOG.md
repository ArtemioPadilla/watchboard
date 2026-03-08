# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- OSINT weapon-type schemas: `WeaponTypeSchema`, `ConfidenceSchema`, `StrikeStatusSchema` with inferred types
- 10 optional OSINT fields on `MapLineSchema`: weaponType, launched, intercepted, confidence, time, damage, casualties, notes, platform, status
- 2 optional OSINT fields on `TimelineEventSchema`: weaponTypes, confidence
- 5 weapon-type-aware rendering helpers in cesium-helpers.ts: `weaponSpeed`, `weaponPeakAlt`, `simFlightDurationTyped`, `weaponProjectileSize`, `weaponGlowPower`

## [1.0.0] - 2026-03-07

### Added
- Astro 5 static intelligence dashboard with dark theme
- 7-section single-page layout: Timeline, Map, Military Ops, Humanitarian, Economic, Contested Claims, Political
- Interactive SVG theater map with category filters, arc lines, and click-to-detail info panel
- Click-to-expand historical timeline spanning 1941 to present
- Tabbed military operations view (strike targets, retaliation, US assets)
- Economic impact cards with sparkline charts (Brent, WTI, gold, S&P 500, VIX, rial)
- Contested claims matrix with side-by-side source comparison
- 4-tier source classification system (Official, Major Outlet, Institutional, Unverified)
- Casualty table with contested/verified badges
- Political and diplomatic statements grid
- KPI strip with contested flags and color coding
- 3D CesiumJS intelligence globe at `/globe` route
- Animated missile trajectories with synchronized timeline on globe
- Post-processing shaders (CRT, NVG, Thermal, Bloom) on globe
- Real-time satellite tracking, flight tracking, and earthquake feeds on globe
- Events/intel feed panel on globe synced to timeline date
- Nightly AI data update pipeline with dual provider support (Anthropic / OpenAI)
- Multi-pole sourcing (Western, Middle Eastern, Eastern, International perspectives)
- Zod schema validation for all data at build time
- Daily event partitioning with backfill infrastructure (`npm run backfill`)
- GitHub Actions CI/CD: auto-deploy on push + scheduled nightly data refresh
- Full data backfill covering all 44 days (Jan 23 - Mar 7, 2026)
