\set ON_ERROR_STOP on
-- Disposable PostgreSQL 16 DB, used only by local PostgREST container.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE authenticator LOGIN PASSWORD 'synthetic-http-fixture-only';
GRANT anon,authenticated TO authenticator;
CREATE SCHEMA auth;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);
INSERT INTO public.admin_users VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO auth.sessions(id,user_id,created_at) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',now()-interval '2 hours'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111',now()-interval '1 hour');
\ir supabase/migrations/20261017050000_single_admin_session_guard_prepare.sql
CREATE FUNCTION public.qa_session_http_probe()
RETURNS text LANGUAGE sql STABLE AS $f$ SELECT 'OK'::text; $f$;
REVOKE ALL ON FUNCTION public.qa_session_http_probe() FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qa_session_http_probe() TO anon,authenticated;
ALTER ROLE authenticator SET pgrst.db_pre_request='session_guard.require_latest_session';
NOTIFY pgrst,'reload config';
SELECT 'synthetic PostgREST admin-scope HTTP fixture installed' AS result;
