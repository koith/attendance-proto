#!/usr/bin/env bash
# Safe retry boundary: Google Apps Script updateContent PUT only.
# Do NOT repeat the entire deploy for createVersion/updateDeployment errors:
# a non-idempotent createVersion POST may have succeeded before a 5xx response.
set -euo pipefail
if (( $# == 0 )); then echo "missing deploy command" >&2; exit 2; fi
attempt=1
max_attempts=3
while (( attempt <= max_attempts )); do
  log="$(mktemp)"
  if "$@" >"$log" 2>&1; then
    cat "$log"
    rm -f "$log"
    exit 0
  else
    rc=$?
  fi
  cat "$log" >&2
  # Retry ONLY if the known idempotent updateContent PUT failed transiently.
  # A version-creation/deployment/authorization failure is never retried blindly.
  if ! grep -Eq 'updateContent failed (429|500|502|503|504)([^0-9]|$)' "$log" || (( attempt == max_attempts )); then
    rm -f "$log"
    exit "$rc"
  fi
  rm -f "$log"
  echo "Google Apps Script updateContent temporarily unavailable; safe retry $attempt/$max_attempts" >&2
  sleep $((attempt * 3))
  attempt=$((attempt + 1))
done
exit 1
