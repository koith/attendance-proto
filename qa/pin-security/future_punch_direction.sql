\set ON_ERROR_STOP on
-- Must execute only in synthetic disposable PG fixture.
DO $guard$ BEGIN
  IF current_database() <> 'future_punch_fixture' THEN
    RAISE EXCEPTION 'PRODUCTION_DB_FORBIDDEN';
  END IF;
END $guard$;

-- Future administrator-created OUT without any previous IN cannot
-- turn the employee's first real tap into OUT.
INSERT INTO public.event_corrections
 (employee_id,event_id,action,new_event_at,new_event_type,reason,created_by)
VALUES
 (710007,NULL,'ADD',(clock_timestamp() at time zone 'Asia/Seoul') + interval '2 days','OUT','synthetic future OUT','manager'),
 (710008,NULL,'ADD',(clock_timestamp() at time zone 'Asia/Seoul') + interval '2 days','OUT','synthetic future OUT','manager'),
 (710009,NULL,'ADD',(clock_timestamp() at time zone 'Asia/Seoul') + interval '2 days','IN','synthetic future IN','manager');

-- One real recent IN for employee 710008.
INSERT INTO public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id)
SELECT 710008,'IN',t,t,'SYNTHETIC'
FROM (SELECT (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour' t) x;
-- A completed real session for employee 710009.
INSERT INTO public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id)
SELECT 710009,'IN',t,t,'SYNTHETIC'
FROM (SELECT (clock_timestamp() AT TIME ZONE 'UTC')-interval '2 hours' t) x;
INSERT INTO public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id)
SELECT 710009,'OUT',t,t,'SYNTHETIC'
FROM (SELECT (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour' t) x;

DO $tests$
DECLARE got json;
BEGIN
 SELECT public.punch(710007,'1234','SYNTHETIC',NULL) INTO got;
 IF got->>'ok'<>'true' OR got->>'type'<>'IN'
 THEN RAISE EXCEPTION 'FUTURE_OUT_INVERTED_FIRST_PUNCH: %', got; END IF;
 RAISE NOTICE 'PASS future manual OUT does not invert first punch';

 SELECT public.punch(710008,'1234','SYNTHETIC',NULL) INTO got;
 IF got->>'ok'<>'true' OR got->>'type'<>'OUT'
 THEN RAISE EXCEPTION 'FUTURE_OUT_INVERTED_OPEN_IN: %', got; END IF;
 RAISE NOTICE 'PASS past open IN is closed despite future manual OUT';

 SELECT public.punch(710009,'1234','SYNTHETIC',NULL) INTO got;
 IF got->>'ok'<>'true' OR got->>'type'<>'IN'
 THEN RAISE EXCEPTION 'FUTURE_IN_INVERTED_COMPLETED_SHIFT: %', got; END IF;
 RAISE NOTICE 'PASS past completed shift permits a new IN despite future manual IN';

 IF (SELECT count(*) FROM public.event_corrections WHERE employee_id IN (710007,710008,710009))<>3
 THEN RAISE EXCEPTION 'CORRECTIONS_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.attendance_events WHERE device_id='SYNTHETIC')<>5
 THEN RAISE EXCEPTION 'UNEXPECTED_EVENT_COUNT'; END IF;
 IF (SELECT count(*) FROM pin_private.source_archive a
      WHERE md5(pg_get_functiondef(a.signature::regprocedure))=a.installed_md5)<>15
 THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_ARCHIVE_INCONSISTENT'; END IF;
 IF (SELECT enabled FROM pin_private.settings WHERE id) IS NOT TRUE
 THEN RAISE EXCEPTION 'PIN_GUARD_DISABLED'; END IF;
 RAISE NOTICE 'PASS source archive, PIN protections, raw correction preservation';
END $tests$;
\echo FUTURE_PUNCH_DIRECTION_PASS
