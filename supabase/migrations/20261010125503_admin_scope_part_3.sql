-- Bounded, independently deployable store authorization hardening.
CREATE OR REPLACE FUNCTION public.admin_contract_weekly_preview(p_contract_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare c public.employment_contracts%rowtype; v_minutes numeric; v_pay numeric; begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; select * into c from public.employment_contracts where id=p_contract_id; if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if; if c.payroll_type<>'HOURLY' then return jsonb_build_object('ok',true,'candidate',false,'reason','MONTHLY_POLICY_UNDEFINED'); end if; v_minutes:=c.weekly_contracted_minutes/5.0; v_pay:=(v_minutes/60.0)*c.hourly_wage; return jsonb_build_object('ok',true,'candidate',c.weekly_contracted_minutes>=900,'weekly_contracted_minutes',c.weekly_contracted_minutes,'base_weekly_holiday_minutes',v_minutes,'base_weekly_holiday_pay',round(v_pay),'policy_pending',jsonb_build_array('J1_MONTH_BOUNDARY','J2_PARTIAL_EMPLOYMENT_WEEK','UNEXCUSED_WEEK_ENTITLEMENT_APPLICATION')); end; $function$;


CREATE OR REPLACE FUNCTION public.admin_doc_add(p_employee_id bigint, p_storage_path text, p_filename text, p_content_type text, p_byte_size integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint; v_actor text;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  if not exists (select 1 from public.employees e where e.id = p_employee_id) then
    return json_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND');
  end if;
  -- canonical path 검증: "{employee_id}/{object_name}" 정확히 2 segment.
  if p_storage_path is null
     or split_part(p_storage_path,'/',1) <> p_employee_id::text
     or length(split_part(p_storage_path,'/',2)) = 0
     or split_part(p_storage_path,'/',3) <> ''
     or (length(p_storage_path) - length(replace(p_storage_path,'/',''))) <> 1
  then
    return json_build_object('ok',false,'error','PATH_INVALID');
  end if;
  if p_filename is null or length(trim(p_filename))=0 then
    return json_build_object('ok',false,'error','FILENAME_REQUIRED');
  end if;
  if p_content_type not in ('application/pdf','image/jpeg','image/png') then
    return json_build_object('ok',false,'error','UNSUPPORTED_TYPE');
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then
    return json_build_object('ok',false,'error','SIZE_INVALID');
  end if;
  insert into public.employee_documents(employee_id,storage_path,filename,content_type,byte_size,uploaded_by_email)
    values (p_employee_id,p_storage_path,p_filename,p_content_type,p_byte_size,v_actor)
    returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end; $function$;


CREATE OR REPLACE FUNCTION public.admin_doc_delete(p_document_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.employee_documents%rowtype;
begin
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  select * into v_row from public.employee_documents where id=p_document_id;
  if not found then return json_build_object('ok',false,'error','DOC_NOT_FOUND'); end if;
 IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=v_row.employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  delete from public.employee_documents where id=p_document_id;
  return json_build_object('ok',true,'storage_path',v_row.storage_path);
end; $function$;


CREATE OR REPLACE FUNCTION public.admin_doc_list(p_employee_id bigint)
 RETURNS TABLE(id bigint, filename text, content_type text, byte_size integer, storage_path text, uploaded_by_email text, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select d.id, d.filename, d.content_type, d.byte_size, d.storage_path, d.uploaded_by_email, d.uploaded_at
    from public.employee_documents d
    where d.employee_id = p_employee_id
    order by d.uploaded_at desc;
end; $function$;

