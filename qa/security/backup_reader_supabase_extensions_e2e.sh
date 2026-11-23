#!/usr/bin/env bash
# AISEC-07 proof on the REAL Supabase Postgres image (pg_net + pg_cron with
# Supabase's own PUBLIC grants). Disposable container only, synthetic data.
#  1. backup_reader really can write net/cron tables through PUBLIC grants and
#     the verifier refuses it;
#  2. after security/aisec07_backup_reader_net_guard.sql: every data write and
#     DDL (trigger planting) by backup_reader is denied, while postgres and the
#     pg_net worker keep working and no extension grant changed;
#  3. only the 3 non-removable residuals remain, they block unless explicitly
#     accepted, and a full pg_dump (auth, storage-free image, cron.job) works;
#  4. rollback restores the prior state; re-apply is idempotent.
# Requires: SB_URL (postgres@container), SB_HOST, SB_PORT, psql/pg_dump 17.
set -euo pipefail
: "${SB_URL:?}" "${SB_HOST:?}" "${SB_PORT:?}"
case "$SB_URL" in *127.0.0.1*|*localhost*) ;; *) echo 'REFUSING_NON_LOCAL'; exit 2;; esac
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
pg(){ psql -X -q -v ON_ERROR_STOP=1 --dbname "$SB_URL" "$@"; }
PW="synthetic-$(openssl rand -hex 6)"
R="postgresql://backup_reader:${PW}@${SB_HOST}:${SB_PORT}/postgres?sslmode=disable"
rd(){ psql -X -q -v ON_ERROR_STOP=1 --dbname "$R" -c 'SET default_transaction_read_only = off' "$@"; }
pass(){ echo "PASS $*"; }
ACL_SQL="SELECT md5(string_agg(c.oid::regclass::text||coalesce(c.relacl::text,''), '|' ORDER BY c.oid::regclass::text)) FROM pg_class c WHERE c.relnamespace IN ('net'::regnamespace,'cron'::regnamespace)"

pg -c 'CREATE EXTENSION IF NOT EXISTS pg_net' -c 'CREATE EXTENSION IF NOT EXISTS pg_cron'
pg -f security/aisec07_backup_reader_role.sql 2>/dev/null
pg -c "ALTER ROLE backup_reader PASSWORD '${PW}'"
acl_before="$(pg -Atc "$ACL_SQL")"

# 1. The risk is real and the verifier catches it.
rd -c "INSERT INTO net.http_request_queue(method,url,headers,timeout_milliseconds) VALUES ('GET','http://127.0.0.1:9/','{}'::jsonb,1)" >/dev/null
rd -c 'DELETE FROM cron.job_run_details WHERE false' >/dev/null
rd -c "CREATE FUNCTION pg_temp.evil() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'" \
   -c 'CREATE TRIGGER evil AFTER INSERT ON net._http_response FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.evil()' >/dev/null
if psql -X -q -v ON_ERROR_STOP=1 --dbname "$R" -f security/aisec07_backup_reader_verify.sql 2>"$WORK/v0"; then
  echo 'CRITICAL: verifier accepted a login with PUBLIC extension writes'; exit 1; fi
grep -q 'net.http_request_queue:INSERT' "$WORK/v0"
pg -c "DELETE FROM net.http_request_queue WHERE url = 'http://127.0.0.1:9/'"
pass 'unguarded: backup_reader wrote net queue, deleted cron history, planted a trigger; verifier refused'

# 2. Guard: data writes and DDL denied for backup_reader only.
pg -f security/aisec07_backup_reader_net_guard.sql
pg -f security/aisec07_backup_reader_net_guard.sql   # idempotent
denied=0
for s in "INSERT INTO net.http_request_queue(method,url,headers,timeout_milliseconds) VALUES ('GET','http://127.0.0.1:9/','{}'::jsonb,1)" \
  "UPDATE net.http_request_queue SET url = url" "DELETE FROM net.http_request_queue" "TRUNCATE net.http_request_queue" \
  "INSERT INTO net._http_response(id) VALUES (-1)" "UPDATE net._http_response SET id = id" "DELETE FROM net._http_response" "TRUNCATE net._http_response" \
  "SELECT net.http_post('http://127.0.0.1:9/')" "SELECT net.http_get('http://127.0.0.1:9/')" \
  "CREATE FUNCTION pg_temp.evil() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'" "CREATE TEMP TABLE t(i int)" \
  "SET session_replication_role = replica" "ALTER TABLE net.http_request_queue DISABLE TRIGGER aisec07_deny_backup_reader_dml" \
  "DROP EVENT TRIGGER aisec07_deny_backup_reader_ddl"; do
  if rd -c "$s" >/dev/null 2>&1; then echo "CRITICAL: backup_reader executed: $s"; exit 1; fi
  denied=$((denied+1))
