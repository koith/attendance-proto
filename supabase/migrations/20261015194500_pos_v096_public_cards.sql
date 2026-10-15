-- Restore the pre-v0.98 live POS card statuses without reopening the private
-- payroll/employee management API or changing attendance records.
-- Only ACTIVE employees of a READY store are exposed; no PIN or wage fields.
CREATE OR REPLACE FUNCTION public.pos_public_staff_cards(p_store_id bigint)
RETURNS TABLE(
  id bigint,employee_no integer,name text,working boolean,
  working_since timestamp without time zone,today_work_seconds bigint,
  today_first_in timestamp without time zone,today_last_out timestamp without time zone
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
 SELECT e.id,e.employee_no,e.name,e.working,e.working_since,
        e.today_work_seconds,e.today_first_in,e.today_last_out
 FROM public.list_employees_state(p_store_id) e
 WHERE p_store_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.stores s
   WHERE s.id=p_store_id AND s.is_active IS TRUE AND s.onboarding_status='READY'
 ) 
 ORDER BY e.working DESC NULLS LAST,e.name,e.id
 LIMIT 100
$body$;
REVOKE ALL ON FUNCTION public.pos_public_staff_cards(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_public_staff_cards(bigint) TO anon,authenticated,service_role;
-- Security boundary unchanged: list_employees_state remains non-executable to anon.
REVOKE ALL ON FUNCTION public.list_employees_state(bigint) FROM PUBLIC,anon,authenticated;
