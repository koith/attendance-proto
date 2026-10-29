\set ON_ERROR_STOP on
-- Run in disposable PostgreSQL after qa_attendance_consumer_timezone_postgres.sql
-- and qa_admin_correction_save_readback_postgres.sql; never against live staff.
CREATE OR REPLACE FUNCTION public.can_manage_store_attendance(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.can_manage_store(p_store_id)
$$;
CREATE ROLE service_role NOLOGIN;
\ir qa_store_attendance_correct_event_fixture.sql
\ir supabase/migrations/20261029134000_atomic_recorrect_admin_added_attendance.sql
DO $qa$
DECLARE
  v_initial_events integer;
  v_in bigint;
  v_out bigint;
  v_new bigint;
  v_second bigint;
  v_competing bigint;
  v_before integer;
BEGIN
  PERFORM set_config('fixture.allowed_store','1',true);
  SELECT count(*) INTO v_initial_events FROM public.attendance_events;

  -- Same 07:02-13:00 -> 13:10 -> 13:15 case reported by the store manager.
  v_in:=public.store_attendance_correct_event(
    'ADD',NULL,931,timestamp '2026-10-24 07:02','IN','QA manual clock-in'
  );
  v_out:=public.store_attendance_correct_event(
    'ADD',NULL,931,timestamp '2026-10-24 13:00','OUT','QA manual clock-out'
  );
  v_new:=public.store_attendance_replace_added_event(
    v_out,931,timestamp '2026-10-24 13:10','OUT','퇴근처리누락'
  );
  IF v_new=v_out OR
     NOT EXISTS(SELECT 1 FROM public.event_corrections c
       WHERE c.id=v_new AND c.action='ADD' AND
         c.new_event_at=timestamp '2026-10-24 13:10' AND
         c.reason LIKE '%[REPLACES_ADD:%')
     OR NOT EXISTS(SELECT 1 FROM public.event_corrections c
       WHERE c.id=v_out AND c.reason LIKE '%[VOID_ADD:%')
  THEN RAISE EXCEPTION 'MANUAL_RECORRECTION_NOT_AUDITED'; END IF;

  IF EXISTS(SELECT 1 FROM public.sheet_month_attendance_projection(1,'2026-10') x
       WHERE x.employee_id=931 AND x.source='correction' AND x.event_id=v_out)
     OR NOT EXISTS(SELECT 1 FROM public.sheet_month_attendance_projection(1,'2026-10') x
       WHERE x.employee_id=931 AND x.source='correction' AND x.event_id=v_new
         AND x.event_at=timestamp '2026-10-24 04:10')
  THEN RAISE EXCEPTION 'FIRST_EDIT_SHEET_OR_TIMEZONE_MISMATCH'; END IF;

  v_second:=public.store_attendance_replace_added_event(
    v_new,931,timestamp '2026-10-24 13:15','OUT','퇴근시각 재확인'
  );
  IF v_second=v_new OR NOT EXISTS(
    SELECT 1 FROM public.sheet_month_attendance_projection(1,'2026-10') x
    WHERE x.event_id=v_second AND x.event_at=timestamp '2026-10-24 04:15'
  ) OR EXISTS(
    SELECT 1 FROM public.sheet_month_attendance_projection(1,'2026-10') x
    WHERE x.event_id IN (v_out,v_new)
  ) THEN RAISE EXCEPTION 'REPEATED_EDIT_EFFECTIVE_SESSION_BROKEN'; END IF;

  -- A colliding correction must roll back its VOID_ADD, not make the
  -- existing valid shift disappear.
  v_competing:=public.store_attendance_correct_event(
    'ADD',NULL,931,timestamp '2026-10-24 13:30','OUT','QA second effective OUT'
  );
  SELECT count(*) INTO v_before FROM public.event_corrections;
  BEGIN
    PERFORM public.store_attendance_replace_added_event(
      v_second,931,timestamp '2026-10-24 13:30','OUT','QA collision'
    );
    RAISE EXCEPTION 'DUPLICATE_RECORRECTION_WAS_ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'DUPLICATE_ATTENDANCE_CORRECTION' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.event_corrections)<>v_before
     OR EXISTS(SELECT 1 FROM public.event_corrections
        WHERE id=v_second AND reason LIKE '%[VOID_ADD:%')
  THEN RAISE EXCEPTION 'REPLACEMENT_WAS_NOT_ATOMIC'; END IF;

  BEGIN
    PERFORM public.store_attendance_replace_added_event(
      v_second,931,timestamp '2026-10-24 13:15','OUT','QA no-op'
    );
    RAISE EXCEPTION 'UNCHANGED_RECORRECTION_WAS_ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'CORRECTION_TIME_UNCHANGED' THEN RAISE; END IF;
  END;

  PERFORM set_config('fixture.allowed_store','2',true);
  BEGIN
    PERFORM public.store_attendance_replace_added_event(
      v_second,931,timestamp '2026-10-24 13:17','OUT','other store edit'
    );
    RAISE EXCEPTION 'CROSS_STORE_RECORRECTION_WAS_ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.attendance_events)<>v_initial_events
  THEN RAISE EXCEPTION 'RAW_PUNCH_EVENTS_CHANGED'; END IF;
  IF has_function_privilege('anon',
    'public.store_attendance_replace_added_event(bigint,bigint,timestamp without time zone,text,text)',
    'EXECUTE')
  THEN RAISE EXCEPTION 'ANON_MUST_NOT_EXECUTE_RECORRECTION'; END IF;
  IF NOT has_function_privilege('authenticated',
    'public.store_attendance_replace_added_event(bigint,bigint,timestamp without time zone,text,text)',
    'EXECUTE')
  THEN RAISE EXCEPTION 'AUTHORIZED_MANAGER_CANNOT_EXECUTE_RECORRECTION'; END IF;
END;
$qa$;
SELECT 'PASS atomic repeated manual re-correction: 13:00 -> 13:10 -> 13:15, KST/Sheet, rollback, audit, isolation' AS result;
