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
check() {
  local path="$1" expect="$2" label="$3"
  local body code
  body=$(curl -sS -o /tmp/smoke-body -w '%{http_code}' "http://127.0.0.1:${PORT}${path}") || body=000
  code="$body"
  if [ "$code" = "200" ] && grep -q "$expect" /tmp/smoke-body; then
    echo "| $label ($path) | ✅ 200, contains \`$expect\` |" >> smoke-summary.md
  else
    echo "| $label ($path) | ❌ HTTP $code, expected \`$expect\` |" >> smoke-summary.md
    fail=1
  fi
}
check "/" "<title" "homepage"
check "/iran-conflict/" "hero" "tracker page"
check "/api/v1/trackers.json" '"trackers"' "JSON API"
check "/rss.xml" "<rss" "RSS"
check "/404-does-not-exist" "" "404 page" || true

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
