\set ON_ERROR_STOP on
-- All fixtures in disposable PostgreSQL. No production attendance/store modifications.
\ir qa_attendance_consumer_timezone_postgres.sql
ALTER TABLE public.substitution_requests ADD COLUMN resolved_at timestamptz;
ALTER TABLE public.employment_periods ADD COLUMN updated_at timestamptz;
ALTER TABLE public.employment_contracts ADD COLUMN updated_at timestamptz;
INSERT INTO public.employees(id,name,employee_no,is_active,store_id,pin_bcrypt) VALUES
 (934,'New KST edited OUT then actual IN',34,true,1,extensions.crypt('1234',extensions.gen_salt('bf'))),
 (936,'VOID_ADD should remain working',36,true,1,extensions.crypt('1234',extensions.gen_salt('bf'))),
 (937,'New KST OUT scheduled substitution',37,true,1,extensions.crypt('1234',extensions.gen_salt('bf'))),
 (938,'Legacy UTC OUT scheduled substitution',38,true,1,extensions.crypt('1234',extensions.gen_salt('bf')));
INSERT INTO public.attendance_events(employee_id,event_type,event_at,device_id) VALUES
 (934,'IN','2026-10-12 10:57:00','POS'),(934,'OUT','2026-10-12 16:28:00','POS'),
 (934,'IN','2026-10-12 18:00:00','POS'),
 (936,'IN','2026-10-12 10:57:00','POS'),
 (937,'IN','2026-10-12 10:57:00','SUBSTITUTE:1003'),(937,'OUT','2026-10-12 16:28:00','POS'),
 (938,'IN','2026-10-12 10:57:00','SUBSTITUTE:1004'),(938,'OUT','2026-10-12 16:28:00','POS');
INSERT INTO public.event_corrections(employee_id,event_id,action,new_event_at,new_event_type,created_by,created_at,reason)
VALUES
 (934,(SELECT id FROM public.attendance_events WHERE employee_id=934 AND event_type='OUT' LIMIT 1),'EDIT_TIME','2026-10-13 01:30','OUT','fixture:manager','2026-10-13 06:10+00','new wall-time correction'),
 (936,null,'ADD','2026-10-12 17:00','OUT','system:auto-close','2026-10-13 03:00+00','SYSTEM_STORE_CLOSE [VOID_ADD:999]'),
 (937,(SELECT id FROM public.attendance_events WHERE employee_id=937 AND event_type='OUT' LIMIT 1),'EDIT_TIME','2026-10-13 01:30','OUT','fixture:manager','2026-10-13 06:10+00','new wall-time correction'),
 (938,(SELECT id FROM public.attendance_events WHERE employee_id=938 AND event_type='OUT' LIMIT 1),'EDIT_TIME','2026-10-12 16:00','OUT','fixture:manager','2026-10-13 03:00+00','legacy UTC correction');
INSERT INTO public.substitution_requests(id,substitute_employee_id,requester_employee_id,status,work_start,work_end,actual_minutes)
VALUES
 (1002,934,930,'ACCEPTED',clock_timestamp() at time zone 'Asia/Seoul'-interval '10 minutes',clock_timestamp() at time zone 'Asia/Seoul'+interval '90 minutes',0),
 (1003,937,930,'IN_PROGRESS','2026-10-12 19:57','2026-10-13 02:00',0),
 (1004,938,930,'IN_PROGRESS','2026-10-12 19:57','2026-10-13 02:00',0);
\ir supabase/migrations/20261013200500_substitution_retirement_correction_clock.sql
DO $qa$
DECLARE j json; updated integer;
BEGIN
 IF public.substitution_is_working(934) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'NEW_KST_CORRECTION_MASKED_LATER_REAL_IN'; END IF;
 IF public.substitution_is_working(936) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'VOID_ADD_SYNTHETIC_OUT_RESURRECTED'; END IF;
 j:=public.substitution_clock_in(1002,934,'1234');
 IF j->>'error' <> 'ALREADY_WORKING'
 THEN RAISE EXCEPTION 'DUPLICATE_SUBSTITUTE_IN_ALLOWED_AFTER_CORRECTION %',j; END IF;
 IF (SELECT count(*) FROM public.attendance_events WHERE employee_id=934 AND device_id='SUBSTITUTE:1002')<>0
 THEN RAISE EXCEPTION 'INCORRECT_SUBSTITUTE_IN_WRITTEN'; END IF;
 PERFORM public.substitution_refresh_one(1004);
 SELECT actual_minutes INTO updated FROM public.substitution_requests WHERE id=1004;
 IF updated <> 303 THEN RAISE EXCEPTION 'LEGACY_SUBSTITUTION_DURATION_WRONG %',updated; END IF;
 j:=public.substitution_enforce_due();
 IF (SELECT actual_minutes FROM public.substitution_requests WHERE id=1003)<>333
 THEN RAISE EXCEPTION 'NEW_KST_SUBSTITUTION_DURATION_WRONG'; END IF;
 IF (SELECT status FROM public.substitution_requests WHERE id=1003)<>'PARTIAL'
 THEN RAISE EXCEPTION 'PREMATURE_SUBSTITUTE_COMPLETION'; END IF;
 PERFORM set_config('fixture.allowed_store','1',true);
 j:=public.admin_retire_employee(934,current_date)::json;
 IF j->>'auto_checkout'<>'true' THEN RAISE EXCEPTION 'RETIRE_FAILED_TO_CLOSE_GENUINELY_OPEN_SHIFT %',j; END IF;
 IF (SELECT is_active FROM public.employees WHERE id=934) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'SYNTHETIC_RETIRE_DID_NOT_COMPLETE'; END IF;
END $qa$;
SELECT 'PASS substitution/retirement: historic UTC and new KST correction, VOID_ADD, no phantom clock-in, scheduled duration, retirement' AS result;
