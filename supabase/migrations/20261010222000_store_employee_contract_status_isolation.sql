-- Employee contract indicators must be scoped to the manager's assigned store.
CREATE OR REPLACE FUNCTION public.admin_store_employee_contract_statuses(p_store_id bigint)
RETURNS TABLE(employee_id bigint, contract_registered boolean, contract_effective boolean, document_attached boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT e.id,
   EXISTS(SELECT 1 FROM public.employment_periods ep
          JOIN public.employment_contracts c ON c.employment_period_id=ep.id
          WHERE ep.employee_id=e.id),
   EXISTS(SELECT 1 FROM public.employment_periods ep
          JOIN public.employment_contracts c ON c.employment_period_id=ep.id
          WHERE ep.employee_id=e.id AND c.effective_from<=(now() AT TIME ZONE 'Asia/Seoul')::date
            AND (c.effective_to IS NULL OR c.effective_to>=(now() AT TIME ZONE 'Asia/Seoul')::date)),
   EXISTS(SELECT 1 FROM public.employee_documents d WHERE d.employee_id=e.id)
 FROM public.employees e WHERE e.store_id=p_store_id AND e.is_active IS TRUE
 ORDER BY e.name;
END
$fn$;
REVOKE ALL ON FUNCTION public.admin_store_employee_contract_statuses(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_employee_contract_statuses(bigint) TO authenticated,service_role;
