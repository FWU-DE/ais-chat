#!/bin/sh
# Periodic admin calls. Each task runs once at start, then repeats on its interval.
# Add further tasks as `task <interval-seconds> "<METHOD> <path>"...`; several entries run in order.
# Requires APP_HOSTNAME, API_KEY and PORT; MAX_TIME_SECONDS (per request) defaults to 1800.

BASE_URL="http://$APP_HOSTNAME:$PORT"

call() {
  echo "$(date -u +%FT%TZ) $1 $BASE_URL$2"
  curl -sS --fail --connect-timeout 10 --max-time "${MAX_TIME_SECONDS:-1800}" -X "$1" \
    -H "Authorization: Bearer $API_KEY" "$BASE_URL$2" || return 1
  echo
}

task() {
  interval=$1
  shift
  while true; do
    for entry in "$@"; do
      # shellcheck disable=SC2086
      until call $entry; do
        echo "failed: $entry, retrying in 60s"
        sleep 60
      done
    done
    sleep "$interval"
  done
}

task 3600 "POST /api/v1/admin/refresh-popularity" &
# deleteUnusedS3Files=true is intentionally omitted: several deployments can share one S3 storage,
# and one deployment would delete files that are still used by the others.
task 86400 "DELETE /api/v1/admin/delete-conversation" "DELETE /api/v1/admin/cleanup" &
wait
