#!/usr/bin/env bash
# AISEC-07: runs before capture.mjs on EVERY backup. The DB login must PROVE it
# cannot write (no write/DDL grants, no executable write-capable SECURITY
# DEFINER function); otherwise the backup aborts and nothing is read.
# There is no fallback to operating credentials. Prints names/verdicts only.
set -euo pipefail
: "${SUPABASE_DB_URL:?BACKUP_BLOCKED_DB_CONNECTION}"
log="${RUNNER_TEMP:-/tmp}/backup-reader-verify.log"
# Owner-accepted residual privileges (repository file, empty by default).
accepted="$(grep -vE '^\s*(#|$)' "${SEC_BACKUP_ACCEPTED_RESIDUALS:-security/aisec07_backup_reader_accepted_residuals.txt}" | tr -d ' \t' | paste -sd, - || true)"
if [ -n "$accepted" ] && ! printf '%s' "$accepted" | grep -qE '^([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*:(DELETE|MAINTAIN|INSERT|UPDATE|TRUNCATE))(,[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*:(DELETE|MAINTAIN|INSERT|UPDATE|TRUNCATE))*$'; then
  echo 'BACKUP_BLOCKED_INVALID_ACCEPTED_RESIDUAL_LIST'; exit 1
fi
[ -n "$accepted" ] && echo "BACKUP_OWNER_ACCEPTED_RESIDUAL=$accepted"
if ! psql -X -q -v ON_ERROR_STOP=1 --dbname "$SUPABASE_DB_URL" -c "SET aisec07.accepted_residual = '${accepted}'" -f "${SEC_BACKUP_READER_VERIFY_SQL:-security/aisec07_backup_reader_verify.sql}" 2>"$log"; then
  grep -oE 'BACKUP_READER_[A-Z_]+[^"]*' "$log" | head -1 || true
  echo 'BACKUP_BLOCKED_DB_LOGIN_NOT_PROVEN_READ_ONLY'; exit 1
fi
echo 'BACKUP_DB_CREDENTIAL_SOURCE=dedicated_readonly'
grep -o 'BACKUP_READER_VERIFIED.*' "$log" | head -1
