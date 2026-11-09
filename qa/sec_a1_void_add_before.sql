\set ON_ERROR_STOP on
DO $qa$
DECLARE n integer; marks integer;
BEGIN
 SELECT count(*) INTO n FROM public.event_corrections WHERE action='VOID_ADD';
 SELECT (length(reason)-length(replace(reason,'[VOID_ADD:','')))/length('[VOID_ADD:')
 INTO marks FROM public.event_corrections WHERE id=1;
 IF n<>2 OR marks<>2
 THEN RAISE EXCEPTION 'SEC_A1_OLD_DOUBLE_VOID_RACE_NOT_REPRODUCED n=% marks=%',n,marks; END IF;
END $qa$;
SELECT 'PASS SEC-A1 original function concurrent cancel 2/2 incorrectly accepted, 2 VOID_ADD rows' AS result;
