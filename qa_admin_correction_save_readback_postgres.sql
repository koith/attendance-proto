\set ON_ERROR_STOP on
-- True PostgreSQL integration, synthetic rows only in disposable CI PostgreSQL.
-- CI executes qa_attendance_consumer_timezone_postgres.sql immediately before
-- this extension in the SAME disposable PostgreSQL database. Roles are
-- cluster-global, so sourcing the fixture twice would conflict on anon.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql
AS $$ SELECT '{"email":"synthetic-manager@example.invalid"}'::jsonb $$;
\ir supabase/migrations/20261026001000_fix_manager_correction_double_utc.sql
DO $qa$
DECLARE
 id bigint; added bigint; actual timestamp; kst timestamp; utc_clock timestamp;
 initial_events int;
BEGIN
 PERFORM set_config('fixture.allowed_store','1',true);
 SELECT count(*) INTO initial_events FROM public.attendance_events;
 -- 13:08 KST must stay 13:08 for manager/PIN payroll/UI, and become 04:08
 -- in effective UTC for Sheets projection. Never subtract nine hours twice.
 id:=public.admin_correct_event('EDIT_TIME',4,931,
   timestamp '2026-10-12 13:08:00','OUT','QA corrected check-out');
 SELECT c.new_event_at,
   public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at),
   public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at)
 INTO actual,kst,utc_clock
 FROM public.event_corrections c WHERE c.id=id;
 IF actual<>timestamp '2026-10-12 13:08' OR
    kst<>timestamp '2026-10-12 13:08' OR
    utc_clock<>timestamp '2026-10-12 04:08'
 THEN RAISE EXCEPTION 'DOUBLE_TIMEZONE_CONVERSION actual=% kst=% utc=%',actual,kst,utc_clock; END IF;
 -- A failed/uncertain network response must not allow repeated ADD at same
 -- employee + type + wallclock to manufacture multiple orphan sessions.
 added:=public.admin_correct_event('ADD',null,931,
   timestamp '2026-10-12 15:12','OUT','QA missing check-out');
 BEGIN
   PERFORM public.admin_correct_event('ADD',null,931,
     timestamp '2026-10-12 15:12','OUT','QA duplicate check-out');
   RAISE EXCEPTION 'DUPLICATE_ADD_WAS_ALLOWED';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'DUPLICATE_ATTENDANCE_CORRECTION' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.event_corrections
     WHERE employee_id=931 AND action='ADD' AND new_event_at=timestamp '2026-10-12 15:12')<>1
 THEN RAISE EXCEPTION 'DUPLICATE_ADDED'; END IF;
 -- Historical cutover, automatic OUT, and raw records remain unchanged.
 IF public.attendance_correction_effective_kst(
    timestamp '2026-10-12 16:00','synthetic-manager',
    timestamptz '2026-10-13 03:00+00')<>timestamp '2026-10-13 01:00'
 THEN RAISE EXCEPTION 'LEGACY_CORRECTION_REGRESSION'; END IF;
 IF public.attendance_correction_effective_kst(
    timestamp '2026-10-12 17:00','system:auto-close',now())<>timestamp '2026-10-13 02:00'
 THEN RAISE EXCEPTION 'AUTO_CLOSE_REGRESSION'; END IF;
 IF (SELECT count(*) FROM public.attendance_events)<>initial_events
 THEN RAISE EXCEPTION 'RAW_ATTENDANCE_EVENTS_MUTATED'; END IF;
 PERFORM set_config('fixture.allowed_store','2',true);
 BEGIN
   PERFORM public.admin_correct_event('EDIT_TIME',4,931,
     timestamp '2026-10-12 14:00','OUT','cross store denied');
   RAISE EXCEPTION 'CROSS_STORE_EDIT_ALLOWED';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF;
 END;
END $qa$;
SELECT 'PASS synthetic PostgreSQL: corrected human KST/UTC, repeat ADD denied, original raw intact, legacy/auto-close and store guards' AS result;
