#!/usr/bin/env bash
# Push the local state commit(s) to origin/main, surviving the 14 bots that
# also push there. On final failure: ::error:: plus a PRIVATE ops alert
# (TELEGRAM_ALERT_CHAT_ID, never TELEGRAM_CHANNEL_ID) so a human can land the
# state by hand instead of the next run re-posting to the public channel.
# Usage: scripts/ci/push-state.sh <label> [attempts=5]
set -uo pipefail
label="${1:?usage: push-state.sh <label> [attempts]}"
attempts="${2:-5}"

dirty="$(git status --porcelain --untracked-files=no)"
# Report, never hide: a dirty tree is what made daily-video's pull fail on every attempt.
[ -n "$dirty" ] && printf 'push-state: dirty tree before pull: %s\n' "$(echo "$dirty" | sed 's/^ *//' | paste -sd ',' -)"

for i in $(seq 1 "$attempts"); do
  if git pull --rebase --autostash origin main; then
    if git push origin HEAD:main; then
      echo "push-state: ${label} pushed on attempt ${i}"
      exit 0
    fi
  else
    conflicted="$(git diff --name-only --diff-filter=U | paste -sd ' ' -)"
    git rebase --abort 2>/dev/null || true
    if [ -n "$conflicted" ]; then
      # A content conflict recurs identically on every retry: fail now, loudly.
      echo "::error::push-state: content conflict in ${conflicted} — not retrying"
      break
    fi
  fi
  echo "push-state: attempt ${i} failed"
  if [ "$i" -lt "$attempts" ] && [ "${PUSH_STATE_NO_SLEEP:-}" != "1" ]; then
    sleep $(( (2 ** i) + RANDOM % 3 ))
  fi
done

echo "::error::push-state: failed to push ${label} after ${attempts} attempts"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
  if [ "${TELEGRAM_ALERT_CHAT_ID}" = "${TELEGRAM_CHANNEL_ID:-}" ]; then
    echo "::error::push-state: TELEGRAM_ALERT_CHAT_ID equals TELEGRAM_CHANNEL_ID — refusing to alert the public channel"
  else
    run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
    text="$(printf '⚠️ State push failed: %s\nPublished items are NOT recorded on main — do not re-run; commit the state by hand.\n%s\n%s' "$label" "${PUSH_STATE_DETAIL:-}" "$run_url")"
    curl -sf -X POST "${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
      --data-urlencode "text=${text}" >/dev/null \
      || echo "::warning::push-state: private ops alert could not be sent"
  fi
fi
exit 1
