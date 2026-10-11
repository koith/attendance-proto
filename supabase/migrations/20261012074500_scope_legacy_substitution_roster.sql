-- Legacy authenticated roster RPC must not reveal employees from other stores.
-- Anonymous substitution screens use list_employees_state(p_store_id) and
-- that RPC already exposes only active READY-store staff. HQ may still list all
-- active employees; store managers may list only employees in their own READY store.
-- No employee or payroll records are modified.

CREATE OR REPLACE FUNCTION public.list_active_employees()
 RETURNS TABLE(id bigint, name text, employee_no integer, store_id bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id,e.name,e.employee_no,e.store_id from public.employees e where e.is_active=true and public.can_manage_store(e.store_id) order by e.name
$function$;
