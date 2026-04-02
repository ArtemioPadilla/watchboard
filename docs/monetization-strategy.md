# Watchboard monetization strategy

This document defines the monetization plan for Watchboard, covering
the business model, pricing, target customers, infrastructure
requirements, onboarding flow, sales funnel, competitive positioning,
revenue projections, and phased implementation roadmap.

**Last updated:** April 1, 2026

---

## Executive summary

Watchboard monetizes through **Tracker-as-a-Service (TaaS)**: selling
custom, private intelligence trackers to organizations and individuals
who need ongoing monitoring of specific topics. The public open-source
dashboards serve as the marketing engine. Paid customers get private
trackers with AI-curated nightly updates, embeddable widgets, API
access, and premium features.

**Revenue target:** $500-10,000/month within 12 months.

**Core insight:** Watchboard's unique moat is the ability to spin up a
fully curated, AI-updated intelligence dashboard on *any topic* in
~25 minutes via GitHub Actions. No competitor can do this. Selling
that capability as a service is the fastest, highest-margin path to
revenue.

---

## Business model: Tracker-as-a-Service

### What you're selling

A continuously updated, AI-curated intelligence dashboard on any topic
the customer chooses. Each tracker includes:

- Dedicated dashboard URL (public or private)
- Interactive 2D map (Leaflet) with category filters
- 3D globe view (CesiumJS) with visual modes
- Timeline with historical eras and daily event updates
- KPI strip with trend indicators
- Casualty table, economic grid, claims matrix, political grid
  (as applicable to the topic)
- Source tier classification (Tier 1-4) with 4-pole media sourcing
- Nightly AI-powered data updates via the existing pipeline
- RSS feed for the tracker
- Embeddable widget for the customer's website
- Data export (JSON/API access)

### What it costs you to deliver

This is the key economic advantage. The marginal cost of each new
tracker is extremely low:

| Cost item | Amount | Notes |
|---|---|---|
| Claude Code Action (Max subscription) | $0 incremental | Already covered by existing subscription; nightly updates run within the existing pipeline |
| GitHub Pages hosting | $0 | Static site, no per-tracker cost |
| GitHub Actions compute | ~$0.01/run | Free tier covers ~2,000 min/month; each tracker update uses ~5-10 min |
| Your time (setup) | ~30 min | `init-tracker.yml` + configuration review |
| Your time (ongoing) | ~15 min/week per tracker | Quality review, customer communication |
| Domain/DNS | ~$12/year | One domain covers all trackers |

**Effective cost per tracker:** ~$5-15/month in time and compute.
Everything above that is margin.

### Why customers pay for this

Organizations currently pay $500-5,000+/month for intelligence
monitoring services from providers like:

| Provider | What they sell | Price range |
|---|---|---|
| Recorded Future | Threat intelligence feeds | $10K-50K/year |
| Dataminr | Real-time event detection | $5K-25K/year |
| Flashpoint | Risk intelligence | $15K-40K/year |
| Janes | Defense/security intelligence | $5K-20K/year |
| Sibylline | Geopolitical risk advisory | $2K-10K/year |
| Stratfor (FICO) | Geopolitical analysis | $3K-15K/year |

Watchboard offers a fraction of the depth of these enterprise
platforms, but at 1/10th to 1/100th the price, with a visual
dashboard those platforms don't provide. The target is the long tail
of organizations that need intelligence monitoring but can't afford
enterprise tools.

---

## Target customer segments

### Segment 1: Newsrooms and journalists ($200-500/month)

**Profile:** Small-to-mid-size newsrooms, independent journalists,
investigative reporting teams covering conflicts, disasters, or
political crises.

**Pain point:** Need structured, visual situation awareness for
stories they're covering. Currently rely on scattered RSS feeds,
Twitter/X lists, and manual tracking.

**What they buy:**
- Custom tracker on the crisis they're covering
- Embeddable widget for their publication's website
- Daily/weekly RSS digest for editorial planning
- Source-tiered data they can cite

**Sales channel:** Direct outreach to conflict/security journalists.
Showcase public trackers (Iran, Gaza, Ukraine) as examples. OSINT
Twitter/X community. Journalism conferences (IRE, GIJC).

**Example customers:**
- Bellingcat investigating a specific incident
- A regional newspaper covering a border conflict
- An independent journalist covering cartel violence

### Segment 2: Corporate security and risk teams ($300-1,000/month)

**Profile:** Security managers at companies with operations in
volatile regions. Travel risk managers. Supply chain risk analysts.

**Pain point:** Need to monitor geopolitical developments in regions
where their people, assets, or supply chains operate. Enterprise
tools are too expensive; manual monitoring is too slow.

**What they buy:**
- Custom tracker focused on their operational region
- KPIs tuned to their risk indicators (political stability,
  infrastructure status, conflict escalation)
- Notification alerts (future feature) when risk levels change
- Private dashboard (not publicly accessible)
- API access for integration with internal systems

