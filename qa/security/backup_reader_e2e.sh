#!/usr/bin/env bash
# AISEC-07 disposable end-to-end proof: the real capture.mjs succeeds with the
# dedicated read-only backup_reader login, that login cannot write even after
# overriding default_transaction_read_only, a writable login is refused
# (fail-closed), an operating superuser login is refused (no fallback), write-capable
# SECURITY DEFINER functions block the login, and rollback is clean.
# Synthetic data only. Requires: ADMIN_URL (superuser of a DISPOSABLE cluster),
# READER_HOST, READER_PORT, matching psql/pg_dump/pg_restore on PATH, openssl.
set -euo pipefail
: "${ADMIN_URL:?}" "${READER_HOST:?}" "${READER_PORT:?}"
case "$ADMIN_URL" in *127.0.0.1*|*localhost*|*/var/tmp/*|*%2Fvar%2Ftmp*) ;; *) echo 'REFUSING_NON_LOCAL_ADMIN_URL'; exit 2;; esac
WORK="$(mktemp -d)"; SERVER=''
trap '[ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; rm -rf "$WORK"' EXIT
DB=backup_reader_e2e
ADMIN_DB="${ADMIN_URL%/*}/$DB"; ADMIN_DB="${ADMIN_DB}${ADMIN_URL##*/postgres}"
psql_admin(){ psql -X -q -v ON_ERROR_STOP=1 --dbname "$ADMIN_URL" "$@"; }
psql_db(){ psql -X -q -v ON_ERROR_STOP=1 --dbname "$ADMIN_DB" "$@"; }
READER_PW="synthetic-reader-$(openssl rand -hex 8)"
READER_URL="postgresql://backup_reader:${READER_PW}@${READER_HOST}:${READER_PORT}/${DB}?sslmode=disable"
pass(){ echo "PASS $*"; }

psql_admin -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
psql_admin -c "DO \$\$BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='backup_reader') THEN EXECUTE 'DROP OWNED BY backup_reader'; DROP ROLE backup_reader; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_owner') THEN CREATE ROLE app_owner NOLOGIN; END IF; END\$\$"
psql_db <<'SQL'
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE TABLE storage.objects(bucket_id text, name text, metadata jsonb, updated_at timestamptz);
INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111','reader@example.invalid');
INSERT INTO storage.objects VALUES ('fixture','one.txt','{"size":14}',now());
CREATE TABLE public.payroll(id int PRIMARY KEY, amount int NOT NULL);
INSERT INTO public.payroll VALUES (1,100),(2,200);
ALTER TABLE public.payroll OWNER TO app_owner;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY; ALTER TABLE public.payroll FORCE ROW LEVEL SECURITY;
CREATE POLICY deny_all ON public.payroll USING (false);
CREATE SEQUENCE public.receipt_seq; SELECT nextval('public.receipt_seq');
CREATE FUNCTION public.rpc_touch() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
SQL
# Apply twice: idempotent.
psql_db -f security/aisec07_backup_reader_role.sql
psql_db -f security/aisec07_backup_reader_role.sql
psql_db -c "ALTER ROLE backup_reader PASSWORD '${READER_PW}'"
pass 'role SQL applied twice (idempotent)'

psql -X -q -v ON_ERROR_STOP=1 --dbname "$READER_URL" -f security/aisec07_backup_reader_verify.sql 2>"$WORK/verify.log"
grep -q 'BACKUP_READER_VERIFIED' "$WORK/verify.log"; grep -o 'residual_security_definer_executable" : [0-9]*' "$WORK/verify.log" || true
if psql -X -q -v ON_ERROR_STOP=1 --dbname "$ADMIN_DB" -f security/aisec07_backup_reader_verify.sql 2>/dev/null; then
  echo 'CRITICAL: verifier accepted a superuser'; exit 1; fi
pass 'verifier accepts backup_reader and rejects superuser'

