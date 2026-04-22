# Watchboard Knowledge Graph — Design Spec
**Date:** 2026-04-22
**Status:** Approved for implementation planning
**Author:** ArtemIO (with Artemio Padilla)

---

## Problem

Watchboard has 64 trackers, each a data silo. Events, actors, and sources live in isolation. The same entity — JD Vance, Pakistan, Trump's tariffs, a CENTCOM strike — appears across multiple trackers with no shared identity or linkage. This creates three compounding gaps:

1. **Ingestion gap** — The AI agent writes each tracker independently. "JD Vance" becomes "VP Vance" becomes "the Vice President" across files. No canonical entity resolution.
2. **Query gap** — No cross-tracker search. Can't answer "what happened involving Pakistan this week?" or "which trackers moved together on April 20?"
3. **Intelligence gap** — Video, social, alerts, and analytics can't exploit relationships. Iran conflict and India-Pakistan conflict are part of the same geopolitical arc — the system doesn't know that.

---

## Goal

A **Knowledge Graph layer** that:
- Is the source of truth for entities, relationships, and cross-tracker event links
- Lives in git (auditable, versionable, AI-writable)
- Is indexed into Cloudflare D1 at deploy time for real-time queries
- Feeds the AI ingestion agent, the frontend, video scoring, and future analytics

---

## Architecture: Hybrid (Option C)

```
┌─────────────────────────────────────────────────────┐
│                  SOURCE OF TRUTH                    │
│                                                     │
│   knowledge/                                        │
│   ├── entities/          ← who/what                 │
│   │   ├── people/        ← jd-vance.json            │
│   │   ├── places/        ← pakistan.json            │
│   │   ├── orgs/          ← centcom.json             │
│   │   └── concepts/      ← nuclear-deterrence.json  │
│   ├── relationships/     ← how things connect       │
│   │   └── iran-india-pakistan-arc.json              │
│   └── event-links/       ← cross-tracker event ties │
│       └── 2026-04-21.json                           │
│                                                     │
│   Git commit = atomic update, full audit trail      │
└─────────────────────────────────────────────────────┘
          │
          │ build step (deploy)
          ▼
┌─────────────────────────────────────────────────────┐
│               READ INDEX (Cloudflare D1)            │
│                                                     │
│   tables: entities, entity_tracker_mentions,        │
│            relationships, event_links               │
│                                                     │
│   Queryable at runtime from Workers                 │
│   Rebuilt on every deploy — git is authoritative    │
└─────────────────────────────────────────────────────┘
          │
          │ REST API (Worker)
          ▼
┌──────────────────────────────────────────────────────┐
│                   CONSUMERS                          │
│                                                      │
│  • AI ingestion agent — entity resolution context   │
│  • Frontend — "Also tracked in..." sidebar          │
│  • Video scorer — tracker relationship bonus        │
│  • Social — "story arc" threading                   │
│  • Search — cross-tracker full-text index           │
│  • Alerts — correlated breaking news                │
└──────────────────────────────────────────────────────┘
```

---

## Data Model

### Entity (`knowledge/entities/{type}/{slug}.json`)

```json
{
  "id": "jd-vance",
  "type": "person",
  "name": "JD Vance",
  "aliases": ["VP Vance", "Vice President Vance", "J.D. Vance"],
  "role": "US Vice President (2025–)",
  "country": "US",
  "trackers": ["iran-conflict", "india-pakistan-conflict", "nato-us-tensions", "mexico-us-conflict"],
  "tags": ["US-government", "Trump-administration", "diplomacy"],
  "wikidata": "Q7549030",
  "lastSeen": "2026-04-21",
  "createdAt": "2026-03-01"
}
```

**Entity types:** `person`, `place`, `org`, `concept`, `event-series`

### Relationship (`knowledge/relationships/{slug}.json`)