**Sales channel:** LinkedIn outreach to security/risk managers.
Content marketing (blog posts about geopolitical risk monitoring).
Security industry events (ASIS, OSAC briefings).

**Example customers:**
- An oil company monitoring Niger Delta security
- A logistics firm tracking Red Sea/Houthi attacks
- A tech company monitoring Taiwan Strait tensions

### Segment 3: NGOs and research organizations ($100-300/month)

**Profile:** Human rights organizations, think tanks, academic
research groups tracking specific situations.

**Pain point:** Need structured data collection and visualization
for reports, advocacy, and research. Currently use spreadsheets and
manual documentation.

**What they buy:**
- Custom tracker for the situation they monitor
- Historical data backfill (seed pipeline)
- Data export for reports and publications
- Multi-language support for local teams
- Source-tiered citations they can reference

**Sales channel:** Direct outreach. NGO networks. Academic
conferences. Partnerships with journalism schools.

**Example customers:**
- Amnesty International tracking a specific detention campaign
- An academic group studying election violence patterns
- A diaspora organization monitoring a homeland crisis

### Segment 4: Individual OSINT practitioners ($50-150/month)

**Profile:** Independent security consultants, OSINT hobbyists,
retired intelligence professionals, security bloggers.

**Pain point:** Want professional-grade intelligence dashboards for
topics they follow. Currently cobble together tools manually.

**What they buy:**
- 1-3 custom trackers on topics they follow
- Self-serve setup (future: web-based tracker creation wizard)
- Community access and early feature previews
- API access for their own projects

**Sales channel:** OSINT Twitter/X community. Reddit
(r/OSINT, r/geopolitics). Discord servers. Awesome-OSINT list
(once re-accepted). Product Hunt launch.

---

## Pricing tiers

### Tier: Starter ($99/month or $948/year)

For individuals and small teams getting started.

**Includes:**
- 1 custom tracker
- Nightly AI updates (standard priority)
- Public dashboard URL
- Embeddable widget (Watchboard-branded)
- RSS feed
- JSON data export (manual, monthly)
- Email support (48h response)

**Target:** Individual OSINT practitioners, bloggers, small NGOs.

### Tier: Professional ($299/month or $2,868/year)

For organizations that need monitoring as a core workflow.

**Includes:**
- 3 custom trackers
- Nightly AI updates (standard priority)
- Public or private dashboard URLs
- Embeddable widgets (custom-branded, remove Watchboard logo)
- RSS feeds
- JSON data export (API access, real-time)
- Multi-language support (data translated to 1 additional language)
- Weekly PDF intelligence brief (auto-generated)
- Priority email support (24h response)
- Quarterly tracker review and optimization call

**Target:** Newsrooms, corporate security teams, research groups.

### Tier: Enterprise ($799/month or $7,668/year)

For organizations with multiple monitoring needs and integration
requirements.

**Includes:**
- 10 custom trackers
- Twice-daily AI updates (morning + evening cycle)
- Private dashboard URLs with custom subdomain
- White-label embeddable widgets
- Full API access with webhook notifications
- Multi-language support (up to 4 languages per tracker)
- Daily PDF intelligence briefs
- Custom KPI definitions and alert thresholds
- Dedicated Slack/Teams channel for support
- Monthly strategy call
- Custom data integrations (RSS ingestion from customer sources)
- SLA: 99.5% dashboard uptime, 4h response for critical issues

**Target:** Larger corporate security teams, government contractors,
major newsrooms.

### Tier: Custom (contact for pricing)

For unique requirements that don't fit standard tiers.

**Examples:**
- 50+ trackers for a government agency
- Real-time update frequency (not just nightly)
- On-premise deployment
- Custom AI model tuning for specific domains
- Dedicated infrastructure (separate GitHub org, isolated pipeline)
- Compliance requirements (data residency, audit logs)

### Add-ons (available with any tier)

| Add-on | Price | Description |
|---|---|---|
| Additional tracker | $79/month | Extra tracker beyond tier limit |
| Historical backfill | $199 one-time | Deep research + seed of historical data going back years |
| Additional language | $49/month per language | AI-translated data in additional locale |
| Custom globe presets | $149 one-time | Tailored 3D globe camera presets and cinematic sequences for the tracker's geography |
| Priority updates | $99/month | Twice-daily instead of nightly update cycle |
| Broadcast mode package | $199 one-time | TV-style broadcast overlay configured for customer's trackers |

### Pricing rationale

- **Starter at $99:** Low enough for individuals to justify, high
  enough to filter out tire-kickers. $99/month is less than a
  ChatGPT Team seat.
- **Professional at $299:** Sweet spot for small teams. A newsroom
  spending $299/month on intelligence monitoring is a rounding error
  in their budget.
- **Enterprise at $799:** Still 1/10th the cost of enterprise
  intelligence platforms. 10 trackers at $799 is $79.90 per tracker
  per month.
- **Annual discount:** ~17% discount for annual commitment (2 months
  free). Improves cash flow predictability.

---

## Revenue projections