done
test "$(pg -Atc "SELECT count(*) FROM net.http_request_queue WHERE url = 'http://127.0.0.1:9/'")" = 0
test "$(pg -Atc "$ACL_SQL")" = "$acl_before"
before_resp="$(pg -Atc 'SELECT count(*) FROM net._http_response')"
pg -Atc "SELECT net.http_get('http://127.0.0.1:9/')" >/dev/null
for _ in $(seq 1 20); do [ "$(pg -Atc 'SELECT count(*) FROM net._http_response')" -gt "$before_resp" ] && break; sleep 1; done
test "$(pg -Atc 'SELECT count(*) FROM net._http_response')" -gt "$before_resp"
pg -c 'CREATE TEMP TABLE ok(i int)' >/dev/null
pass "guard: $denied backup_reader writes/DDL/bypasses denied; postgres request + pg_net worker response still work; extension grants unchanged"

# 3. Only the 3 non-removable residuals remain; they block unless accepted.
if SUPABASE_DB_URL="$R" RUNNER_TEMP="$WORK" bash scripts/security/backup_reader_preflight.sh >"$WORK/p1" 2>&1; then
  echo 'CRITICAL: backup allowed without owner acceptance of residuals'; exit 1; fi
grep -q 'unguarded=cron.job_run_details:DELETE, net._http_response:MAINTAIN, net.http_request_queue:MAINTAIN$' "$WORK/p1"
printf 'cron.job_run_details:DELETE\nnet._http_response:MAINTAIN\nnet.http_request_queue:MAINTAIN\n' > "$WORK/acc"
SEC_BACKUP_ACCEPTED_RESIDUALS="$WORK/acc" SUPABASE_DB_URL="$R" RUNNER_TEMP="$WORK" bash scripts/security/backup_reader_preflight.sh > "$WORK/p2"
grep -q 'BACKUP_READER_VERIFIED' "$WORK/p2"
PGPASSWORD="$PW" pg_dump -h "$SB_HOST" -p "$SB_PORT" -U backup_reader -d postgres -Fc > "$WORK/full.dump"
pg_restore --list "$WORK/full.dump" > "$WORK/toc"; test -s "$WORK/toc"
grep -q 'TABLE DATA auth users' "$WORK/toc"; grep -q 'TABLE DATA cron job ' "$WORK/toc"
pass 'exactly 3 residuals (cron DELETE, 2x net MAINTAIN) block unless owner-accepted; full pg_dump as backup_reader includes auth and cron.job'

# 4. Rollback restores the prior state (verifier refuses again); re-apply works.
pg -f security/aisec07_backup_reader_net_guard_rollback.sql
test "$(pg -Atc "SELECT count(*) FROM pg_event_trigger WHERE evtname = 'aisec07_deny_backup_reader_ddl'")" = 0
test "$(pg -Atc "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'aisec07_%'")" = 0
test "$(pg -Atc "$ACL_SQL")" = "$acl_before"
if SEC_BACKUP_ACCEPTED_RESIDUALS="$WORK/acc" SUPABASE_DB_URL="$R" RUNNER_TEMP="$WORK" bash scripts/security/backup_reader_preflight.sh >/dev/null 2>&1; then
  echo 'CRITICAL: verifier passed after guard rollback'; exit 1; fi
pg -f security/aisec07_backup_reader_net_guard.sql
SEC_BACKUP_ACCEPTED_RESIDUALS="$WORK/acc" SUPABASE_DB_URL="$R" RUNNER_TEMP="$WORK" bash scripts/security/backup_reader_preflight.sh | grep -q BACKUP_READER_VERIFIED
pass 'rollback by postgres (no table ownership) removes triggers + event trigger, grants unchanged, backup refused again; re-apply restores PASS'
echo 'AISEC07_SUPABASE_EXTENSIONS_E2E PASS'