```json
{
  "id": "middle-east-us-arc-2026",
  "label": "US Middle East Strategic Arc (2026)",
  "description": "Iran conflict, Gaza war, and Israel-Palestine operate as a single interconnected theater — US decisions in one directly affect the others.",
  "trackers": ["iran-conflict", "gaza-war", "israel-palestine", "nato-us-tensions"],
  "type": "geopolitical-arc",
  "strength": "strong",
  "tags": ["middle-east", "US-foreign-policy", "2026"],
  "createdAt": "2026-04-01",
  "updatedAt": "2026-04-21"
}
```

**Relationship types:** `geopolitical-arc`, `shared-actor`, `causal`, `escalation-chain`, `historical-parallel`

### Event Link (`knowledge/event-links/YYYY-MM-DD.json`)

```json
[
  {
    "id": "vance-islamabad-apr21-link",
    "date": "2026-04-21",
    "primaryEvent": {
      "tracker": "iran-conflict",
      "eventId": "vance-departs-islamabad-iran-uncertain-apr21"
    },
    "linkedEvents": [
      {
        "tracker": "india-pakistan-conflict",
        "eventId": "pakistan-hosts-us-iran-talks-apr21",
        "relation": "same-location"
      },
      {
        "tracker": "nato-us-tensions",
        "eventId": "us-diplomatic-bandwidth-stretched-apr21",
        "relation": "causal"
      }
    ],
    "entities": ["jd-vance", "pakistan", "islamabad", "iran"],
    "significance": "high"
  }
]
```

---

## D1 Schema (Read Index)

```sql
-- Canonical entities
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,          -- person | place | org | concept
  name TEXT NOT NULL,
  aliases TEXT,                -- JSON array
  data TEXT NOT NULL,          -- full JSON blob
  updated_at TEXT NOT NULL
);

-- Which trackers mention each entity
CREATE TABLE entity_tracker_mentions (
  entity_id TEXT NOT NULL,
  tracker_slug TEXT NOT NULL,
  last_seen TEXT,
  PRIMARY KEY (entity_id, tracker_slug)
);

-- Tracker relationships
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tracker_slugs TEXT NOT NULL, -- JSON array
  strength TEXT,
  data TEXT NOT NULL
);

-- Cross-tracker event links
CREATE TABLE event_links (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  primary_tracker TEXT NOT NULL,
  primary_event_id TEXT NOT NULL,
  linked_tracker TEXT NOT NULL,
  linked_event_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  entities TEXT,               -- JSON array of entity ids
  significance TEXT
);

-- Indexes for common queries
CREATE INDEX idx_entity_type ON entities(type);
CREATE INDEX idx_mentions_tracker ON entity_tracker_mentions(tracker_slug);
CREATE INDEX idx_links_date ON event_links(date);
CREATE INDEX idx_links_tracker ON event_links(primary_tracker);
```

---

## Components

### 1. `scripts/kg-build.ts` — Build step
Runs at deploy time. Reads all `knowledge/` JSON files, validates schema, writes to D1.

```
Input:  knowledge/entities/**/*.json
        knowledge/relationships/*.json
        knowledge/event-links/*.json
Output: D1 database (via wrangler d1 execute)
```

Runs after `npm run build`, before deploy.

### 2. `worker/api/kg.ts` — Query API
Cloudflare Worker endpoints:

| Endpoint | Description |
|---|---|
| `GET /api/kg/entity/:id` | Full entity with tracker list |
| `GET /api/kg/entities?type=person&tracker=iran-conflict` | Filter entities |
| `GET /api/kg/tracker/:slug/related` | Related trackers via relationships |
| `GET /api/kg/tracker/:slug/entities` | All entities mentioned in tracker |
| `GET /api/kg/event-links?date=2026-04-21` | Cross-tracker links for a date |
| `GET /api/kg/event-links?tracker=iran-conflict&days=7` | Recent links for a tracker |

### 3. `scripts/kg-extract.ts` — AI extraction helper
Utility used by the ingestion agent. Given a new event JSON, extracts candidate entities and checks D1 for existing matches (alias resolution). Returns canonical entity IDs to embed in the event.