### Conservative scenario (12 months)

| Month | Starter | Professional | Enterprise | MRR |
|---|---|---|---|---|
| 1-2 | 0 | 0 | 0 | $0 (building infrastructure) |
| 3 | 2 | 0 | 0 | $198 |
| 4 | 3 | 1 | 0 | $596 |
| 5 | 4 | 1 | 0 | $695 |
| 6 | 5 | 2 | 0 | $1,093 |
| 7 | 6 | 2 | 0 | $1,192 |
| 8 | 7 | 3 | 0 | $1,590 |
| 9 | 8 | 3 | 1 | $2,488 |
| 10 | 9 | 4 | 1 | $2,886 |
| 11 | 10 | 4 | 1 | $3,185 |
| 12 | 12 | 5 | 1 | $3,882 |

**Month 12 MRR:** ~$3,900 (12 Starter + 5 Professional + 1
Enterprise)
**Annual total:** ~$22,000

### Optimistic scenario (12 months)

If marketing catches and word-of-mouth kicks in:

| Month | Starter | Professional | Enterprise | MRR |
|---|---|---|---|---|
| 6 | 10 | 4 | 1 | $2,985 |
| 9 | 20 | 8 | 2 | $5,972 |
| 12 | 30 | 12 | 3 | $8,967 |

**Month 12 MRR:** ~$9,000
**Annual total:** ~$55,000

### Break-even analysis

| Expense | Monthly cost |
|---|---|
| Claude Max subscription | $200 |
| Domain + DNS | $1 |
| Vercel Pro (for API routes) | $20 |
| Stripe fees (~3%) | Variable |
| Email service (Resend/Postmark) | $20 |
| **Total fixed costs** | ~$241/month |

**Break-even:** 3 Starter customers or 1 Professional customer.

---

## Infrastructure requirements

### Phase 1: Manual operations (months 1-3)

Minimal infrastructure. Onboard customers manually using existing
GitHub Actions workflows.

**New infrastructure needed:**
- Payment: Stripe Checkout (hosted payment page, no custom UI needed)
- Landing page: `/pricing/` route in Astro
- Private trackers: separate GitHub repository
  (`watchboard-private`) with the same Astro codebase, deployed to
  Vercel (for private URL access control)
- Customer communication: email (can start with personal email)
- Contracts: simple terms of service page

**Workflow for new customer:**
1. Customer pays via Stripe Checkout link
2. You receive Stripe webhook notification
3. You manually run `init-tracker.yml` with customer's topic
4. You configure `tracker.json` with customer's requirements
5. Run `seed-tracker.yml` for historical backfill
6. Send customer their dashboard URL + embed code
7. Nightly pipeline auto-updates their tracker going forward

**Effort:** 1-2 weeks to set up Stripe + landing page + private repo.

### Phase 2: Semi-automated (months 3-6)

Reduce manual work as customer count grows.

**New infrastructure:**
- Auth: Clerk or Auth.js (gate private tracker access)
- Customer portal: simple dashboard showing their trackers, billing
  status, embed codes, API keys
- Automated provisioning: GitHub Actions workflow triggered by Stripe
  webhook that auto-creates tracker
- API routes: Astro API routes on Vercel for data export endpoints
- PDF generation: scheduled GitHub Action that generates weekly
  briefs using Puppeteer or Satori

**Architecture:**

```
Customer signs up (Stripe Checkout)
  |
  v
Stripe webhook --> GitHub Actions (create-customer-tracker.yml)
  |
  +-- init-tracker.yml (generate config)
  +-- seed-tracker.yml (backfill data)
  +-- Add to nightly update matrix
  |
  v
Customer portal (Astro + Clerk)
  |
  +-- Dashboard links
  +-- Embed code generator
  +-- API key management
  +-- Billing management (Stripe Customer Portal)
  +-- Download data exports
```

**Effort:** 2-3 weeks of development.

### Phase 3: Self-serve platform (months 6-12)

Full self-service tracker creation.

**New infrastructure:**
- Tracker creation wizard: web UI where customers describe their
  topic, select region, configure sections
- Real-time preview: show sample dashboard before purchase
- Automatic quality scoring: rate tracker data quality and flag
  issues
- Usage analytics: track dashboard views, API calls, embed
  impressions per customer
- Notification system: email/Slack/Telegram alerts when tracker
  data updates (leverages existing nightly pipeline)
- MCP server: expose customer tracker data as LLM tools

**Architecture:**

```
Customer creates tracker (web wizard)
  |
  v
Stripe payment confirmed
  |
  v
GitHub Actions auto-provisions
  |
  +-- AI generates tracker.json from customer description
  +-- Seeds historical data
  +-- Adds to nightly pipeline
  +-- Generates API key
  +-- Sends welcome email with links
  |
  v
Customer portal
  |
  +-- Tracker management (pause, configure, delete)
  +-- Analytics (views, API calls)
  +-- Notification preferences
  +-- Team member invitations
  +-- Billing + invoices
```

