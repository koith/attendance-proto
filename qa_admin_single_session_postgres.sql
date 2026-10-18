\set ON_ERROR_STOP on
BEGIN;
-- Purely isolated fixture DB. Never import actual user emails/sessions.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE authenticator NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY,admin_role text,store_id bigint);
INSERT INTO public.admin_users VALUES ('11111111-1111-1111-1111-111111111111','HQ',null);
INSERT INTO auth.sessions(id,user_id,created_at) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',now()-interval '2 hours'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111',now()-interval '1 hour'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222',now()-interval '1 hour');
\ir supabase/migrations/20261017050000_single_admin_session_guard_prepare.sql
DO $qa$
DECLARE selected uuid;
BEGIN
 SELECT session_id INTO selected FROM session_guard.latest_session
 WHERE user_id='11111111-1111-1111-1111-111111111111';
 IF selected<>'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
 THEN RAISE EXCEPTION 'Backfill latest session wrong'; END IF;
 IF has_table_privilege('anon','session_guard.latest_session','SELECT')
 OR has_table_privilege('authenticated','session_guard.latest_session','SELECT')
 THEN RAISE EXCEPTION 'Sensitive session table readable'; END IF;
 IF NOT has_function_privilege('anon','session_guard.require_latest_session()','EXECUTE')
 OR NOT has_function_privilege('authenticated','session_guard.require_latest_session()','EXECUTE')
 THEN RAISE EXCEPTION 'Guest/admin pre-request hook invocation privilege missing'; END IF;
END $qa$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $qa$
BEGIN
 PERFORM session_guard.require_latest_session(); -- anonymous POS remains functional
END $qa$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222"}',true);
SELECT session_guard.require_latest_session(); -- non-admin authenticated without session_id allowed
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',true);
SELECT session_guard.require_latest_session(); -- newest admin works
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',true);
DO $qa$
BEGIN
 BEGIN
  PERFORM session_guard.require_latest_session();
  RAISE EXCEPTION 'Old admin session unexpectedly authorized';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
 END;
END $qa$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}',true);
DO $qa$
BEGIN
 BEGIN
  PERFORM session_guard.require_latest_session();
  RAISE EXCEPTION 'Missing session_id unexpectedly authorized';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
 END;
END $qa$;
RESET ROLE;
INSERT INTO auth.sessions(id,user_id,created_at) VALUES
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111',now());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"dddddddd-dddd-dddd-dddd-dddddddddddd"}',true);
SELECT session_guard.require_latest_session(); -- new login takes over
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',true);
DO $qa$
BEGIN
 BEGIN
  PERFORM session_guard.require_latest_session();
  RAISE EXCEPTION 'Superseded previously-newest admin session unexpectedly authorized';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
 END;
END $qa$;
RESET ROLE;
-- DDL activation/rollback proof on fixture only. Do not set production role.
ALTER ROLE authenticator SET pgrst.db_pre_request='session_guard.require_latest_session';
DO $qa$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator'
  AND array_to_string(rolconfig,',') LIKE '%pgrst.db_pre_request=session_guard.require_latest_session%')
 THEN RAISE EXCEPTION 'Pre-request hook setting not activated in fixture'; END IF;
END $qa$;
ALTER ROLE authenticator RESET pgrst.db_pre_request;
DO $qa$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator'
  AND array_to_string(rolconfig,',') LIKE '%pgrst.db_pre_request=%')
 THEN RAISE EXCEPTION 'Pre-request hook rollback failed in fixture'; END IF;
END $qa$;
ROLLBACK;
SELECT 'PASS SEC-01: guest POS, admin old/new, nonadmin, session trigger, rollback, table privacy' AS result;
