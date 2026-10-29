-- 2026-10-29: align POS and automatic-close synthetic ADD consumers with
-- the shipped Sheet/payroll/day-view VOID_ADD filtering contract.
-- A strict one-token replacement retains each live function's otherwise
-- unchanged parameters, grants, authorization, and logic. Fail closed if
-- a function no longer has its audited expected source.
DO $patch$
DECLARE
  v record;
  v_definition text;
  v_replaced text;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('public.list_employees_state(bigint)'::regprocedure,
       'where ec.action=''ADD'' and ec.new_event_type is not null',
       'where ec.action=''ADD'' and coalesce(ec.reason,'''') not like ''%[VOID_ADD:%'' and ec.new_event_type is not null'),
      ('public.punch(bigint,text,text,bigint)'::regprocedure,
       'where c.employee_id=p_employee_id and c.action=''ADD'' and c.new_event_at is not null',
       'where c.employee_id=p_employee_id and c.action=''ADD'' and coalesce(c.reason,'''') not like ''%[VOID_ADD:%'' and c.new_event_at is not null'),
      ('public.system_enforce_store_close()'::regprocedure,
       'where action=''ADD'' and new_event_at is not null',
       'where action=''ADD'' and coalesce(reason,'''') not like ''%[VOID_ADD:%'' and new_event_at is not null'),
      ('public.system_enforce_store_close(bigint)'::regprocedure,
       'where ee.store_id=p_store_id and c.action=''ADD'' and c.new_event_at is not null',
       'where ee.store_id=p_store_id and c.action=''ADD'' and coalesce(c.reason,'''') not like ''%[VOID_ADD:%'' and c.new_event_at is not null')
    ) AS q(fn,needle,replacement)
  LOOP
    v_definition:=pg_get_functiondef(v.fn);
    IF v_definition IS NULL OR
       length(v_definition)-length(replace(v_definition,v.needle,''))<>length(v.needle)
    THEN
      RAISE EXCEPTION 'UNEXPECTED_EFFECTIVE_ATTENDANCE_CONSUMER: %',v.fn;
    END IF;
    v_replaced:=replace(v_definition,v.needle,v.replacement);
    EXECUTE v_replaced;
    RAISE NOTICE 'VOID_ADD filtered: %',v.fn;
  END LOOP;
END;
$patch$;
