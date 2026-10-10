-- Bounded, independently deployable store authorization hardening.
CREATE OR REPLACE FUNCTION public.admin_contract_break_policy_set(p_contract_id bigint, p_break_time_provided boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  update public.employment_contracts
     set break_time_provided=coalesce(p_break_time_provided,false),
         updated_by_email=coalesce(auth.jwt()->>'email',''),
         updated_at=now()
   where id=p_contract_id;
  if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'id',p_contract_id,'break_time_provided',coalesce(p_break_time_provided,false));
end $function$;


CREATE OR REPLACE FUNCTION public.admin_contract_doc_add(p_employee_id bigint, p_contract_id bigint, p_storage_path text, p_filename text, p_content_type text, p_byte_size integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint; v_actor text;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) OR NOT EXISTS(SELECT 1 FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id WHERE c.id=p_contract_id AND ep.employee_id=p_employee_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  if not exists (
    select 1 from public.employment_contracts c
    join public.employment_periods p on p.id=c.employment_period_id
    where c.id=p_contract_id and p.employee_id=p_employee_id
  ) then
    return json_build_object('ok',false,'error','CONTRACT_NOT_FOUND');
  end if;
  if p_storage_path is null
     or split_part(p_storage_path,'/',1) <> p_employee_id::text
     or length(split_part(p_storage_path,'/',2)) = 0
     or split_part(p_storage_path,'/',3) <> ''
     or (length(p_storage_path) - length(replace(p_storage_path,'/',''))) <> 1
  then return json_build_object('ok',false,'error','PATH_INVALID'); end if;
  if p_filename is null or length(trim(p_filename))=0 then return json_build_object('ok',false,'error','FILENAME_REQUIRED'); end if;
  if p_content_type not in ('application/pdf','image/jpeg','image/png') then return json_build_object('ok',false,'error','UNSUPPORTED_TYPE'); end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then return json_build_object('ok',false,'error','SIZE_INVALID'); end if;
  insert into public.employee_documents(employee_id,contract_id,storage_path,filename,content_type,byte_size,uploaded_by_email)
  values(p_employee_id,p_contract_id,p_storage_path,p_filename,p_content_type,p_byte_size,v_actor)
  returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_contract_doc_list(p_employee_id bigint, p_contract_id bigint)
 RETURNS TABLE(id bigint, filename text, content_type text, byte_size integer, storage_path text, uploaded_by_email text, uploaded_at timestamp with time zone, contract_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) OR NOT EXISTS(SELECT 1 FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id WHERE c.id=p_contract_id AND ep.employee_id=p_employee_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if not exists (
    select 1
    from public.employment_contracts c
    join public.employment_periods p on p.id=c.employment_period_id
    where c.id=p_contract_id and p.employee_id=p_employee_id
  ) then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  return query
    select d.id,d.filename,d.content_type,d.byte_size,d.storage_path,d.uploaded_by_email,d.uploaded_at,d.contract_id
    from public.employee_documents d
    where d.employee_id=p_employee_id and d.contract_id=p_contract_id
    order by d.uploaded_at desc;
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_contract_night_end_set(p_contract_id bigint, p_night_allowance_end time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor text; v_id bigint;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if p_night_allowance_end is null then return jsonb_build_object('ok',false,'error','BAD_NIGHT_END'); end if;
  actor:=coalesce(auth.jwt()->>'email','admin');
  update public.employment_contracts set night_allowance_end=p_night_allowance_end,updated_by_email=actor,updated_at=now() where id=p_contract_id returning id into v_id;
  if v_id is null then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'id',v_id);
end; $function$;

