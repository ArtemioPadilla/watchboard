# syntax=docker/dockerfile:1.7
#
# Watchboard self-host image.
#
# Stage 1 builds the static site exactly as CI does (`npm run build` runs
# generate-api, copy-cesium, astro build, pagefind and csp-hashes). Stage 2
# is nginx serving `dist/` with the same headers `public/_headers` declares,
# generated into nginx syntax by scripts/headers-to-nginx.ts so there is one
# statement of the policy, not two.
#
# The data in the image is the data at build time. Watchboard's trackers are
# updated by GitHub Actions committing JSON; a self-hosted copy refreshes by
# rebuilding (or by mounting your own `dist/`). See docs/self-hosting.md.

FROM node:22-alpine AS build
WORKDIR /app
ENV CI=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
 && npx tsx scripts/headers-to-nginx.ts public/_headers docker/headers.conf \
 && test -f dist/index.html \
 && test -f dist/api/v1/trackers.json \
 && du -sh dist

FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.title="Watchboard" \
      org.opencontainers.image.description="Multi-topic intelligence dashboards: 100+ AI-curated trackers with maps and a 3D globe" \
      org.opencontainers.image.source="https://github.com/ArtemioPadilla/watchboard" \
      org.opencontainers.image.licenses="MIT"
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/docker/headers.conf /etc/nginx/conf.d/headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine already ships the unprivileged `nginx` user; listen on 8080 so
# the process never needs root and the image runs on Kubernetes/Podman with
# restricted security contexts.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
 && touch /run/nginx.pid && chown nginx:nginx /run/nginx.pid
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
