\set ON_ERROR_STOP on
-- GoTrue has already migrated auth.* on the disposable localhost PostgreSQL.
DO $$ BEGIN
 IF current_database()<>'qa1243_sec01' OR inet_server_addr() IS NULL
 OR current_setting('qa1243.local_fixture',true) IS DISTINCT FROM 'SEC01_LOCAL_CI_ONLY' THEN
  RAISE EXCEPTION 'LOCAL_DISPOSABLE_SEC01_DATABASE_REQUIRED';
 END IF;
END $$;
SET search_path=public;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticator LOGIN PASSWORD 'sec01-local-only' NOINHERIT;
GRANT anon,authenticated,service_role TO authenticator;
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users(id));
\ir staged_guard.sql
CREATE FUNCTION public.qa_sec01_probe() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'OK'::text $$;
REVOKE ALL ON FUNCTION public.qa_sec01_probe() FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qa_sec01_probe() TO anon,authenticated;
-- No PGRST_DB_PRE_REQUEST environment override: this exact local role setting
-- must activate and later RESET/reload must really restore the original config.
ALTER ROLE authenticator SET pgrst.db_pre_request='session_guard.require_latest_session';
NOTIFY pgrst,'reload config';
