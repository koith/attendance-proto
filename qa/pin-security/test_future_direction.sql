\set ON_ERROR_STOP on
-- Disposable fixture created by qa/pin-security/setup.sql and baseline.sql.
-- Regression and healthy PIN/anon/clock contract, never run on live production.
DO $fixture$
DECLARE
 v_response json;
BEGIN
 IF current_database() NOT LIKE 'punch_future_fixture%' THEN
   RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
 IF (SELECT enabled FROM pin_private.settings WHERE id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'PIN_GUARD_NOT_ACTIVE'; END IF;
 IF EXISTS(SELECT 1 FROM attendance_events WHERE employee_id IN (710030,710031,710032,710033)) THEN
   RAISE EXCEPTION 'FIXTURE_IS_NOT_CLEAN'; END IF;
END $fixture$;

-- Future manager ADD IN must not cause an immediate OUT.
INSERT INTO public.event_corrections
 (employee_id,event_id,action,new_event_at,new_event_type,reason,created_by)
VALUES
 (710030,NULL,'ADD',(clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '3 days','IN','synthetic future add','fixture:manager'),
 (710031,NULL,'ADD',(clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '3 days','OUT','synthetic future out','fixture:manager'),
 (710032,NULL,'ADD',(clock_timestamp() AT TIME ZONE 'Asia/Seoul')-interval '2 hours','IN','synthetic past add','fixture:manager');
INSERT INTO public.attendance_events
 (employee_id,event_type,event_at,server_received_at,device_id)
VALUES
 (710031,'IN',(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour',
  (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour','SYNTHETIC');

DO $baseline$
DECLARE result json;
BEGIN
 result:=public.punch(710030,'1234','SYNTHETIC_BASELINE',NULL);
 IF result->>'type' IS DISTINCT FROM 'OUT' THEN
   RAISE EXCEPTION 'FUTURE_PUNCH_BASELINE_NOT_REPRODUCED'; END IF;
END $baseline$;
-- Remove only the synthetic baseline output. The production DB must NEVER
-- be targeted by this script.
DELETE FROM public.attendance_events WHERE employee_id=710030 AND device_id='SYNTHETIC_BASELINE';
\echo FUTURE_PUNCH_DIRECTION_BUG_REPRODUCED

\ir ../../supabase/migrations/20261102224000_punch_ignore_future_effective_events.sql

DO $tests$
DECLARE
 v_result json;
 v_in_count integer;
BEGIN
 IF (SELECT count(*) FROM pin_private.source_archive a
    WHERE md5(pg_get_functiondef(a.signature::regprocedure))=a.installed_md5)<>15
 THEN RAISE EXCEPTION 'PIN_ARCHIVE_DRIFT_AFTER_FIX'; END IF;

 v_result:=public.punch(710030,'1234','SYNTHETIC',NULL);
 IF v_result->>'type' IS DISTINCT FROM 'IN' OR v_result->>'ok' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'FUTURE_ADD_MUST_NOT_FLIP_TO_OUT'; END IF;
 RAISE NOTICE 'PASS future manager IN ignored until it occurs';

 v_result:=public.punch(710031,'1234','SYNTHETIC',NULL);
 IF v_result->>'type' IS DISTINCT FROM 'OUT' OR v_result->>'ok' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'FUTURE_OUT_MUST_NOT_FLIP_INTO_IN'; END IF;
 RAISE NOTICE 'PASS current raw IN -> OUT despite future manager OUT';

 v_result:=public.punch(710032,'1234','SYNTHETIC',NULL);
 IF v_result->>'type' IS DISTINCT FROM 'OUT' THEN
   RAISE EXCEPTION 'PAST_MANAGER_IN_MUST_STILL_LEAD_TO_OUT'; END IF;
 RAISE NOTICE 'PASS historical manager IN still leads to OUT';

 v_result:=public.punch(710033,'1234','SYNTHETIC',NULL);
 IF v_result->>'type' IS DISTINCT FROM 'IN' THEN
   RAISE EXCEPTION 'CLEAN_EMPLOYEE_MUST_START_WITH_IN'; END IF;
 RAISE NOTICE 'PASS other employees preserve original IN contract';

 IF has_schema_privilege('anon','pin_private','USAGE')
    OR has_function_privilege('anon','pin_private.verify(bigint,text,bigint)','EXECUTE')
    OR NOT has_function_privilege('anon','public.punch(bigint,text,text,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'PIN_PRIVILEGES_REGRESSED'; END IF;

 SELECT count(*) INTO v_in_count FROM attendance_events WHERE employee_id=710030;
 IF v_in_count<>1 THEN RAISE EXCEPTION 'DUPLICATE_BASELINE_RECORD_LEFT'; END IF;
 IF NOT (SELECT enabled FROM pin_private.settings WHERE id) THEN
   RAISE EXCEPTION 'PIN_GUARD_DISABLED_UNEXPECTEDLY'; END IF;
 RAISE NOTICE 'PASS protected RPC permission/guard and synthetic row invariants';
END $tests$;
\echo PUNCH_FUTURE_DIRECTION_PG_PASS