Future: runs automatically as part of `update-data.yml` before writing events.

### 4. `knowledge/` — File structure
```
knowledge/
├── README.md               ← schema docs + contribution guide
├── entities/
│   ├── people/
│   ├── places/
│   ├── orgs/
│   └── concepts/
├── relationships/
└── event-links/
```

### 5. Frontend: `EntitySidebar` component
On each tracker page, a sidebar section: **"Key actors"** (entity chips linking to entity pages) + **"Related trackers"** (from relationships table).

Entity page (`/entity/jd-vance`): timeline of all events across trackers where this entity appears. Basic first version — no new design system needed, reuse existing tracker card components.

---

## AI Agent Integration

The ingestion agent (`update-data.yml`) gets a new pre-step:

```
Before writing events for a tracker:
1. Fetch entity context from D1: GET /api/kg/tracker/{slug}/entities
2. Include canonical entity names + aliases in the agent's system prompt
3. Agent writes events using canonical names → no more "VP Vance" vs "JD Vance"
4. After writing, agent calls kg-extract.ts to flag new entities for review
```

New entities go into a `knowledge/entities/_pending/` folder — human reviews before they become canonical. Keeps the graph clean without blocking ingestion.

---

## Video & Social Integration

`fetch-breaking.ts` gets a new scoring signal:

```typescript
// Relationship bonus: if two trackers in the top-scored list
// are part of the same relationship arc, bump their combined score
// (they tell a more complete story together)
if (sharedRelationship(candidateA, candidateB)) {
  candidateA.score += 15;
  candidateB.score += 15;
}
```

This means a day where Iran conflict + India-Pakistan + NATO all move together gets all three in the video — because the system knows they're part of the same arc.

---

## Implementation Phases

### Phase 1 — Foundation (Week 1-2)
- `knowledge/` folder structure + JSON schemas (Zod)
- Seed ~20 high-frequency entities (Trump, Vance, Pakistan, Iran, Netanyahu, Hamas, Putin, etc.)
- Seed ~5 core relationships (middle-east arc, south-asia arc, nato-us arc, us-latam, cartels)
- `kg-build.ts` script + D1 schema migration
- Basic Worker API endpoints (entity lookup, tracker related)
- CI: add kg-build to deploy workflow

### Phase 2 — Ingestion Integration (Week 3)
- `kg-extract.ts` entity extraction helper
- Agent prompt injection with entity context
- `_pending/` review flow for new entities
- Event links schema + manual seed for last 30 days

### Phase 3 — Frontend (Week 4-5)
- Entity sidebar on tracker pages ("Key actors", "Related trackers")
- Entity detail pages (`/entity/:id`)
- Cross-tracker event link display ("This connects to...")

### Phase 4 — Intelligence Layer (Week 6+)
- Video scoring relationship bonus
- Social "story arc" threading (related posts across trackers)
- Search index powered by entity + event-link data
- Breaking news correlation ("3 related trackers just updated")

---

## What This Is NOT (YAGNI)

- Not a public graph API — internal use first
- Not real-time event streaming — nightly build is enough for v1
- Not auto-populated from NLP — manual seeding + agent assistance, human review gate
- Not a replacement for tracker JSON — trackers stay as-is, KG is additive

---

## Success Criteria

- Phase 1: Deploy KG build step without breaking existing build
- Phase 2: Ingestion agent uses canonical names — zero "VP Vance" variants in new events
- Phase 3: "Related trackers" visible on 10+ tracker pages
- Phase 4: Video selects complementary trackers from same arc at least 2x/week

---

## Open Questions (deferred to implementation)

1. Entity page URL scheme: `/entity/jd-vance` vs `/people/jd-vance` vs nested under tracker
2. Auto-extraction model: use Claude Haiku in extraction step to keep cost low?
3. Wikidata integration depth: just store ID now, enrich later?
4. Event-link authorship: manual only in v1, or can the agent propose links?
