# Tracker Roadmap

Living document of proposed trackers, prioritized by impact. Tier 1 has been (or is being) implemented; Tiers 2–5 are the open backlog and feed the community vote at `/vote`.

Last updated: 2026-04-25.

## Status Legend

- ✅ shipped
- 🚧 in progress
- 📋 backlog (open to vote)
- 💡 idea (needs spec)

## Tier 1 — World coverage gaps (in progress)

The largest geopolitical actors not yet represented as country-level trackers.

| Tracker | Slug | Status | Notes |
|---|---|---|---|
| India | `india` | 🚧 | From Indus Valley (~2600 BCE) through Modi era |
| China | `china` | 🚧 | From Xia (~2070 BCE) through Xi Jinping |
| Russia | `russia` | 🚧 | From Kievan Rus (862) through Putin/Ukraine war |
| Iran | `iran` | 🚧 | From Achaemenid Empire (550 BCE) through Pezeshkian |
| Turkey | `turkey` | 🚧 | From Ottoman founding (1299) through Erdoğan |
| Saudi Arabia | `saudi-arabia` | 🚧 | From First Saudi State (1744) through MBS Vision 2030 |

## Tier 2 — Latam completion + globalized country pattern

| Tracker | Slug | Status | Rationale |
|---|---|---|---|
| Cuba (full history) | `cuba` | 📋 | Existing `cuba-crises` covers 1959+; expand to 1492 colonial |
| Ecuador | `ecuador` | 📋 | Petro economy, Lasso–Noboa, Indigenous movement |
| Bolivia | `bolivia` | 📋 | MAS–Morales, lithium, Indigenous nationhood |
| Paraguay | `paraguay` | 📋 | Stroessner legacy, Colorado Party, Itaipú |
| Uruguay | `uruguay` | 📋 | Frente Amplio, regulatory innovation |
| Haiti (full history) | `haiti` | 📋 | Existing `haiti-collapse` is event-scoped; expand to 1791 revolution |
| Central America hub | `central-america` | 💡 | GT/HN/SV/NI/PA/CR — single hub with shared eras |

## Tier 3 — Capital cities (CDMX pattern)

City-level trackers nested under their country trackers.

| Tracker | Slug | Status | Why |
|---|---|---|---|
| Washington DC | `washington-dc` | 💡 | Federal politics, Capitol events, DC home rule |
| Caracas | `caracas` | 💡 | Regime nerve center, blackouts, opposition rallies |
| Buenos Aires | `buenos-aires` | 💡 | Milei administration epicenter, federal–city tensions |
| São Paulo | `sao-paulo` | 💡 | Brazil's economic capital, PCC operations |
| Tokyo | `tokyo` | 💡 | LDP politics, earthquake risk, demographics |
| Mumbai | `mumbai` | 💡 | India's financial heart, Bollywood, terror history |
| Lagos | `lagos` | 💡 | Largest African megacity, Tinubu base |

## Tier 4 — Cross-cutting thematic trackers

| Tracker | Slug | Status | Why |
|---|---|---|---|
| AI governance | `ai-governance` | 📋 | EU AI Act, US executive orders, China AI law — distinct from `ai-for-good` |
| Cybersecurity incidents | `cybersecurity-incidents` | 📋 | Nation-state ransomware, breaches, cable cuts |
| Climate disasters | `climate-disasters` | 📋 | Wildfires/floods/heatwaves — events, not solutions |
| Pandemic watch | `pandemic-watch` | 📋 | H5N1, mpox, future threats — `covid-pandemic` is closed |
| Elections 2025–2026 | `elections-watch` | 📋 | AR midterms, CL presidential, US midterms, IN regionals |
| Space race (global) | `space-race` | 📋 | China lunar, ISRO, ESA, commercial — meta tracker |
| Cartels global | `cartels-global` | 💡 | Mexican cartels, PCC, 'Ndrangheta, Yakuza — global hub |
| Migration corridors | `migration-corridors` | 💡 | Cross-tracker layer connecting source→transit→destination |
| Sanctions tracker | `sanctions-tracker` | 💡 | OFAC/EU/UK designations, frozen assets, secondary effects |
| Press freedom | `press-freedom` | 💡 | Journalist killings, internet shutdowns, regulatory chill |

## Tier 5 — Structural improvements (not new trackers)

These amplify existing tracker value rather than adding new ones.

| Improvement | Status | Why |
|---|---|---|
| Latam series grouping | 💡 | Group all 8 Latam countries under `series.id: latam-countries` with a hub for regional navigation |
| `/compare` page | 💡 | Side-by-side 2–3 tracker view (AMLO vs Sheinbaum, AR vs CL economy) |
| Migration corridors globe layer | 💡 | Visual layer connecting linked trackers (VE→CO→PE→CL, NCA→MX→US) |
| "On This Day" | 💡 | Daily cronological view across 1300+ events in tracker timelines |
| Tracker request voting | 🚧 | See `/vote` mechanism — community input on Tier 2-5 priorities |
| Per-tracker subscription | 💡 | Email or Telegram digest for a specific tracker |
| Embed widgets | 💡 | iframe-able mini-trackers for partner sites |

## How priorities get set

1. **Tier 1** — strategic gaps the maintainer identifies (world-relevant, no current coverage). No vote.
2. **Tier 2-4** — open to community vote at `/vote`. Candidates that cross the vote threshold graduate to 🚧 in batches.
3. **Tier 5** — driven by usage data + roadmap alignment. Vote-eligible if shaped as a tracker, otherwise maintainer-prioritized.

## Vote threshold and "winning"

A candidate **graduates** (becomes eligible to ship) when it crosses **10 votes**.

- 1 vote = 1 unique GitHub account interacting with the candidate's `tracker-vote` issue:
  the issue author, anyone who reacts with 👍 on the issue, or anyone who comments with `+1` / 👍.
- The tally workflow runs nightly and on every issue event, then writes `public/_tracker-votes/tally.json`.
- When a candidate crosses 10 votes for the first time, the workflow opens a `[Graduate] tracker: <slug>`
  issue with the `graduation` label, listing voters and what to dispatch next.
- Multiple candidates can graduate in the same window — the maintainer ships them in vote-rank order
  (highest count first), capped at 1–2 per Tier 1-style batch to keep deploys reviewable.
- Threshold is a constant in `src/pages/vote.astro` (`VOTE_THRESHOLD = 10`) and
  `.github/workflows/tally-tracker-votes.yml` (env `VOTE_THRESHOLD`). Adjust both together.

## Process for graduating a backlog item

1. Idea (`💡`) → spec it. Either an issue or a `docs/superpowers/specs/<date>-<slug>.md`.
2. Spec ✓ → backlog (`📋`) — eligible for vote at `/vote`.
3. Crosses threshold → workflow files a `[Graduate]` issue → mark `🚧` in this file.
4. Maintainer dispatches `init-tracker.yml` with topic, start date, region.
5. Init+seed succeed → shipped (`✅`). Close the `[Graduate]` and `[Vote]` issues.

## Voting integration

The `/vote` page is fed by the `📋` rows in this file. To add a new candidate, append a row with `📋` status and a one-line "why". The vote tally is a JSON file at `public/_tracker-votes/votes.json`, updated via a small API endpoint (see implementation in `src/pages/api/vote.ts`).
