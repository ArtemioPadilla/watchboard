---
title: Social Command Center
date: 2026-04-01
status: draft
---

# Social Command Center — Design Spec

Replaces the current `generate-social-drafts.ts` + `post-social.ts` pipeline with an AI-curated, budget-aware, multi-type, multi-language social media system with a review dashboard on the Watchboard website.

## Core Philosophy

The AI is a **content strategist**, not a tweet factory. It receives all tracker data for the day, knows the remaining budget, reads historic performance, and decides what is worth posting. Quality over volume.

## 1. Content Strategy Engine

### 1.1 AI as Curator

A single LLM call per day receives:

- **All tracker digests** for the day (every non-draft tracker's `digests.json` entry)
- **All tracker data** summary (KPIs, key events, casualty changes, econ shifts)
- **Remaining monthly budget** (from `public/_social/budget.json`)
- **Historic tweet performance** (from `public/_social/history.json` — UTM click-throughs + embedded tweet engagement)
- **Already-posted tweets** (to avoid duplication and track recency per tracker)
- **Current date context** (day of week, holidays, awareness days)

The AI outputs a curated list of tweet drafts — only what's worth posting given the budget and data.

### 1.2 Budget Awareness

- **Default target**: $1.00/month (configurable in `social-config.json`)
- **X API pricing** (pay-per-use):
  - Content create (post): $0.01/request
  - Media create (image upload): $0.01/request
  - Text-only tweet: $0.01
  - Tweet + uploaded image: $0.02
  - memegen.link meme tweet (URL, no upload): $0.01
  - Thread of N tweets: $0.01 × N
- **$1.00/month ≈ 100 tweets ≈ ~3.3 tweets/day**
- The AI prompt includes: `You have $X.XX remaining this month. Each text tweet costs $0.01, each image tweet costs $0.02, each thread tweet costs $0.01 per tweet in the thread. Prioritize impact-per-dollar.`
- Budget is tracked in `public/_social/budget.json`:
  ```json
  {
    "monthlyTarget": 1.00,
    "currentMonth": "2026-04",
    "spent": 0.42,
    "tweetsPosted": 38,
    "remaining": 0.58
  }
  ```

### 1.3 Character-Aware Generation (No Truncation)

**Critical**: The AI must generate text that fits within 280 characters natively. No truncation, no ellipsis. The prompt tells the AI:

- Twitter wraps every URL to 23 characters (t.co)
- Hashtags count toward the limit
- Line breaks count as 1 character each
- The AI must calculate and respect the exact budget:
  - `280 - 23 (link) - (hashtag chars) - 4 (spacing) = available for body text`
- For threads: each tweet in the thread has its own 280-char budget
- The judge verifies character count and rejects any tweet that exceeds 280 weighted characters

### 1.4 Tweet Types

The AI chooses the most appropriate type(s) based on the day's data:

| Type | Voice | When to use | Image |
|------|-------|-------------|-------|
| **Digest** | Analyst | Daily tracker summary, routine updates | Optional stat card (satori) |
| **Breaking** | Journalist | Significant new development, casualties, strikes | Stat card with key number |
| **Hot Take** | Edgy commentary | Contradictions in data, surprising patterns | None |
| **Thread** | Journalist | Complex story needing context (3-7 tweets) | Optional on first tweet |
| **Data Viz** | Analyst | Interesting trend, week-over-week change | Chart card (satori) |
| **Meme** | Witty | Absurd contradictions, relatable moments | memegen.link |

The AI is not required to produce all types every day. Some days may be 3 digests. Some days may be 1 thread + 1 meme. Budget and newsworthiness decide.

### 1.5 Voice / Persona

Mixed persona system — voice is chosen per tweet, not globally:

- **Analyst**: Authoritative, sharp, data-first. "Here's what the numbers say."
- **Journalist**: Accessible, incisive, narrative. "Here's what happened and why it matters."
- **Edgy commentary**: Provocative, punchy, contrarian. "Everyone's wrong about X."
- **Witty**: Casual, humorous, relatable. Memes, analogies, pop culture references.

The AI selects the voice based on tweet type and content. The judge evaluates voice consistency.

## 2. Multi-Language Support

### 2.1 Languages

Synced with website i18n: `en`, `es`, `fr`, `pt` (from `SUPPORTED_LOCALES` in `src/i18n/translations.ts`).

### 2.2 Language Strategy

The AI decides which languages to publish each tweet in based on:

- **Tracker region relevance**: Iran conflict → en (primary), es, fr, pt. Ayotzinapa → es (primary), en. Fukushima → en, fr, pt.
- **Budget**: at $0.01/tweet, posting in 4 languages costs 4x. The AI may choose to only translate high-impact tweets.
- **Each language version is a separate tweet** (separate API call, separate cost). Not a translation — a rewrite adapted to the audience.

Translation quality guidelines (same as existing `translate-data.yml`):
- Spanish: Latin American Spanish, not Castilian
- Keep proper nouns, org names, acronyms untranslated
- Preserve hashtags in original form

### 2.3 Language in Dashboard

The Social Command Center shows a language toggle (EN/ES/FR/PT). Switching languages shows the localized version of each tweet in the X preview. Each language variant can be independently approved/rejected.

## 3. Scheduling

### 3.1 Time Slots

Tweets are distributed across the day via GitHub Actions cron jobs:

| Slot | UTC | Audience peak |
|------|-----|--------------|
| Morning | 08:00 | Europe morning, Americas late night |
| Midday | 13:00 | Americas morning, Europe afternoon |
| Evening | 18:00 | Americas afternoon, Europe evening |
| Night | 22:00 | Americas evening, Asia morning |

The nightly data update (14:00 UTC) generates all drafts for the next day with `publishAt` timestamps. A lightweight cron workflow (`post-social-queue.yml`) runs at each slot, checks the queue, and posts due tweets.

### 3.2 Queue File

`public/_social/queue-YYYY-MM-DD.json`:
```json
[
  {
    "id": "uuid",
    "type": "digest",
    "voice": "analyst",
    "tracker": "iran-conflict",
    "lang": "en",
    "text": "Day 33 of the Iran-US/Israel conflict...",
    "hashtags": ["#IranConflict", "#Watchboard"],
    "link": "https://watchboard.dev/iran-conflict/?utm_source=x&utm_medium=digest&utm_campaign=2026-04-01",
    "image": null,
    "memegenUrl": null,
    "publishAt": "2026-04-01T08:00:00Z",
    "status": "pending_review",
    "estimatedCost": 0.01,
    "judge": {
      "score": 0.92,
      "verdict": "PUBLISH",
      "comment": "Clean analyst tone. All claims verified. Budget healthy, no Iran duplication today.",
      "factChecks": [
        { "claim": "170+ targets", "status": "verified", "source": "events data (172 strikes)" },
        { "claim": "$4.02/gal", "status": "verified", "source": "econ.json gasPrice" }
      ]
    },
    "threadTweets": null,
    "tweetId": null,
    "postedAt": null
  }
]
```

Status flow: `auto_approved` | `pending_review` → `approved` | `rejected` → `posted`

### 3.3 Cron Workflow

`.github/workflows/post-social-queue.yml`:
- Runs at 08:00, 13:00, 18:00, 22:00 UTC
- Reads `queue-YYYY-MM-DD.json` from repo (via `git pull`)
- Posts tweets where `publishAt <= now` and `status` is `approved` or `auto_approved`
- Updates `status` to `posted`, writes `tweetId` and `postedAt`
- Updates `budget.json` with cost
- Commits changes back to repo
- ~15 second job, minimal GitHub Actions minutes

## 4. LLM Judge

### 4.1 Role

Part of the same LLM call that generates the drafts. The AI evaluates its own output as a structured `judge` field on each draft. This keeps cost at zero (runs on Claude Code Action, Max subscription). The judge produces:

1. **Score** (0.0–1.0): overall quality/appropriateness
2. **Comment**: 1-2 sentence explanation of the score
3. **Fact checks**: every number, claim, and quote in the tweet verified against tracker data

### 4.2 Score + Verdict (Dual System)

Each tweet gets both a **score** and a **verdict**:

- **Score** (0.0–1.0): granular quality/appropriateness metric. Used for sorting, ranking, budget optimization, and tracking performance trends over time.
- **Verdict** (PUBLISH/REVIEW/HOLD/KILL): the actionable decision that drives the status flow and dashboard badge.

The score informs the verdict but they are not strictly 1:1. Context matters:

| Verdict | Badge | Status | When |
|---------|-------|--------|------|
| **PUBLISH** | Green | `auto_approved` | High quality + budget available + no duplication |
| **REVIEW** | Amber | `pending_review` | Decent quality but tone/humor/claims need human eyes |
| **HOLD** | Gray | `held` | Good tweet, but tracker already covered today or budget is tight — defer or drop |
| **KILL** | Red | `rejected` | Factual error, tone problem, brand risk, or not worth the cost |

Examples of score/verdict divergence:
- Score 0.92 + **HOLD**: great tweet, but 3rd Iran post today — diminishing returns
- Score 0.70 + **PUBLISH**: mediocre quality, but only Sudan tweet in 5 days — coverage balance matters
- Score 0.88 + **REVIEW**: high quality meme, but memes always require human approval

Thresholds are configurable in `social-config.json`.

### 4.3 Fact-Check Statuses

| Icon | Status | Meaning |
|------|--------|---------|
| ✓ green | `verified` | Matches tracker data exactly |
| ! amber | `warning` | Paraphrased, sourced from single source, or mild distortion |
| ? gray | `unverifiable` | Claim not present in tracker data, sourced from commentary |
| ✗ red | `failed` | Contradicts tracker data — auto-reject the tweet |

The judge cross-references against the tracker's JSON files (`events/*.json`, `kpis.json`, `casualties.json`, `claims.json`, `econ.json`, `political.json`, `meta.json`). Not external sources — deterministic and fast.

### 4.4 Fact-Check Failures

If any claim has status `failed`, the tweet is auto-rejected regardless of score. The AI should not publish verifiably false information.

## 5. Image Generation

### 5.1 Stat Cards (satori + resvg)

Same stack as existing `generate-social-preview.ts`. For breaking news and data viz tweets:

- Branded dark card with WATCHBOARD watermark
- Tracker name, key metric, delta, day count
- Gradient accent line at bottom
- Generated as PNG at tweet creation time, uploaded via X media API ($0.01 extra)

### 5.2 Memes (memegen.link)

Free API, no hosting needed. The AI picks:
- **Template** (drake, distracted-boyfriend, expanding-brain, etc.)
- **Top/bottom text** captions

URL format: `https://api.memegen.link/images/{template}/{top}/{bottom}.png`

The URL is included in the tweet as a link — X renders it as an image card. No media upload needed, so meme tweets cost $0.01 (not $0.02).

The judge evaluates humor quality and brand safety. Meme tweets always go to `pending_review`, never `auto_approved`.

### 5.3 No Image

Most tweets (digest, hot take) don't need an image. Text-only tweets are $0.01 and often perform better on X because the algorithm favors native text.

## 6. Hashtag Strategy

### 6.1 Rules

- **2 hashtags max per tweet**: 1 topic tag + `#Watchboard`
- **Topic tag**: chosen by the AI based on the tracker and content. Must be a tag with actual community usage (e.g., `#Iran`, `#Gaza`, `#Ukraine`, `#Sudan`, `#Taiwan` — NOT `#ConflictTracking` or `#IntelDashboard`)
- **Threads**: hashtags only on the last tweet
- **Memes**: zero hashtags — rely on virality
- The AI is told: "Use exactly 2 hashtags for standard tweets (1 relevant topic + #Watchboard). For threads, hashtags on last tweet only. For memes, no hashtags."

## 7. Performance Analytics (Free)

### 7.1 UTM Click Tracking

Every tweet link includes UTM parameters:
```
https://watchboard.dev/{tracker}/?utm_source=x&utm_medium={type}&utm_campaign={date}&utm_content={tweet_id}
```

Watchboard's existing analytics (or a lightweight solution like Plausible/Umami) tracks which tweets drive actual site visits. This data is the primary performance signal for the AI.

### 7.2 Embedded Tweet Archive

After posting, tweet IDs are stored in `public/_social/history.json`. The `/social/` page renders official X embeds using Twitter's free oEmbed API. Engagement metrics (likes, reposts, views) are visible in the embeds — no API read cost.

### 7.3 History File

`public/_social/history.json`:
```json
[
  {
    "tweetId": "1907...",
    "date": "2026-04-01",
    "tracker": "iran-conflict",
    "type": "digest",
    "voice": "analyst",
    "lang": "en",
    "text": "Day 33 of the Iran-US/Israel conflict...",
    "cost": 0.01,
    "utmClicks": 47,
    "publishedAt": "2026-04-01T08:00:12Z"
  }
]
```

The `utmClicks` field is updated periodically from analytics data (manual or automated). The AI reads this file to learn what works.

## 8. Social Command Center Dashboard

### 8.1 Route

`/social/` — a new page on Watchboard, same pattern as `/metrics/`.

### 8.2 Architecture (No Server)

- Static page deployed to GitHub Pages
- Reads queue/history/budget from GitHub API (`GET /repos/:owner/:repo/contents/public/_social/...`)
- Approve/reject actions write back via GitHub API (`PUT /repos/:owner/:repo/contents/...`)
- Auth: GitHub PAT stored in `localStorage` (only the owner can approve — everyone else sees read-only)
- GitHub is the database — version history and audit trail for free

### 8.3 Dashboard Layout

**Header**: SOCIAL COMMAND CENTER + date badge + queue stats (queued/auto/review/posted) + auth status

**Cost bar**: X API plan info, monthly usage meter, today's spend, daily target, "View cost history" link

**Filters**: All | Pending | Auto | Posted + type filters (Digest, Breaking, Thread, Hot Take, Meme, Data Viz) + language toggle (EN/ES/FR/PT)

**Cards** (50/50 split per card):
- **Left panel** (Watchboard chrome):
  - Type badge + tracker name + voice tag
  - Judge score bar + auto/review badge
  - **LLM Judge box**: commentary + fact checks with ✓/!/? icons
  - Language status indicators
  - Per-tweet cost estimate
  - Approve / Edit / Reject buttons
- **Right panel** (pixel-accurate X dark-mode preview):
  - Real X font stack, colors, SVG icons from X DOM
  - Avatar, display name, verified badge, handle, timestamp
  - Tweet body with hashtag/link coloring
  - Image card (stat card, memegen meme, or chart) when applicable
  - Engagement bar (reply, repost, like, bookmark, share) with placeholder dashes
- **Checkbox** on each card for batch selection

**Threads**: collapsed by default (hook tweet + "Show all N tweets" toggle), expandable to full thread preview

**Bottom bar** (sticky):
- Selected count + pulsing indicator
- Estimated cost for selection
- Daily budget remaining with fill bar
- "Approve Selected" + "Publish Selected" buttons

### 8.4 Embedded Tweet Archive

Below the queue, or as a separate tab, the `/social/` page shows historic posted tweets as official X embeds (oEmbed). This serves as:
- Public portfolio of what was posted
- Free engagement metrics viewer
- Performance data source for the AI

## 9. Configuration

### 9.1 `social-config.json` (repo root)

```json
{
  "baseUrl": "https://watchboard.dev",
  "handle": "@watchboard",
  "budget": {
    "monthlyTarget": 1.00,
    "currency": "USD"
  },
  "apiCosts": {
    "contentCreate": 0.01,
    "mediaCreate": 0.01
  },
  "scheduling": {
    "slots": ["08:00", "13:00", "18:00", "22:00"],
    "timezone": "UTC"
  },
  "judge": {
    "autoApproveThreshold": 0.85,
    "reviewThreshold": 0.50,
    "memesAlwaysReview": true
  },
  "hashtags": {
    "brandTag": "#Watchboard",
    "maxPerTweet": 2,
    "threadsLastOnly": true,
    "memesNone": true
  },
  "languages": ["en", "es", "fr", "pt"],
  "tweetTypes": ["digest", "breaking", "hot_take", "thread", "data_viz", "meme"]
}
```

## 10. Workflow Integration

### 10.1 Draft Generation

Added as a new step in `update-data.yml` finalize phase (after data commit, before metrics):

1. Read all tracker digests for today
2. Read `budget.json` and `history.json`
3. Call LLM with the content strategist prompt (single call)
4. LLM returns curated tweet drafts with judge assessments
5. Write `queue-YYYY-MM-DD.json` to `public/_social/`
6. Commit

### 10.2 Posting

New workflow `.github/workflows/post-social-queue.yml`:
- Cron: `0 8,13,18,22 * * *`
- Reads queue, posts due tweets, updates queue + budget + history
- Commits changes

### 10.3 Weekly Digest

Keep existing `weekly-digest.yml` but adapt to use the new system:
- The weekly thread is generated as a `thread` type in the queue
- Budget-aware (a 10-tweet thread costs $0.10)

## 11. Migration from Current System

### 11.1 Files to Replace

- `scripts/generate-social-drafts.ts` → new `scripts/generate-social-queue.ts`
- `scripts/post-social.ts` → new `scripts/post-social-queue.ts`
- `BASE_URL` constant → read from `social-config.json`

### 11.2 Files to Add

- `social-config.json`
- `public/_social/budget.json`
- `public/_social/history.json`
- `src/pages/social.astro` (dashboard page)
- `src/components/islands/SocialCommandCenter.tsx` (React island)
- `.github/workflows/post-social-queue.yml`

### 11.3 Files to Modify

- `.github/workflows/update-data.yml` — replace social drafts step with queue generation
- `.github/workflows/weekly-digest.yml` — adapt to queue format

### 11.4 Backward Compatibility

Existing `public/_social/YYYY-MM-DD.json` daily drafts can be archived or deleted. The new queue format is incompatible but the old files aren't consumed by anything else.

## 12. URL Configuration

All tweet links point to `watchboard.dev` (not `artemiop.com/watchboard`). This requires updating `BASE_URL` in the social scripts and `social-config.json`.
