#!/usr/bin/env bash
# AISEC-07: run before capture.mjs. When the dedicated backup login is in use
# (BACKUP_DB_DEDICATED=true), PROVE it cannot write; abort the backup otherwise.
# Prints credential SOURCES only (names), never values.
set -euo pipefail
db_source=legacy; auth_source=legacy
[ "${BACKUP_DB_DEDICATED:-false}" = true ] && db_source=dedicated_readonly
[ "${BACKUP_AUTH_DEDICATED:-false}" = true ] && auth_source=dedicated
echo "BACKUP_DB_CREDENTIAL_SOURCE=$db_source"
echo "BACKUP_AUTH_CREDENTIAL_SOURCE=$auth_source"
if [ "$db_source" = dedicated_readonly ]; then
  : "${SUPABASE_DB_URL:?BACKUP_BLOCKED_DB_CONNECTION}"
  if ! psql -X -q -v ON_ERROR_STOP=1 --dbname "$SUPABASE_DB_URL" -f "${SEC_BACKUP_READER_VERIFY_SQL:-security/aisec07_backup_reader_verify.sql}" 2>"${RUNNER_TEMP:-/tmp}/backup-reader-verify.log"; then
    grep -o 'BACKUP_READER_[A-Z_]*' "${RUNNER_TEMP:-/tmp}/backup-reader-verify.log" | head -1 || true
    echo 'BACKUP_BLOCKED_DEDICATED_LOGIN_NOT_READ_ONLY'; exit 1
  fi
  grep -o 'BACKUP_READER_VERIFIED.*' "${RUNNER_TEMP:-/tmp}/backup-reader-verify.log" | head -1
fi
