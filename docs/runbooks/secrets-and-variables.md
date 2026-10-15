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

**None of the eight are set today**, so every one falls back to its default.
That is why some features look broken when they are simply switched off.

| variable | default when unset | set it to | workflow |
| --- | --- | --- | --- |
| `X_POSTING_ENABLED` | **X posting off** — this is why the social queue looks stuck (#235) | `true` to resume posting to X; leave unset for Bluesky-only | post-social-queue |
| `X_ALLOW_AUTO_APPROVED` | **only human-approved entries post** | **leave unset.** Setting `true` lets the AI publish without you approving in `/social/`. The account was suspended once for "inauthentic behavior" | post-social-queue |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | nothing, normally. Set it to roll the hourly scan back to an older model without a commit | hourly-scan |
| `META_IG_USER_ID` | Instagram adapter disabled | your Instagram professional account id | daily-video |
| `META_FB_PAGE_ID` | Facebook adapter disabled | your Facebook Page id | daily-video |
| `ELEVENLABS_VOICE_EN` / `ELEVENLABS_VOICE_ES` | ElevenLabs default voices | a voice id, only if you dislike the defaults | daily-video |
| `ENABLE_FRESHNESS_CHECK` | freshness check off | `true` to turn it on | hourly-scan |
| `YOUTUBE_PRIVACY_STATUS` | `private` | `public`, once you have watched a few land as private | daily-video (after #325) |

---

## What to configure, in priority order

1. **`X_POSTING_ENABLED=true`** (variable) — one value, unblocks #235. Keep
   `X_ALLOW_AUTO_APPROVED` unset so nothing publishes without your approval.
2. **`META_PAGE_ACCESS_TOKEN`** (secret) + **`META_IG_USER_ID`**,
   **`META_FB_PAGE_ID`** (variables) — all three or Instagram and Facebook
   stay off. Partial configuration is detected and reported, not guessed at.
3. **`YOUTUBE_CLIENT_ID`**, **`YOUTUBE_CLIENT_SECRET`**,
   **`YOUTUBE_REFRESH_TOKEN`** (secrets) — the last manual destination.
   An API key is **not** enough: uploading writes to a channel, so it needs
   an OAuth refresh token.
4. **Decide on `CLOUDFLARE_API_TOKEN`** — wire it or revoke it.
5. `LINKEDIN_*` and `NEWSLETTER_SECRET` only if you want those channels.

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