# --- SECURITY DEFINER write-capability (AISEC-07): the real production RPC
# exposed to PUBLIC, list_stores(), is loaded VERBATIM from its migration.
awk '/CREATE OR REPLACE FUNCTION public.list_stores\(\)/{p=1} p{print} p&&/^\$function\$;/{exit}' \
  supabase/migrations/20261010235550_onboarding_isolation_pos_and_hq.sql > "$WORK/list_stores.sql"
grep -q 'SECURITY DEFINER' "$WORK/list_stores.sql"
psql_db -c "CREATE TABLE public.stores(id bigint PRIMARY KEY, name text, code text, source_store_key text, is_active boolean, region_group text, onboarding_status text)" \
  -c "INSERT INTO public.stores VALUES (1,'A','a','k1',true,'r','READY'),(2,'B','b','k2',true,'r','DRAFT')"
psql_db -f "$WORK/list_stores.sql"
psql -X -q -v ON_ERROR_STOP=1 --dbname "$READER_URL" -f security/aisec07_backup_reader_verify.sql 2>"$WORK/verify2.log"
grep -q 'public.list_stores()' "$WORK/verify2.log"
before="$(psql -X -At --dbname "$ADMIN_DB" -c "SELECT md5(string_agg(s::text, '|' ORDER BY id)) FROM public.stores s")"
test "$(psql -X -At --dbname "$READER_URL" -c 'SET default_transaction_read_only = off' -c 'SELECT count(*) FROM public.list_stores()' | tail -1)" = 1
test "$(psql -X -At --dbname "$ADMIN_DB" -c "SELECT md5(string_agg(s::text, '|' ORDER BY id)) FROM public.stores s")" = "$before"
pass 'real list_stores() (PUBLIC, SECURITY DEFINER) classified static read-only; executing it as backup_reader changes nothing'

# Each write-capable definer pattern must block the backup login until EXECUTE is revoked from PUBLIC.
psql_db -c "CREATE TABLE public.sd_audit(n int)"
caught=0
for def in \
  "public.sd_plpgsql() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS \$f\$BEGIN INSERT INTO public.sd_audit VALUES (1); END\$f\$" \
  "public.sd_writer() RETURNS int LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS \$f\$BEGIN INSERT INTO public.sd_audit VALUES (2); RETURN 1; END\$f\$" \
  "public.sd_stable_wrapper() RETURNS int LANGUAGE sql STABLE SECURITY DEFINER AS 'SELECT public.sd_writer()'" \
  "public.sd_cte() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'WITH x AS (INSERT INTO public.sd_audit VALUES (3) RETURNING n) SELECT n FROM x'" \
  "public.sd_multi() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1; SELECT 2'" \
  "public.sd_seq() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS 'SELECT nextval(''public.receipt_seq'')'" \
  "public.sd_config() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'SELECT set_config(''role'', ''postgres'', false)'"; do
  name="${def%%(*}"
  psql_db -c "CREATE FUNCTION $def"
  if psql -X -q -v ON_ERROR_STOP=1 --dbname "$READER_URL" -f security/aisec07_backup_reader_verify.sql 2>"$WORK/sd.log"; then
    echo "CRITICAL: verifier accepted executable write-capable definer $name"; exit 1; fi
  grep -q "BACKUP_READER_EXECUTABLE_WRITE_CAPABLE_DEFINER.*${name#public.}" "$WORK/sd.log"
  psql_db -c "REVOKE EXECUTE ON FUNCTION ${name}() FROM PUBLIC"
  caught=$((caught+1))
done
# Proof the threat is real, then proof the remediation works: after REVOKE the login cannot call them.
if psql -X -q --dbname "$READER_URL" -c 'SET default_transaction_read_only = off' -c 'SELECT public.sd_plpgsql()' >/dev/null 2>&1; then
  echo 'CRITICAL: revoked definer still executable'; exit 1; fi
