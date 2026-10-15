-- Preserve original select employee -> PIN -> punch POS interaction without exposing
-- private attendance/payroll/contract fields to anonymous clients.
-- Public first-step picker exposes only ACTIVE READY-store employee display name and employee number.
-- The full attendance roster remains protected by the existing 8-hour PIN-scoped session.
CREATE OR REPLACE FUNCTION public.pos_public_staff_picker(p_store_id bigint)
RETURNS TABLE(id bigint, employee_no integer, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
  SELECT e.id,e.employee_no,e.name
  FROM public.employees e
  JOIN public.stores s ON s.id=e.store_id
  WHERE e.store_id=p_store_id AND e.is_active IS TRUE
    AND s.is_active IS TRUE AND s.onboarding_status='READY'
    AND e.employee_no IS NOT NULL AND e.employee_no>0
  ORDER BY e.employee_no,e.id LIMIT 100
$body$;
REVOKE ALL ON FUNCTION public.pos_public_staff_picker(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_public_staff_picker(bigint) TO anon,authenticated,service_role;
-- Intentionally do not restore EXECUTE to list_employees_state(bigint).