**Effort:** 4-6 weeks of development.

---

## Private tracker hosting architecture

The key technical decision is how to host private (non-public)
trackers. Three options:

### Option A: Separate Vercel deployment (recommended for Phase 1-2)

- Create `watchboard-private` repository
- Same Astro codebase, different `trackers/` directory
- Deploy to Vercel with Clerk auth middleware
- Private trackers only accessible to authenticated customer
- Vercel's Edge Middleware handles auth check before serving pages
- Customer trackers isolated by Clerk organization

**Pros:** Simple, Vercel handles auth + hosting, each customer gets
proper access control.
**Cons:** Two repositories to maintain, manual sync of codebase
changes.

### Option B: Single deployment with auth gating (Phase 3)

- All trackers (public + private) in one repository
- Tracker config gets `visibility: 'public' | 'private'` field
- Astro middleware checks auth for private tracker routes
- Public trackers served from GitHub Pages (free)
- Private trackers served from Vercel (auth-gated)

**Pros:** Single codebase, simpler maintenance.
**Cons:** More complex routing, need to handle mixed public/private
in the same build.

### Option C: Per-customer deployment (Enterprise only)

- Dedicated GitHub repository per enterprise customer
- Customer-specific domain (`intel.customerdomain.com`)
- Fully isolated infrastructure
- Customer can optionally self-host

**Pros:** Maximum isolation, compliance-friendly.
**Cons:** Highest maintenance burden, only viable for $799+/month
customers.

**Recommendation:** Start with Option A. Migrate to Option B as the
platform matures. Offer Option C only for Enterprise tier.

---

## Sales funnel

### Top of funnel: awareness

The 48 public trackers ARE the marketing engine. Every person who
views a public Watchboard dashboard is a potential customer.

**Channels:**

| Channel | Action | Expected impact |
|---|---|---|
| **OSINT Twitter/X** | Share tracker updates, visualizations, globe screenshots. Tag relevant analysts. | High -- OSINT community is tight-knit and shares tools aggressively |
| **Reddit** | Post to r/OSINT, r/geopolitics, r/dataisbeautiful, r/MapPorn | Medium -- drives traffic spikes |
| **Hacker News** | "Show HN: Watchboard" post | High -- single HN front page appearance can drive thousands of visits |
| **Product Hunt** | Launch with "AI-powered intelligence dashboard" positioning | Medium -- good for initial burst |
| **awesome-osint** | Resubmit once project has 30-50+ stars | Medium -- permanent discovery channel |
| **Blog** | Write about OSINT methodology, tracker creation, AI pipeline design | Long-term SEO, establishes credibility |
| **YouTube** | Screen recordings of 3D globe, broadcast mode, cinematic mode | High -- visual content performs well for this type of tool |
| **Conferences** | Present at OSINT meetups, IRE (investigative journalism), GIJC | High -- direct access to target customers |
| **Newsletter** | Weekly intelligence digest email (free) | Builds owned audience, converts to paid |

### Middle of funnel: consideration

**Actions that move visitors toward purchase:**

1. **"Create your own tracker" CTA** on every public dashboard --
   links to pricing page
2. **Free trial:** 14-day free trial of a Starter tracker
   (no credit card required, limited to 1 tracker)
3. **Live demo:** Bookable 15-minute demo call for Professional
   and Enterprise prospects
4. **Case studies:** "How [organization] uses Watchboard to monitor
   [topic]" (write these after first 3-5 customers)
5. **Comparison page:** "Watchboard vs. Recorded Future vs. Dataminr
   vs. manual monitoring" showing price/feature comparison

### Bottom of funnel: conversion

**Starter tier:** Self-serve. Stripe Checkout. Immediate access after
payment. Automated tracker provisioning (Phase 2+) or manual setup
within 24h (Phase 1).

**Professional tier:** Self-serve or sales-assisted. Optional 15-min
onboarding call to configure trackers. Stripe Checkout or invoice.

**Enterprise tier:** Sales-led. Discovery call to understand
requirements. Custom proposal. Annual contract with invoice billing.
Dedicated onboarding.

### Retention

**Churn prevention:**
- Nightly updates create a "data accumulation" moat -- the longer
  you subscribe, the more historical data your tracker has
- Weekly email digest keeps the product top-of-mind even when
  customers aren't actively viewing the dashboard
- Quarterly review calls for Professional/Enterprise help customers
  optimize their trackers
- Feature announcements and roadmap sharing make customers feel
  invested in the platform's future