test "$(psql -X -At --dbname "$ADMIN_DB" -c 'SELECT count(*) FROM public.sd_audit')" = 0
psql -X -q -v ON_ERROR_STOP=1 --dbname "$READER_URL" -f security/aisec07_backup_reader_verify.sql 2>/dev/null
psql_db -c 'GRANT EXECUTE ON FUNCTION public.sd_plpgsql() TO PUBLIC'
psql -X -q --dbname "$READER_URL" -c 'SET default_transaction_read_only = off' -c 'SELECT public.sd_plpgsql()' >/dev/null
test "$(psql -X -At --dbname "$ADMIN_DB" -c 'SELECT count(*) FROM public.sd_audit')" = 1
psql_db -c 'REVOKE EXECUTE ON FUNCTION public.sd_plpgsql() FROM PUBLIC' -c 'TRUNCATE public.sd_audit'
pass "verifier refused $caught write-capable SECURITY DEFINER patterns (plpgsql, volatile, STABLE wrapper, data-modifying CTE, multi-statement, nextval, set_config); threat reproduced (PUBLIC definer wrote as backup_reader) and REVOKE FROM PUBLIC removes it"

denied=0
for stmt in "INSERT INTO public.payroll VALUES (9,9)" "UPDATE public.payroll SET amount=0" "DELETE FROM public.payroll" \
  "TRUNCATE public.payroll" "INSERT INTO auth.users VALUES (gen_random_uuid(),'x')" "UPDATE storage.objects SET name='x'" \
  "CREATE TABLE public.evil(i int)" "CREATE SCHEMA evil" "ALTER TABLE public.payroll DISABLE ROW LEVEL SECURITY" \
  "DROP TABLE public.payroll" "CREATE ROLE evil" "SELECT setval('public.receipt_seq', 999)" \
  "CREATE DATABASE evil"; do
  if psql -X -q -v ON_ERROR_STOP=1 --dbname "$READER_URL" -c "SET default_transaction_read_only = off" -c "$stmt" >/dev/null 2>&1; then
    echo "CRITICAL: backup_reader executed: $stmt"; exit 1; fi
  denied=$((denied+1))
done
# GRANT by a non-owner only warns ("no privileges were granted"): assert the EFFECT.
psql -X -q --dbname "$READER_URL" -c 'GRANT SELECT, INSERT ON public.payroll TO PUBLIC' >/dev/null 2>&1 || true
test "$(psql -X -At --dbname "$ADMIN_DB" -c "SELECT has_table_privilege('public','public.payroll','SELECT') OR has_table_privilege('public','public.payroll','INSERT')")" = f
denied=$((denied+1))
test "$(psql -X -At --dbname "$READER_URL" -c 'SELECT count(*) FROM public.payroll')" = 2
test "$(psql -X -At --dbname "$ADMIN_DB" -c 'SELECT count(*)::text||sum(amount)::text FROM public.payroll')" = 2300
pass "backup_reader denied $denied write/DDL statements even with read-only default overridden; reads RLS-forced rows"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$WORK/priv.pem" 2>/dev/null
openssl pkey -in "$WORK/priv.pem" -pubout -out "$WORK/pub.pem"
node qa/security/fake_storage_server.mjs >/dev/null 2>&1 & SERVER=$!
for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/4100) 2>/dev/null && break; sleep 0.25; done
# Exactly the workflow sequence: preflight (AISEC-07), then the UNCHANGED capture.mjs.
run_backup(){ # $1 db url  $2 (unused)  $3 out
  env -u SUPABASE_ACCESS_TOKEN SUPABASE_DB_URL="$1" \
    SUPABASE_ACCESS_TOKEN=synthetic-management-only RUNNER_TEMP="$WORK" \
    SUPABASE_URL=http://127.0.0.1:4100 SUPABASE_SERVICE_ROLE_KEY=synthetic-storage-only \
    SEC_BACKUP_ALLOW_LOCAL_AUTH_FIXTURE=1 SEC_BACKUP_AUTH_FIXTURE_URL=http://127.0.0.1:4100/v1/projects/waluhdgqhwjjwmflhrle/config/auth \
    SEC_BACKUP_RECIPIENT_PEM="$WORK/pub.pem" SEC_BACKUP_OUT="$3" \
    bash -c 'bash scripts/security/backup_reader_preflight.sh && node scripts/security/capture.mjs'; }
