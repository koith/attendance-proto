\set ON_ERROR_STOP on
DO $qa$
DECLARE n integer; marks integer; original integer;
BEGIN
 SELECT count(*) INTO n FROM public.event_corrections WHERE action='VOID_ADD';
 SELECT (length(reason)-length(replace(reason,'[VOID_ADD:','')))/length('[VOID_ADD:') INTO marks
 FROM public.event_corrections WHERE id=1;
 SELECT count(*) INTO original FROM public.event_corrections WHERE id=1 AND action='ADD';
 IF n<>1 OR marks<>1 OR original<>1
 THEN RAISE EXCEPTION 'SEC_A1_DOUBLE_VOID_AFTER_FIX n=% marks=% original=%',n,marks,original; END IF;
END $qa$;
-- Normal manual ADD must remain available, but same employee/type/second rejects duplicate.
SELECT public.store_attendance_correct_event('ADD',NULL,101,'2026-11-09 09:00:00','IN','synthetic-manual');
DO $qa$
BEGIN
 BEGIN
  PERFORM public.store_attendance_correct_event('ADD',NULL,101,'2026-11-09 09:00:00','IN','synthetic-duplicate');
  RAISE EXCEPTION 'SEC_A1_DUPLICATE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'DUPLICATE_ATTENDANCE_CORRECTION%' THEN RAISE; END IF;
 END;
END $qa$;
SELECT 'PASS SEC-A1 patched function 1/2 cancel and still manual ADD de-dup' AS result;
