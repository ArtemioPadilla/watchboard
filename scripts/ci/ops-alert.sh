#!/usr/bin/env bash
# Send one line to the PRIVATE ops chat. Never the public channel: the guard
# refuses when TELEGRAM_ALERT_CHAT_ID equals TELEGRAM_CHANNEL_ID, the same
# rule push-state.sh applies. Missing credentials are a warning, not a
# failure — the caller decides whether its own step is red.
# Usage: scripts/ci/ops-alert.sh "<text>"
set -uo pipefail
text="${1:?usage: ops-alert.sh <text>}"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
  echo "::warning::ops-alert: TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID not set — alert not sent: ${text}"
  exit 0
fi
if [ "${TELEGRAM_ALERT_CHAT_ID}" = "${TELEGRAM_CHANNEL_ID:-}" ]; then
  echo "::error::ops-alert: TELEGRAM_ALERT_CHAT_ID equals TELEGRAM_CHANNEL_ID — refusing to alert the public channel"
  exit 1
fi

run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
curl -sf -X POST "${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
  --data-urlencode "text=$(printf '%s\n%s' "$text" "$run_url")" >/dev/null \
  || echo "::warning::ops-alert: private ops alert could not be sent"