**Expansion revenue:**
- Upsell additional trackers ("You're monitoring Iran -- want to add
  a Hezbollah tracker?")
- Upsell tier upgrades as needs grow
- Upsell add-ons (priority updates, additional languages, backfill)

---

## Competitive positioning

### Against enterprise intelligence platforms

| Dimension | Enterprise tools (Recorded Future, etc.) | Watchboard |
|---|---|---|
| Price | $5K-50K/year | $1.2K-9.6K/year |
| Setup time | Weeks-months | 25 minutes |
| Visual dashboard | Limited (mostly data feeds) | Full interactive map + 3D globe |
| Customization | Pre-built categories | Any topic the customer defines |
| Source methodology | Proprietary | Transparent (Tier 1-4 with citations) |
| Data updates | Real-time | Nightly (sufficient for most use cases) |
| Self-service | No | Yes (Starter/Professional) |

**Positioning:** "Enterprise intelligence quality at startup prices."

### Against World Monitor

| Dimension | World Monitor Pro | Watchboard TaaS |
|---|---|---|
| Model | Feature-gated SaaS | Custom topic trackers |
| Scope | Single global dashboard | Deep per-topic intelligence |
| Data | Raw API feeds (real-time) | AI-curated with source tiers |
| Customization | Choose from 5 variants | Any topic, any region, any time period |
| Pricing | Unknown (Pro tier) | $99-799/month |
| Target | General monitoring | Specific intelligence needs |

**Positioning:** "World Monitor shows you everything happening
everywhere. Watchboard goes deep on the specific topics you care
about."

### Against manual monitoring

| Dimension | Manual (RSS + spreadsheets) | Watchboard |
|---|---|---|
| Setup | Hours to days | 25 minutes |
| Maintenance | Daily manual work | Fully automated |
| Visualization | None (text-based) | Interactive maps, 3D globe, timelines |
| Source tracking | Ad hoc | Systematic Tier 1-4 classification |
| Historical data | Whatever you saved | Full timeline with daily events |
| Sharing | Screenshots, PDFs | Live dashboard URL, embeds, API |
| Cost | Your time ($0-????) | $99-799/month |

**Positioning:** "Stop spending hours on spreadsheets. Get an
AI-curated intelligence dashboard in 25 minutes."

---

## Open-source strategy

Monetization must not alienate the open-source community. The public
Watchboard remains fully open-source and free.

### What stays free forever

- All 48+ public trackers with full data
- The complete Astro codebase (MIT or similar license)
- All components: maps, globe, timeline, KPIs, everything
- The nightly AI update pipeline code
- The `init-tracker.yml` and `seed-tracker.yml` workflows
- Documentation, CLAUDE.md, contributing guide
- Self-hosting: anyone can fork and run their own instance

### What is paid

- **Managed service:** We run and maintain your custom tracker
- **Private hosting:** Access-controlled dashboards
- **SLA and support:** Guaranteed uptime and response times
- **Premium features** (future): AI chat analyst, notification
  alerts, PDF reports, priority updates
- **Convenience:** You don't have to manage infrastructure,
  configure pipelines, or debug AI outputs

### The open-core model

This is a standard open-core approach used by successful open-source
companies:

| Company | Open-source | Paid |
|---|---|---|
| GitLab | GitLab CE | GitLab EE (managed + features) |
| Supabase | Supabase OSS | Supabase Cloud (managed) |
| PostHog | PostHog OSS | PostHog Cloud (managed + features) |
| Grafana | Grafana OSS | Grafana Cloud (managed + enterprise) |

Watchboard follows the same pattern: the software is free, the
managed service is paid. This is well-understood and respected in the
open-source community.

### Community benefits of monetization

Revenue enables:
- More frequent updates and new features
- Better documentation and onboarding
- Community support (Discord, forum)
- Bug bounty program
- Contributor rewards
- Conference sponsorships

---

## Marketing assets to build

### Website pages

| Page | Purpose | Priority |
|---|---|---|
| `/pricing/` | Tier comparison with CTAs | Phase 1 |
| `/for/newsrooms/` | Segment-specific landing page | Phase 1 |
| `/for/security-teams/` | Segment-specific landing page | Phase 1 |
| `/for/researchers/` | Segment-specific landing page | Phase 2 |
| `/demo/` | Interactive demo request form | Phase 1 |
| `/blog/` | Content marketing hub | Phase 2 |
| `/case-studies/` | Customer success stories | Phase 2 |
| `/compare/` | Comparison vs. alternatives | Phase 2 |
| `/docs/api/` | API documentation for paid customers | Phase 2 |

### Content calendar (first 3 months)

| Week | Content | Channel |
|---|---|---|
| 1 | "How Watchboard's AI pipeline curates intelligence data" | Blog + Twitter |
| 2 | Globe cinematic mode demo video | YouTube + Twitter |
| 3 | "Source tier classification: why it matters for OSINT" | Blog + Reddit |
| 4 | "Show HN: Watchboard" | Hacker News |
| 5 | "Tracking the Iran conflict with open-source intelligence" | Blog + Twitter |
| 6 | Product Hunt launch | Product Hunt |
| 7 | "How to build your own OSINT dashboard in 25 minutes" | Blog + YouTube |
| 8 | Customer case study #1 | Blog + LinkedIn |
| 9 | Weekly intelligence digest launch | Newsletter |
| 10 | "Watchboard vs. manual monitoring: a comparison" | Blog + Reddit |
| 11 | Conference talk submission (IRE, GIJC, or OSINT meetup) | In-person |
| 12 | "2026 mid-year geopolitical risk review" using Watchboard data | Blog + Newsletter |

---

## Implementation roadmap

### Phase 1: Foundation (weeks 1-4)

**Goal:** Accept first payment, deliver first custom tracker.

| Task | Effort | Details |
|---|---|---|
| Create Stripe account + product/price objects | 2 hours | 3 products (Starter, Professional, Enterprise) with monthly + annual prices |
| Build `/pricing/` page | 1 day | Astro page with tier comparison, Stripe Checkout links, FAQ |
| Build `/for/newsrooms/` landing page | 1 day | Segment-specific messaging, examples, CTA |
| Build `/for/security-teams/` landing page | 1 day | Segment-specific messaging, examples, CTA |
| Set up `watchboard-private` repository | 1 day | Fork codebase, configure Vercel deployment, set up Clerk auth |
| Create customer onboarding checklist | 2 hours | Template for intake: topic description, region, key actors, time period, language |
| Write Terms of Service | 2 hours | Simple ToS covering service description, payment terms, data ownership, cancellation |
| Set up Stripe webhook handler | 4 hours | GitHub Actions workflow triggered by Stripe `checkout.session.completed` event |
| Create customer tracker provisioning workflow | 4 hours | GitHub Actions workflow that runs init + seed for new customer trackers |
| Create `CONTRIBUTING.md` | 2 hours | Community contribution guide for open-source credibility |
| Create `LICENSE` file | 30 min | MIT or Apache 2.0 for the open-source codebase |
| Announce pricing on Twitter/X | 1 hour | Thread explaining the model, link to pricing page |
| **Total** | **~2 weeks** | |

### Phase 2: Growth (weeks 5-12)

**Goal:** Reach 5-10 paying customers, automate onboarding.

| Task | Effort | Details |
|---|---|---|
| Build customer portal | 1 week | Astro + Clerk app: tracker list, embed codes, API keys, billing link |
| Automated tracker provisioning | 3 days | Stripe webhook triggers full pipeline without manual intervention |
| API endpoints for data export | 3 days | Astro API routes on Vercel: `/api/v1/trackers/{slug}/events`, `/api/v1/trackers/{slug}/kpis` |
| Weekly PDF brief generation | 3 days | GitHub Action that generates PDF from tracker data using Puppeteer/Satori |
| Blog setup (Astro content collections) | 1 day | `/blog/` with first 3-4 posts |
| Product Hunt launch | 1 day | Prepare assets, schedule launch |
| Hacker News "Show HN" post | 1 hour | Write compelling post, time for US morning |
| Newsletter setup (Resend or Buttondown) | 2 hours | Weekly intelligence digest from public tracker data |
| awesome-osint resubmission | 1 hour | With improved stars, live site link, shorter description |
| **Total** | **~3-4 weeks** | |

### Phase 3: Scale (weeks 13-26)

**Goal:** Reach 15-25 paying customers, self-serve creation.

| Task | Effort | Details |
|---|---|---|
| Self-serve tracker creation wizard | 2 weeks | Web UI: describe topic, select region, configure sections, preview, pay |
| Notification system (email + Slack) | 1 week | Triggered from nightly pipeline when tracker data changes significantly |
| AI chat analyst per tracker | 1 week | React island + API route, uses tracker data as context |
| Usage analytics dashboard | 3 days | Track views, API calls, embed impressions per customer |
| Team/organization support | 3 days | Multiple users per account via Clerk organizations |
| Comparison landing page | 1 day | "Watchboard vs. Recorded Future vs. Dataminr vs. manual monitoring" |
| Case study pages (3-5) | 3 days | Customer success stories with screenshots and quotes |
| SEO optimization | 2 days | Meta tags, structured data, sitemap improvements |
| **Total** | **~5-6 weeks** | |

### Phase 4: Mature (weeks 27-52)

**Goal:** $5K-10K MRR, sustainable growth.

| Task | Effort | Details |
|---|---|---|
| White-label deployments | 2 weeks | Custom domains, branding, isolated infrastructure |
| MCP server for API access | 3 days | Expose tracker data as LLM tools for customer integration |
| Real-time data layer (select sources) | 2 weeks | USGS earthquakes, OpenSky flights via Astro API routes |
| Desktop app (Tauri) | 2 weeks | Wrap Watchboard in native shell, offline access |
| On-device ML (semantic search) | 1 week | ONNX embeddings for cross-tracker event search |
| Prediction market integration | 3 days | Polymarket widget per tracker |
| Referral program | 2 days | Existing customers get 1 month free for each referral |
| Annual review + strategy refresh | Ongoing | Update pricing, roadmap, and strategy based on learnings |

---

## Key metrics to track

### Business metrics

| Metric | Target (month 6) | Target (month 12) |
|---|---|---|
| MRR | $1,000 | $4,000-9,000 |
| Paying customers | 5-8 | 15-30 |
| Churn rate | <10%/month | <5%/month |
| Average revenue per customer | $200 | $250 |
| Customer acquisition cost | <$50 | <$100 |
| Lifetime value (LTV) | >$1,000 | >$2,500 |
| LTV/CAC ratio | >10x | >10x |

### Product metrics

| Metric | Target | Measurement |
|---|---|---|
| Public dashboard monthly visitors | 5,000+ | Vercel/GitHub Pages analytics |
| GitHub stars | 100+ | GitHub |
| Tracker creation time | <30 min | Pipeline logs |
| Data update success rate | >95% | Ingestion metrics dashboard |
| Customer dashboard weekly active usage | >60% | Usage analytics |
| API calls per customer/month | Varies by tier | API route logs |
| Embed impressions | Track per customer | Embed analytics |

### Marketing metrics

| Metric | Target | Measurement |
|---|---|---|
| Pricing page conversion rate | >2% | Vercel analytics |
| Free trial to paid conversion | >20% | Stripe + analytics |
| Newsletter subscribers | 500+ by month 6 | Email service |
| Blog monthly visitors | 1,000+ by month 6 | Analytics |
| Twitter/X followers | 500+ by month 6 | Twitter |

---

## Risk mitigation

### Risk: Low demand

**Mitigation:** Validate before building infrastructure. Manually
onboard the first 3-5 customers before investing in automation. If
nobody wants to pay $99/month after 2 months of outreach, revisit
the model before spending more development time.

**Validation approach:**
1. Create pricing page with Stripe Checkout links
2. Post to OSINT community: "I'm offering custom intelligence
   dashboards for $99/month"
3. If 3+ people express serious interest within 2 weeks, proceed
4. If not, test lower price points or different value propositions

### Risk: Claude Code Action costs increase

**Mitigation:** The nightly pipeline currently runs free on Claude
Max subscription. If Anthropic changes pricing:
- Each tracker update costs ~$0.50-2.00 in API tokens if paying
  per-call
- At $99/month per tracker, even $60/month in API costs leaves
  healthy margin
- Optimize prompts and reduce unnecessary updates
- Batch updates: group trackers with similar topics

### Risk: AI data quality issues embarrass paying customers

**Mitigation:**
- The existing fix agent, Zod validation, and build gate catch most
  errors
- Add a customer-facing data quality score per tracker
- Implement human-in-the-loop review for high-tier customers
- Create a "data quality SLA" -- if accuracy drops below threshold,
  customer gets credit
- Manual spot-check of customer tracker data weekly

### Risk: Competitor copies the model

**Mitigation:**
- World Monitor could add topic-specific dashboards, but their
  architecture (real-time SPA) makes it structurally harder
- First-mover advantage in the "managed tracker" space
- Brand and community goodwill from open-source project
- Switching cost: accumulated historical data is hard to replicate
- Speed of execution: keep shipping faster than competitors can copy

### Risk: Customer data sensitivity

**Mitigation:**
- Clear data ownership terms: customers own their data
- Private trackers are access-controlled (Clerk auth)
- No customer data in the public repository
- Option for enterprise customers to self-host
- GDPR compliance: data deletion on cancellation

### Risk: Single maintainer bus factor

**Mitigation:**
- The entire system is automated (nightly pipeline runs unattended)
- All infrastructure is code (GitHub Actions, Astro, Stripe webhooks)
- Documentation is comprehensive (CLAUDE.md, competitive analysis)
- Codebase is open-source (community can maintain if needed)
- At $5K+ MRR, hire a part-time contractor for support

---

## Legal and compliance

### Terms of service (key provisions)

- Service description: AI-curated intelligence dashboards
- Data accuracy disclaimer: data is AI-generated, not human-verified
  (unless human review add-on is purchased)
- Uptime SLA: best-effort for Starter/Professional, 99.5% for
  Enterprise
- Cancellation: any time, access ends at billing period end
- Data retention: customer data retained 30 days after cancellation,
  then deleted
- Data ownership: customer owns their tracker configuration and any
  custom data they provide; AI-generated content is licensed to them
- Prohibited use: no use for targeting individuals, harassment,
  illegal surveillance, or weapons development
- Limitation of liability: standard SaaS limitation

### Privacy policy

- Collect: name, email, payment info (via Stripe), usage analytics
- Do not sell customer data
- GDPR compliance: right to access, rectify, delete
- Cookie usage: minimal (auth session, analytics)

### Licensing

- Open-source codebase: MIT License (permissive, encourages
  adoption)
- Paid service: SaaS terms (separate from code license)
- Customer data: customer retains ownership
- AI-generated content: licensed to customer, no exclusivity
  (same AI can produce similar content for other topics)

---

## Appendix A: Customer onboarding template

Use this template when setting up a new customer tracker.

```markdown
# Customer tracker intake form

## Customer information
- Company/Organization:
- Contact name:
- Contact email:
- Tier: Starter / Professional / Enterprise
- Billing: Monthly / Annual

## Tracker configuration
- Topic description (1-2 paragraphs):
- Geographic region (country/region):
- Key actors (people, organizations, groups):
- Time period start date:
- Time period end date (or "ongoing"):
- Primary language:
- Additional languages:

## Dashboard preferences
- Visibility: Public / Private
- Sections to include:
  [ ] Timeline + events
  [ ] Interactive map
  [ ] 3D globe
  [ ] KPI strip
  [ ] Casualty table
  [ ] Economic indicators
  [ ] Claims matrix
  [ ] Political figures
  [ ] Military operations
- Custom KPIs (if any):
- Custom map categories (if any):
- Globe camera presets (if any):

## Data sources
- Preferred Tier 1 sources:
- Preferred Tier 2 sources:
- Customer-provided RSS feeds (if any):
- Specific data to prioritize:

## Delivery
- Dashboard URL preference:
- Embed needed: Yes / No
- API access needed: Yes / No
- PDF briefs: Weekly / Daily / None
- Notification alerts: Email / Slack / None
```

## Appendix B: Email templates

### Welcome email (Starter tier)

```
Subject: Your Watchboard tracker is live

Hi [Name],

Your custom intelligence tracker is ready:

Dashboard: [URL]
Topic: [Topic description]
Update schedule: Nightly (data refreshes by 8:00 AM UTC)

Quick start:
- Bookmark your dashboard URL
- Subscribe to your RSS feed: [RSS URL]
- Copy your embed code: [embed snippet]

Your tracker will automatically update every night with
AI-curated intelligence from Tier 1-4 sources. Historical
data has been backfilled to [start date].

Questions? Reply to this email.

-- Watchboard
```

### Welcome email (Professional tier)

```
Subject: Your Watchboard trackers are live

Hi [Name],

Your [N] custom intelligence trackers are ready:

1. [Tracker 1 name]: [URL]
2. [Tracker 2 name]: [URL]
3. [Tracker 3 name]: [URL]

Your API key: [key]
API docs: [URL]

Weekly PDF briefs will arrive in your inbox every Monday
at 8:00 AM UTC, starting next week.

I'd like to schedule a 15-minute onboarding call to make
sure your trackers are configured exactly how you need them.
Here's my calendar: [booking link]

-- Watchboard
```

## Appendix C: Stripe product configuration

```
Products:
  - name: "Watchboard Starter"
    prices:
      - $99/month (recurring)
      - $948/year (recurring, saves $240)
    metadata:
      tier: starter
      trackers: 1
      update_frequency: nightly

  - name: "Watchboard Professional"
    prices:
      - $299/month (recurring)
      - $2,868/year (recurring, saves $720)
    metadata:
      tier: professional
      trackers: 3
      update_frequency: nightly

  - name: "Watchboard Enterprise"
    prices:
      - $799/month (recurring)
      - $7,668/year (recurring, saves $1,920)
    metadata:
      tier: enterprise
      trackers: 10
      update_frequency: twice_daily

Add-ons:
  - name: "Additional Tracker"
    price: $79/month (recurring)
  - name: "Historical Backfill"
    price: $199 (one-time)
  - name: "Additional Language"
    price: $49/month (recurring)
  - name: "Priority Updates"
    price: $99/month (recurring)
  - name: "Custom Globe Presets"
    price: $149 (one-time)
  - name: "Broadcast Mode Package"
    price: $199 (one-time)
```

## Appendix D: First 30 days action plan

| Day | Action |
|---|---|
| 1 | Create Stripe account, configure products and prices |
| 2 | Build `/pricing/` page with tier comparison |
| 3 | Build `/for/newsrooms/` landing page |
| 4 | Build `/for/security-teams/` landing page |
| 5 | Add LICENSE (MIT) and CONTRIBUTING.md |
| 6 | Set up `watchboard-private` repo on GitHub |
| 7 | Deploy private repo to Vercel with Clerk auth |
| 8 | Write Terms of Service and Privacy Policy pages |
| 9 | Create Stripe webhook -> GitHub Actions integration |
| 10 | Create customer onboarding workflow |
| 11 | Test full flow: payment -> tracker creation -> delivery |
| 12 | Write first blog post: "How Watchboard works" |
| 13 | Post to OSINT Twitter/X announcing paid trackers |
| 14 | Post to r/OSINT and r/geopolitics |
| 15 | Reach out to 10 conflict journalists via Twitter DM |
| 16 | Reach out to 10 security consultants via LinkedIn |
| 17 | Submit to Hacker News "Show HN" |
| 18 | Record YouTube demo video (globe + broadcast mode) |
| 19 | Post demo video to Twitter/X and Reddit |
| 20 | Follow up with any interested leads |
| 21 | Onboard first customer (manually if needed) |
| 22-25 | Iterate based on first customer feedback |
| 26 | Write case study from first customer (even if anonymous) |
| 27 | Submit to Product Hunt |
| 28 | Resubmit to awesome-osint |
| 29 | Set up newsletter (Buttondown or Resend) |
| 30 | Send first weekly intelligence digest to subscribers |
