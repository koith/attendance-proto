\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture. Never connect to a production database.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
CREATE FUNCTION public.can_manage_store(p_store_id bigint) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT (auth.jwt()->>'role')='manager' AND p_store_id=1 $$;
CREATE FUNCTION public.attendance_correction_effective_kst(p_at timestamp, p_actor text, p_created timestamptz)
RETURNS timestamp LANGUAGE sql IMMUTABLE AS $$ SELECT p_at $$;

CREATE TABLE public.employees(id bigint PRIMARY KEY, store_id bigint NOT NULL);
CREATE TABLE public.attendance_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL, event_type text NOT NULL,
 event_at timestamp without time zone NOT NULL
);
CREATE TABLE public.event_corrections (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_id bigint, employee_id bigint NOT NULL, action text NOT NULL,
 new_event_at timestamp without time zone, new_event_type text,
 reason text, created_by text, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT USAGE ON SCHEMA public, auth TO authenticated,anon;
INSERT INTO employees VALUES(10,1),(20,1),(30,2);
-- Employee 10 original 09:00-13:00 KST and 18:00-20:00 KST.
INSERT INTO attendance_events(employee_id,event_type,event_at) VALUES
 (10,'IN','2026-10-10 00:00:00'),
 (10,'OUT','2026-10-10 04:00:00'),
 (10,'IN','2026-10-10 09:00:00'),
 (10,'OUT','2026-10-10 11:00:00');
-- Employee 20 incomplete IN on another day.
INSERT INTO attendance_events(employee_id,event_type,event_at)
 VALUES (20,'IN','2026-10-20 00:00:00');

\ir ../../supabase/migrations/20261102161000_atomic_manual_attendance_shift.sql

DO $tests$
DECLARE
  result jsonb;
  count_before bigint;
  error_seen boolean;
BEGIN
  IF has_function_privilege('anon','public.admin_add_completed_attendance_shift(bigint,timestamp,timestamp,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous must not execute manager-only shift creation';
  END IF;
  IF NOT has_function_privilege('authenticated','public.admin_add_completed_attendance_shift(bigint,timestamp,timestamp,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Manager RPC callable privilege missing';
  END IF;
  RAISE NOTICE 'PASS anonymous RPC blocked';

  PERFORM set_config('request.jwt.claims','{"role":"manager","email":"synthetic@example.invalid"}',false);
  result:=public.admin_add_completed_attendance_shift(
    10,'2026-10-10 14:00','2026-10-10 16:00','synthetic complete shift');
  IF result->>'ok'<>'true' OR (result->>'in_id')::bigint IS NULL OR (result->>'out_id')::bigint IS NULL
    THEN RAISE EXCEPTION 'Valid complete shift failed'; END IF;
  IF (SELECT count(*) FROM event_corrections WHERE employee_id=10 AND action='ADD')<>2 THEN
    RAISE EXCEPTION 'Pair was not inserted atomically';
  END IF;
  RAISE NOTICE 'PASS valid nonoverlapping shift creates exactly two events';

  count_before:=(SELECT count(*) FROM event_corrections);
  error_seen:=false;
  BEGIN
    PERFORM public.admin_add_completed_attendance_shift(
      10,'2026-10-10 12:00','2026-10-10 15:00','synthetic overlap');
  EXCEPTION WHEN raise_exception THEN
    error_seen:=SQLERRM='OVERLAPPING_ATTENDANCE_INTERVAL';
  END;
  IF NOT error_seen OR (SELECT count(*) FROM event_corrections)<>count_before THEN
    RAISE EXCEPTION 'Overlapping original shift changed data'; END IF;
  RAISE NOTICE 'PASS overlap with existing raw shift rejected without partial event';

  error_seen:=false;
  BEGIN
    PERFORM public.admin_add_completed_attendance_shift(
      10,'2026-10-10 17:00','2026-10-10 19:00','synthetic future crossing');
  EXCEPTION WHEN raise_exception THEN
    error_seen:=SQLERRM='OVERLAPPING_ATTENDANCE_INTERVAL';
  END;
  IF NOT error_seen OR (SELECT count(*) FROM event_corrections)<>count_before THEN
    RAISE EXCEPTION 'Overlap crossing later shift changed data'; END IF;
  RAISE NOTICE 'PASS overlap with later already-scheduled shift rejected';

  error_seen:=false;
  BEGIN
    PERFORM public.admin_add_completed_attendance_shift(
      20,'2026-10-20 10:00','2026-10-20 12:00','synthetic incomplete');
  EXCEPTION WHEN raise_exception THEN
    error_seen:=SQLERRM='OVERLAPPING_ATTENDANCE_INTERVAL';
  END;
  IF NOT error_seen OR (SELECT count(*) FROM event_corrections)<>count_before THEN
    RAISE EXCEPTION 'Existing open IN collision was not rejected'; END IF;
  RAISE NOTICE 'PASS open IN cannot be overwritten';

  error_seen:=false;
  BEGIN
    PERFORM public.admin_add_completed_attendance_shift(
      10,'2026-10-10 17:00','2026-10-10 17:00','synthetic invalid');
  EXCEPTION WHEN raise_exception THEN
    error_seen:=SQLERRM='INVALID_ATTENDANCE_INTERVAL';
  END;
  IF NOT error_seen OR (SELECT count(*) FROM event_corrections)<>count_before THEN
    RAISE EXCEPTION 'Invalid interval was not rejected'; END IF;
  RAISE NOTICE 'PASS invalid time range rejected';

  error_seen:=false;
  BEGIN
    PERFORM public.admin_add_completed_attendance_shift(
      30,'2026-10-10 12:00','2026-10-10 13:00','synthetic cross store');
  EXCEPTION WHEN raise_exception THEN
    error_seen:=SQLERRM='NOT_AUTHORIZED';
  END;
  IF NOT error_seen OR (SELECT count(*) FROM event_corrections)<>count_before THEN
    RAISE EXCEPTION 'Cross-store manager access was not denied'; END IF;
  RAISE NOTICE 'PASS cross-store access denied';

  PERFORM set_config('request.jwt.claims','{"role":"anon"}',false);
  error_seen:=false;
  BEGIN
    PERFORM public.admin_add_completed_attendance_shift(
      10,'2026-10-10 16:15','2026-10-10 17:00','synthetic unauth');
  EXCEPTION WHEN raise_exception THEN
    error_seen:=SQLERRM='NOT_AUTHORIZED';
  END;
  IF NOT error_seen OR (SELECT count(*) FROM event_corrections)<>count_before THEN
    RAISE EXCEPTION 'Unauthenticated caller could write'; END IF;
  RAISE NOTICE 'PASS unauthenticated authorization denied';

  PERFORM set_config('request.jwt.claims','{"role":"manager","email":"synthetic@example.invalid"}',false);
  result:=public.admin_add_completed_attendance_shift(
    20,'2026-10-11 23:30','2026-10-12 02:00','synthetic overnight');
  IF result->>'ok'<>'true' OR
    (SELECT count(*) FROM event_corrections WHERE employee_id=20)<>2 THEN
    RAISE EXCEPTION 'Cross-midnight shift failed'; END IF;
  RAISE NOTICE 'PASS overnight valid shift';

  IF (SELECT count(*) FROM attendance_events)<>5 THEN
    RAISE EXCEPTION 'Original attendance events were modified'; END IF;
  RAISE NOTICE 'PASS historical source attendance stays untouched';
END $tests$;
\echo ATOMIC_MANUAL_SHIFT_PG_PASS
