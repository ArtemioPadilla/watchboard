# Runbook — secrets and repo variables

Every credential the GitHub Actions workflows read, what breaks without it,
and what is configured today.

Generated against the repo on **2026-10-14** by grepping `secrets.*` and
`vars.*` out of `.github/workflows/*.yml` and comparing with `gh secret list`
/ `gh variable list`. The *names* are listed here; values live only in
GitHub. Re-check with:

```bash
gh secret list                 # names only — values are never readable
gh variable list               # names AND values (variables are not secret)
```

`docs/self-hosting.md` is the companion table: it is generated from
`process.env.*` reads in the code and gated in CI by
`scripts/list-env-vars.ts --check`. **That file is for someone running their
own copy. This file is for operating *this* repo's automation.**

---

## Where to set them

*Settings → Secrets and variables → Actions*, then the **Secrets** or
**Variables** tab. Or from the CLI:

```bash
gh secret set NAME               # prompts, nothing echoed to the terminal
gh variable set NAME --body value
```

**Secrets** are write-only and masked in logs. **Variables** are plain text,
visible in logs and to anyone who can read the repo — so a variable is for a
switch or an id, never for a token.

---

## Secrets

| secret | status | without it | workflows |
| --- | --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | **set** | every AI workflow dies. This is the Max-subscription OAuth token, which is why there are no per-token API costs | batch-init-trackers, credential-canary, hourly-scan, init-tracker, seed-tracker, tracker-lifecycle, translate-data, update-data |
| `TELEGRAM_BOT_TOKEN` | **set** | no alerts and no channel posts | 10 workflows |
| `TELEGRAM_ALERT_CHAT_ID` | **set** | infra alerts go nowhere — failures become silent | 9 workflows |
| `TELEGRAM_CHANNEL_ID` | **set** | no public channel posts | 6 workflows |
| `BLUESKY_HANDLE` / `BLUESKY_PASSWORD` | **set** | no Bluesky posts; the daily video loses its only always-on destination | credential-canary, daily-video, post-social-queue |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | **set** | no X posts | hourly-scan, post-social-queue, weekly-digest, x-api-check |
| `ELEVENLABS_API_KEY` | **set** | the daily video ships **silent** with a `::warning::`, and the job turns red at the end | daily-video |
| `PUBLIC_POSTHOG_KEY` | **set** | no analytics, and no CSP-violation reporting (it is the sink — see `src/lib/csp-report.ts`) | credential-canary, deploy |
| `META_PAGE_ACCESS_TOKEN` | **MISSING** | Instagram Reels and Facebook stay no-op. Needs `META_IG_USER_ID` / `META_FB_PAGE_ID` as variables too | daily-video |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_ID` | **MISSING** | the weekly digest skips LinkedIn | weekly-digest |
| `NEWSLETTER_SECRET` | **MISSING** | the weekly digest skips the newsletter send | weekly-digest |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `AI_PROVIDER` | **MISSING**, and that is correct | only the legacy `backfill` path uses direct API keys. The nightly pipeline runs on OAuth. Setting these would start billing per token for no benefit | backfill |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REFRESH_TOKEN` | **MISSING** | YouTube Shorts stays disabled; the adapter logs why and the video posts normally everywhere else | daily-video (after #325) |

### Dormant credential — worth acting on

`CLOUDFLARE_API_TOKEN` is **set but read by zero workflows**. Its only
mention in the repo is a plan document
(`docs/superpowers/plans/2026-09-26-live-chat.md`), and the worker-deploy
workflow it was created for does not exist. `CLOUDFLARE_ACCOUNT_ID` was never
set, so the pair is incomplete and could not work as-is.

A token nothing uses is attack surface with no upside. Either wire up the
worker deploy or revoke it in the Cloudflare dashboard and
`gh secret delete CLOUDFLARE_API_TOKEN`.

### The one rule that is not a preference

`TELEGRAM_ALERT_CHAT_ID` is the **private ops chat**. `TELEGRAM_CHANNEL_ID`
is the **public content channel with outside subscribers**.

Infra alerts — failures, stale data, credential problems — go to
`TELEGRAM_ALERT_CHAT_ID`. **Never** to `TELEGRAM_CHANNEL_ID`. Sending a
stack trace to the public channel is not a cosmetic mistake; it tells
subscribers, and anyone they forward it to, exactly which part of the
pipeline is broken.

---

## Variables

**One of the eight is set** (`X_POSTING_ENABLED=true`, 18 Oct 2026). The other
seven fall back to their defaults, which is why some features look broken when
they are simply switched off.

| variable | default when unset | set it to | workflow |
| --- | --- | --- | --- |
| `X_POSTING_ENABLED` | X posting off | **set to `true`.** On its own it publishes nothing: the poster still sends only entries a human approved in `/social/`. See "Approving what X posts" below | post-social-queue |
| `X_ALLOW_AUTO_APPROVED` | **only human-approved entries post** | **leave unset.** Setting `true` lets the AI publish without you approving in `/social/`. The account was suspended once for "inauthentic behavior" | post-social-queue |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | nothing, normally. Set it to roll the hourly scan back to an older model without a commit | hourly-scan |
| `META_IG_USER_ID` | Instagram adapter disabled | your Instagram professional account id | daily-video |
| `META_FB_PAGE_ID` | Facebook adapter disabled | your Facebook Page id | daily-video |
| `ELEVENLABS_VOICE_EN` / `ELEVENLABS_VOICE_ES` | ElevenLabs default voices | a voice id, only if you dislike the defaults | daily-video |
| `ENABLE_FRESHNESS_CHECK` | freshness check off | `true` to turn it on | hourly-scan |
| `YOUTUBE_PRIVACY_STATUS` | `private` | `public`, once you have watched a few land as private | daily-video (after #325) |
| `VIDEO_CUT` | the daily brief — 23s, logo intro, three trackers, outro | `hook` to publish the hook-first cut instead: 18s, opens on a real headline at ~1s, on-screen CTA. Both carry 15.0s of news; the difference is 8.0s of bookend against 3.0s (#243). Breaking brief only — the progress brief has no hook variant | daily-video |

---

## Approving what X posts

`X_POSTING_ENABLED=true` opens the path; it does not publish anything.
`post-social-queue.ts` sends only entries whose status is `approved` — what a
human approved in `/social/` — because `X_ALLOW_AUTO_APPROVED` is unset and
should stay that way. Across the 49 queue files written before 18 Oct 2026
there was **not one** approved entry, so the measured output to X was zero a
day while 1–5 proposals a day waited in the queue.

Nothing used to tell you they were there. Now
`scripts/notify-social-proposals.ts` announces each new one in the **private
ops chat** (`TELEGRAM_ALERT_CHAT_ID`, never the public channel) with its type,
tracker, judge score and verdict, the judge's comment, a fact-check summary,
its slot, a link to the tracker and a link to `/social/`. It runs after the
nightly writes the queue and again at each of the four posting slots, and
records what it announced in `public/_social/notified-proposals.json` so it
never repeats itself. A failed send is deliberately **not** recorded, so the
next run tries again.

So the working loop is: alert arrives → open `/social/` → approve or reject →
the next slot (08:00 / 13:00 / 18:00 / 22:00 UTC) posts what you approved.

---

## What to configure, in priority order

1. ~~**`X_POSTING_ENABLED=true`**~~ — done, 18 Oct 2026. Keep
   `X_ALLOW_AUTO_APPROVED` unset so nothing publishes without your approval.
2. **`META_PAGE_ACCESS_TOKEN`** (secret) + **`META_IG_USER_ID`**,
   **`META_FB_PAGE_ID`** (variables) — all three or Instagram and Facebook
   stay off. Partial configuration is detected and reported, not guessed at.

   After setting them, run the **Video Destinations Check** workflow
   (manual dispatch, read-only). It reports which destinations are
   configured and, for the configured ones, whether the credentials
   actually work — a token introspection for Meta, a refresh-token
   exchange plus one channel read for YouTube. Nothing is published.
   Without it, the first signal that a token is wrong is a nightly that
   went green having posted nothing.
3. **`YOUTUBE_CLIENT_ID`**, **`YOUTUBE_CLIENT_SECRET`**,
   **`YOUTUBE_REFRESH_TOKEN`** (secrets) — the last manual destination.
   An API key is **not** enough: uploading writes to a channel, so it needs
   an OAuth refresh token.

   **How to get them.** In the [Google Cloud console](https://console.cloud.google.com/):

   1. Create (or pick) a project, then **APIs & Services → Library → YouTube
      Data API v3 → Enable**.
   2. **OAuth consent screen**: External, fill the app name and your email.
      Add yourself under **Test users** — while the app is in Testing it
      issues refresh tokens only to listed testers, and a token minted here
      otherwise expires in seven days.
   3. **Credentials → Create credentials → OAuth client ID → Web application**,
      with `http://localhost:8787/callback` as an authorised redirect URI.
      That gives you the client id and secret.
   4. Mint the refresh token — this repo runs the fiddly part for you:

      ```bash
      npx tsx scripts/youtube-oauth.ts --client-id <id> --client-secret <secret>
      ```

      It serves the redirect URI, prints a consent URL to open **signed in as
      the account that owns the channel**, catches the code, exchanges it and
      prints the refresh token once. Nothing is written to disk and nothing
      goes anywhere but Google.

   5. Set all three and verify without publishing anything:

      ```bash
      gh secret set YOUTUBE_CLIENT_ID
      gh secret set YOUTUBE_CLIENT_SECRET
      gh secret set YOUTUBE_REFRESH_TOKEN
      gh workflow run video-destinations-check.yml
      ```

   Optional: the `YOUTUBE_PRIVACY_STATUS` variable defaults to `private`.
   Leave it there until you have watched a few land, then set `public`.
4. **Decide on `CLOUDFLARE_API_TOKEN`** — wire it or revoke it. Set since
   April, read by no workflow. See the first open decision below: the migration
   it was obtained for no longer has the payoff it was filed for, so revoking
   is now the likelier answer.
5. `LINKEDIN_*` and `NEWSLETTER_SECRET` only if you want those channels.

---

## Open decisions

Four things are waiting, and none of them is a missing credential — they are
calls only the owner can make. Each is written here with what is already
measured, so the decision is the only work left.

### 1. The Cloudflare Pages migration: probably drop it

Filed as a P0 on "GH Pages TTFB is 1.8-2.5s" and "automatic Brotli". Measured
on 19 Oct 2026 from a Mexico City POP (`cache-cyw`):

| page | TTFB | bytes | x-cache |
|---|---|---|---|
| `/` | 0.030s | 168,003 | HIT |
| `/bolivia-crisis/` | 0.033s | 12,415 | HIT |
| `/metrics/` | 0.030s | 12,806 | HIT |

A cold MISS is served in 95-120 ms (Fastly `x-timer` VE), and GitHub Pages
already gzips — 739 KB of homepage HTML goes out as 168 KB. Brotli over gzip is
worth perhaps another fifteen per cent of bytes, not seconds.

One location, one moment, warm edge. **Decide:** re-measure from Europe and a
cold POP if the doubt matters, or close the item and revoke
`CLOUDFLARE_API_TOKEN`. The roadmap entry (`rm-cloudflare-pages`) carries the
same numbers.

### 2. The translation quota: three locales have been frozen since 14 April

`es`, `fr` and `pt` each have all 57 translated trackers stale — median 189
days behind the English, worst 212. `scripts/check-translation-freshness.ts`
prints this, and the nightly now runs it into its step summary.

The cause is not a bug. `translate-data.yml` has its schedule commented out and
its last run died with `Claude Code returned an error result: You've hit your
limit · resets Apr 17` — the Claude Max quota the nightly data pipeline also
draws on. It now alerts the private ops chat when it fails, so the next one is
heard.

**Decide** where the quota comes from. Re-enabling the daily cron as it was
will hit the same wall:

- weekly instead of daily (`cron: '0 22 * * 0'`), or
- `tracker_slug` runs over the ten trackers that matter rather than `all`, or
- an `ANTHROPIC_API_KEY` that is not the nightly's subscription.

The daily video's Spanish track speaks English today **by design** — it uses a
tracker's Spanish headline only while that translation is current, so it never
reads six-month-old news as today's. Each tracker starts speaking Spanish on
its own as its translation catches up. No code change is needed for that.

### 3. The Android app: one permanent identifier, one delivery strategy

`docs/superpowers/plans/2026-08-19-tauri-android-play-store.md` is written,
reviewed and unimplemented on purpose. Its Task 1 blocks every other task, and
it is two decisions:

- **The app identifier** (`dev.watchboard.app` proposed). It is baked into
  `tauri.conf.json` and the Play Store `packageName` and **cannot change after
  the first Play Console upload** without creating a new listing.
- **How the app gets the site.** This one is now answered by measurement:
  `dist/` is 2.3 GB — and that is with per-event OG images capped at 25, so a
  full build is larger. The three non-default locale trees are 231 MB each,
  `og/` 216 MB, `pagefind/` 128 MB. Play caps a base module's compressed
  download at 200 MB. Bundling is not a close call and not reachable by
  trimming: English-only without `og/` and `pagefind` is still around a
  gigabyte. **The shell has to remote-load watchboard.dev.**

Everything after Task 1 also needs a Play Console account, a signing keystore
and a Google Play service-account JSON — none of which exist yet, and all of
which are the owner's to create.

One finding from the plan's review was already real and is fixed: the
service-worker guard compared against a hard-coded `watchboard.dev`, so every
self-hosted instance and every `localhost` unregistered its own worker on each
load. The other, widening the push API's CORS allowlist to a Tauri origin, is
deliberately left until a Tauri client exists.

### 4. Meta and YouTube credentials

Items 2 and 3 above, under "What to configure, in priority order". Both need
accounts only the owner has. Everything scriptable is already scripted:
`scripts/youtube-oauth.ts` mints the refresh token locally, and
`video-destinations-check.yml` verifies any configured destination read-only,
publishing nothing.

---

## Verifying

`.github/workflows/credential-canary.yml` runs daily and checks Telegram,
Bluesky, Claude OAuth and PostHog are alive, alerting the private ops chat.
It exists because a revoked token took seven workflows down for two weeks
without anyone noticing.

It does **not** cover X, Meta, YouTube, LinkedIn or the newsletter. For X:

```bash
gh workflow run x-api-check.yml -f mode=verify     # read-only, one GET /2/users/me
```

`post-test` publishes a real tweet. It verifies auth first so a write is
never spent discovering the account is suspended, but it is still a real
post — manual dispatch only, never scheduled.

After changing anything, confirm from the run logs that the workflow saw it.
A missing secret is an empty string, not an error: the step often goes green
having done nothing. See `docs/silent-failure-patterns.md`.
