-- Bounded, independently deployable store authorization hardening.
CREATE OR REPLACE FUNCTION public.admin_set_period_weeks(p_ym text, p_weeks integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  insert into payroll_period(ym, weeks, updated_by, updated_at)
    values (p_ym, p_weeks, coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (ym) do update set weeks=excluded.weeks, updated_by=excluded.updated_by, updated_at=now();
end; $function$;


CREATE OR REPLACE FUNCTION public.admin_snapshot(p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return (select json_build_object(
    'status', coalesce((select status from payroll_period where ym=p_ym),'OPEN'),
    'fingerprint', (select source_fingerprint from payroll_snapshot where ym=p_ym limit 1),
    'rows', coalesce((select json_agg(row_to_json(s)) from (
      select employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,closed_by,closed_at
      from payroll_snapshot where ym=p_ym order by employee_name) s),'[]'::json)));
end; $function$;


CREATE OR REPLACE FUNCTION public.admin_unclassified_doc_list(p_employee_id bigint)
 RETURNS TABLE(id bigint, filename text, content_type text, byte_size integer, storage_path text, uploaded_by_email text, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select d.id,d.filename,d.content_type,d.byte_size,d.storage_path,d.uploaded_by_email,d.uploaded_at
    from public.employee_documents d
    where d.employee_id=p_employee_id and d.contract_id is null
    order by d.uploaded_at desc;
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_store_schedule_list(p_store_id bigint,p_from date,p_to date)
RETURNS TABLE(id bigint,employee_id bigint,work_date date,status text,planned_start time without time zone,
 planned_end time without time zone,memo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>400 THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
 RETURN QUERY SELECT w.id,w.employee_id,w.work_date,w.status,w.planned_start,w.planned_end,w.memo
 FROM public.work_schedules w JOIN public.employees e ON e.id=w.employee_id
 WHERE e.store_id=p_store_id AND w.work_date>=p_from AND w.work_date<=p_to
 ORDER BY w.work_date,w.employee_id;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_store_schedule_list(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_schedule_list(bigint,date,date) TO authenticated,service_role;
