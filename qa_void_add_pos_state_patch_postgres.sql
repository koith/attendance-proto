\set ON_ERROR_STOP on
-- Isolated synthetic database: prove that the minimal production-function
-- text patch works for all four POS/auto-close signatures.
CREATE TABLE public.employees(id bigint,store_id bigint);
CREATE TABLE public.event_corrections(
  employee_id bigint,action text,new_event_type text,
  new_event_at timestamp without time zone,reason text
);
INSERT INTO public.employees VALUES(42,1);
INSERT INTO public.event_corrections VALUES
(42,'ADD','OUT','2026-10-24 13:00','old [VOID_ADD:99]'),
(42,'ADD','OUT','2026-10-24 13:10','corrected [REPLACES_ADD:1]'),
(42,'VOID_ADD',NULL,NULL,'audit entry');

CREATE OR REPLACE FUNCTION public.list_employees_state(p_store_id bigint)
RETURNS bigint LANGUAGE sql AS $fn$
SELECT count(*) FROM public.event_corrections ec
  where ec.action='ADD' and ec.new_event_type is not null
    and exists (select 1 from public.employees e where e.id=ec.employee_id and e.store_id=p_store_id);
$fn$;
CREATE OR REPLACE FUNCTION public.punch(
  p_employee_id bigint,p_pin text,p_device text,p_substitute_for_employee_id bigint
)
RETURNS bigint LANGUAGE sql AS $fn$
SELECT count(*) FROM public.event_corrections c
  where c.employee_id=p_employee_id and c.action='ADD' and c.new_event_at is not null
    and c.new_event_type is not null;
$fn$;
CREATE OR REPLACE FUNCTION public.system_enforce_store_close()
RETURNS bigint LANGUAGE sql AS $fn$
SELECT count(*) FROM public.event_corrections where action='ADD' and new_event_at is not null
  and new_event_type is not null;
$fn$;
CREATE OR REPLACE FUNCTION public.system_enforce_store_close(p_store_id bigint)
RETURNS bigint LANGUAGE sql AS $fn$
SELECT count(*) FROM public.event_corrections c JOIN public.employees ee ON ee.id=c.employee_id
  where ee.store_id=p_store_id and c.action='ADD' and c.new_event_at is not null
    and c.new_event_type is not null;
$fn$;
DO $qa$
BEGIN
  IF public.list_employees_state(1)<>2 OR
     public.punch(42,'pin','device',NULL)<>2 OR
     public.system_enforce_store_close()<>2 OR
     public.system_enforce_store_close(1)<>2
  THEN RAISE EXCEPTION 'PRE_PATCH_FIXTURE_INVALID'; END IF;
END $qa$;
\ir supabase/migrations/20261029135500_ignore_void_add_in_pos_state.sql
DO $qa$
BEGIN
  IF public.list_employees_state(1)<>1 OR
     public.punch(42,'pin','device',NULL)<>1 OR
     public.system_enforce_store_close()<>1 OR
     public.system_enforce_store_close(1)<>1
  THEN RAISE EXCEPTION 'VOID_ADD_STILL_ACTIVE_IN_POS_STATE'; END IF;
END $qa$;
SELECT 'PASS all four POS/auto-close consumers exclude voided ADD and retain active corrected ADD' AS result;
