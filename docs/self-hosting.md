# Self-hosting Watchboard

Watchboard is a static site: HTML, JSON and assets, no accounts, no
database, no server-side secrets. Self-hosting it is serving a folder.
The official image does exactly that with nginx.

## One command

```bash
docker run -d --name watchboard -p 8080:8080 ghcr.io/artemiopadilla/watchboard:latest
# open http://localhost:8080/
```

Or with Compose (also carries the CasaOS app-store metadata):

```bash
curl -O https://raw.githubusercontent.com/ArtemioPadilla/watchboard/main/docker-compose.yml
WATCHBOARD_PORT=8080 docker compose up -d
```

Tags: `latest` (main), `sha-<commit>`, and `vX.Y.Z` / `vX.Y` on releases.
Images are built for `linux/amd64` and `linux/arm64` by
`.github/workflows/docker-publish.yml`, which smoke-tests every image
(homepage, a tracker page, the JSON API, RSS, CORS and CSP headers)
before pushing it.

## What is inside

| Layer | Content |
|---|---|
| Build stage (`node:22-alpine`) | `npm ci`, `npm run build` (generate-api → copy-cesium → astro build → pagefind → csp-hashes), then `scripts/headers-to-nginx.ts` |
| Runtime (`nginx:1.27-alpine`) | `dist/` at `/usr/share/nginx/html`, `docker/nginx.conf`, generated `headers.conf`, runs as the unprivileged `nginx` user on port 8080, `HEALTHCHECK` on `/healthz` |

The HTTP headers (CSP, cache lifetimes, CORS on `/api/v1/`) are the ones
declared in `public/_headers`; the generator converts them to nginx
`location` blocks at build time so there is one statement of the policy.
GitHub Pages ignores `_headers`; the image does not.

## Data freshness

The trackers inside the image are the trackers at build time. Data on
watchboard.dev is refreshed by GitHub Actions committing JSON (nightly
updates, a 15-minute breaking-news scan). A self-hosted copy refreshes by:

- pulling a newer image (`latest` is rebuilt on every push to `main`), or
- building from source (`docker compose build`), or
- mounting your own build: `-v ./dist:/usr/share/nginx/html:ro` after
  `npm run build`.

There is no live sync. If you need the pipeline itself, fork the repo:
the workflows under `.github/workflows/` are the pipeline.

## Building locally

```bash
docker build -t watchboard .
bash tests/docker-smoke.sh watchboard   # same checks CI runs
```

## Environment variables

None are required to run the image. The site build reads only the two
`PUBLIC_*` analytics variables and `SITE` (all optional). Everything else
in the table belongs to the CI pipeline (AI updates, social posting,
video) and is irrelevant to a self-hosted copy. The Cloudflare Worker
under `worker/` takes its bindings from `wrangler.toml`, not from
`process.env`, so it is not listed.

The table is generated from the source by `scripts/list-env-vars.ts`
(`--check` fails CI when it drifts). Do not edit it by hand.