check_archive(){ # $1 sealed
  rm -rf "$WORK/x" "$WORK/x.tar.gz"; mkdir "$WORK/x"
  node scripts/security/unseal.mjs "$1" "$WORK/priv.pem" "$WORK/x.tar.gz"
  tar -xzf "$WORK/x.tar.gz" -C "$WORK/x"
  node -e "const m=require('$WORK/x/manifest.json');if(m.full_storage_count!==1||m.auth_config.captured!==true)throw Error('CONTENT')"
  psql_admin -c "DROP DATABASE IF EXISTS ${DB}_restore" -c "CREATE DATABASE ${DB}_restore"
  pg_restore --no-owner --no-acl --exit-on-error --dbname "${ADMIN_URL%/*}/${DB}_restore${ADMIN_URL##*/postgres}" "$WORK/x/database.dump"
  test "$(psql -X -At --dbname "${ADMIN_URL%/*}/${DB}_restore${ADMIN_URL##*/postgres}" -c 'SELECT count(*) FROM public.payroll')" = 2
}
run_backup "$READER_URL" true "$WORK/reader.sealed" > "$WORK/reader.log"
grep -q 'BACKUP_DB_CREDENTIAL_SOURCE=dedicated_readonly' "$WORK/reader.log"; grep -q 'BACKUP_READER_VERIFIED' "$WORK/reader.log"
grep -q 'ENCRYPTED_BACKUP_CREATED' "$WORK/reader.log"
check_archive "$WORK/reader.sealed"
pass 'workflow preflight + unchanged capture.mjs as backup_reader: sealed archive, RLS-forced rows restored'

psql_db -c 'GRANT INSERT ON public.payroll TO backup_reader'
if run_backup "$READER_URL" true "$WORK/bad.sealed" >"$WORK/bad.log" 2>&1; then echo 'CRITICAL: backup ran with a writable backup login'; exit 1; fi
test ! -e "$WORK/bad.sealed"; grep -q 'BACKUP_BLOCKED_DB_LOGIN_NOT_PROVEN_READ_ONLY' "$WORK/bad.log"; grep -q 'BACKUP_READER_HAS_WRITE_PRIVILEGE' "$WORK/bad.log"
psql_db -c 'REVOKE INSERT ON public.payroll FROM backup_reader'
pass 'fail-closed: writable dedicated login produces no backup'

# No fallback: if the OPERATING superuser URL is registered as the backup
# secret by mistake, the backup refuses to run at all.
if run_backup "$ADMIN_DB" x "$WORK/op.sealed" >"$WORK/op.log" 2>&1; then echo 'CRITICAL: backup ran with an operating (superuser) login'; exit 1; fi
test ! -e "$WORK/op.sealed"; grep -q 'BACKUP_READER_NOT_LEAST_PRIVILEGE' "$WORK/op.log"
pass 'no fallback: operating superuser login registered as backup secret is refused, no archive'

psql_db -f security/aisec07_backup_reader_role_rollback.sql
test "$(psql -X -At --dbname "$ADMIN_URL" -c "SELECT count(*) FROM pg_roles WHERE rolname='backup_reader'")" = 0
psql_db -f security/aisec07_backup_reader_role.sql
psql_db -f security/aisec07_backup_reader_role_rollback.sql
pass 'rollback removes role cleanly and re-apply/rollback cycle works'
psql_admin -c "DROP DATABASE IF EXISTS ${DB}_restore" -c "DROP DATABASE IF EXISTS $DB"
echo 'AISEC07_BACKUP_READER_E2E PASS'
