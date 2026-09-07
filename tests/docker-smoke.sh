#!/usr/bin/env bash
# Smoke test for the self-host image: starts the container and asserts the
# routes that matter return 200 with a body of the right shape. Writes a
# markdown table to smoke-summary.md for the workflow step summary.
set -euo pipefail
IMAGE="${1:-watchboard:smoke}"
PORT="${SMOKE_PORT:-18080}"
NAME="watchboard-smoke-$$"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -p "${PORT}:8080" "$IMAGE" >/dev/null
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" = 30 ]; then echo "container never became healthy"; docker logs "$NAME"; exit 1; fi
done

fail=0
: > smoke-summary.md
# check PATH EXPECTED_STATUS EXPECTED_SUBSTRING LABEL — asserts the status
# code AND a body substring; both must hold or the run fails.
check() {
  local path="$1" want="$2" expect="$3" label="$4"
  local code
  code=$(curl -sS -o /tmp/smoke-body -w '%{http_code}' "http://127.0.0.1:${PORT}${path}") || code=000
  if [ "$code" = "$want" ] && grep -q -- "$expect" /tmp/smoke-body; then
    echo "| $label ($path) | ✅ $code, contains \`$expect\` |" >> smoke-summary.md
  else
    echo "| $label ($path) | ❌ HTTP $code (wanted $want), expected \`$expect\` |" >> smoke-summary.md
    fail=1
  fi
}
check "/" 200 "<title" "homepage"
check "/iran-conflict/" 200 "hero" "tracker page"
check "/api/v1/trackers.json" 200 '"trackers"' "JSON API"
check "/rss.xml" 200 "<rss" "RSS"
# The plan (E8.H1) names /_hourly/alerts.json; that file is produced by the
# E3 branch. Until it merges, the light-scan state file proves /_hourly/
# static passthrough works.
check "/_hourly/state.json" 200 '"seen"' "_hourly passthrough"
# A missing path must be a real 404 that still renders the custom page.
check "/404-does-not-exist" 404 "<title" "404 page"

# Headers actually applied (the whole point of headers-to-nginx.ts).
hdrs=$(curl -sSI "http://127.0.0.1:${PORT}/api/v1/trackers.json")
if echo "$hdrs" | grep -qi "access-control-allow-origin: \*"; then
  echo "| CORS on /api/v1 | ✅ |" >> smoke-summary.md
else
  echo "| CORS on /api/v1 | ❌ header missing |" >> smoke-summary.md; fail=1
fi
if curl -sSI "http://127.0.0.1:${PORT}/" | grep -qi "content-security-policy:"; then
  echo "| CSP header on / | ✅ |" >> smoke-summary.md
else
  echo "| CSP header on / | ❌ header missing |" >> smoke-summary.md; fail=1
fi
size=$(docker image inspect "$IMAGE" --format '{{.Size}}')
echo "| image size | $((size / 1024 / 1024)) MB |" >> smoke-summary.md

cat smoke-summary.md
exit $fail