<!-- env-vars:start -->
| Variable | Used by | Files |
|---|---|---|
| `AI_PROVIDER` | CI scripts | `scripts/backfill-osint.ts`, `scripts/backfill.ts`, `scripts/update-data.ts` |
| `ANTHROPIC_API_KEY` | CI scripts | `scripts/backfill.ts`, `scripts/generate-hook.ts`, `scripts/generate-social-queue.ts`, `scripts/hourly-triage.ts`, `scripts/update-data.ts` |
| `ANTHROPIC_MODEL` | CI scripts | `scripts/backfill-osint.ts`, `scripts/backfill.ts`, `scripts/update-data.ts` |
| `AWS_REGION` | CI scripts | `scripts/local-hourly.ts` |
| `BLUESKY_HANDLE` | CI scripts | `scripts/bluesky-post.ts`, `scripts/post-video-social.ts` |
| `BLUESKY_PASSWORD` | CI scripts | `scripts/bluesky-post.ts`, `scripts/post-video-social.ts` |
| `ELIGIBLE_SLUGS` | CI scripts | `scripts/generate-review-manifest.ts` |
| `FRESHNESS_CADENCE_FACTOR` | CI scripts | `scripts/check-data-freshness.ts` |
| `FRESHNESS_GLOBAL_STALE_DAYS` | CI scripts | `scripts/check-data-freshness.ts` |
| `FRESHNESS_STALE_RATIO` | CI scripts | `scripts/check-data-freshness.ts` |
| `GITHUB_OUTPUT` | CI scripts | `scripts/check-data-freshness.ts` |
| `LINKEDIN_ACCESS_TOKEN` | CI scripts | `scripts/post-social.ts` |
| `LINKEDIN_ORG_ID` | CI scripts | `scripts/post-social.ts` |
| `MAX_BACKFILL_GAPS` | CI scripts | `scripts/backfill-gaps.ts` |
| `OPENAI_API_KEY` | CI scripts | `scripts/backfill.ts`, `scripts/update-data.ts` |
| `OPENAI_MODEL` | CI scripts | `scripts/backfill-osint.ts`, `scripts/backfill.ts`, `scripts/update-data.ts` |
| `PUBLIC_POSTHOG_HOST` | site build | `src/layouts/BaseLayout.astro` |
| `PUBLIC_POSTHOG_KEY` | site build | `src/layouts/BaseLayout.astro` |
| `REVIEW_WINDOW_MAX_DAYS` | CI scripts | `scripts/generate-review-manifest.ts` |
| `SITE` | site build | `src/layouts/BaseLayout.astro`, `src/pages/[tracker]/events/[...slug].astro`, `src/pages/[tracker]/index.astro`, `src/pages/briefing/[date].astro`, `src/pages/briefing/index.astro` |
| `SKIP_FETCH` | video render | `video/render.ts` |
| `TELEGRAM_BOT_TOKEN` | CI scripts | `scripts/hourly-light-scan.ts`, `scripts/repost-daily-telegram.ts`, `scripts/telegram-channel.ts` |
| `TELEGRAM_CHANNEL_ID` | CI scripts | `scripts/repost-daily-telegram.ts`, `scripts/telegram-channel.ts` |
| `TELEGRAM_CHAT_ID` | CI scripts | `scripts/hourly-light-scan.ts` |
| `TRACKER_SLUG` | CI scripts | `scripts/update-data.ts` |
| `UPDATE_SECTIONS` | CI scripts | `scripts/update-data.ts` |
| `VIDEO_MODE` | video render | `video/render.ts`, `video/src/data/fetch-breaking.ts` |
| `VIDEO_TYPE` | CI scripts | `scripts/post-video-social.ts` |
| `X_ACCESS_TOKEN` | CI scripts | `scripts/hourly-post.ts`, `scripts/post-social-queue.ts`, `scripts/post-social.ts`, `scripts/x-check.ts` |
| `X_ACCESS_TOKEN_SECRET` | CI scripts | `scripts/hourly-post.ts`, `scripts/post-social-queue.ts`, `scripts/post-social.ts`, `scripts/x-check.ts` |
| `X_API_KEY` | CI scripts | `scripts/hourly-post.ts`, `scripts/post-social-queue.ts`, `scripts/post-social.ts`, `scripts/x-check.ts` |
| `X_API_SECRET` | CI scripts | `scripts/hourly-post.ts`, `scripts/post-social-queue.ts`, `scripts/post-social.ts`, `scripts/x-check.ts` |
| `X_TEST_TEXT` | CI scripts | `scripts/x-check.ts` |
| `YOUTUBE_API_KEY` | CI scripts | `scripts/backfill-youtube.ts` |
<!-- env-vars:end -->

## Reverse proxies

The container speaks plain HTTP on 8080. Put Caddy, Traefik or nginx in
front for TLS. `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'none'`
are set on every page except `/embed/*`, which is meant to be framed.
