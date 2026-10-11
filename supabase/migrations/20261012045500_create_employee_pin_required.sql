-- Reject NULL or malformed four-digit PINs in employee creation.
-- This migration replaces function definitions only, with no data writes.

CREATE OR REPLACE FUNCTION public.admin_create_employee(p_name text, p_pin text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_id bigint;
  v_store_id bigint;
begin
  if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'NAME_REQUIRED'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_REQUIRED'; end if;
  select id into v_store_id
  from public.stores
  where is_active=true
  order by case when id=1 then 0 else 1 end,id
  limit 1;
  if v_store_id is null then raise exception 'STORE_NOT_FOUND'; end if;
  insert into public.employees(name,pin_bcrypt,is_active,store_id)
  values(trim(p_name),crypt(p_pin,gen_salt('bf')),true,v_store_id)
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_employee_for_store(p_name text, p_pin text, p_store_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_id bigint;
begin
  if not public.can_manage_store(p_store_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'NAME_REQUIRED'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_REQUIRED'; end if;
  if not exists(select 1 from public.stores where id=p_store_id and is_active=true) then raise exception 'STORE_NOT_FOUND'; end if;
  insert into public.employees(name,pin_bcrypt,is_active,store_id)
  values(trim(p_name),crypt(p_pin,gen_salt('bf')),true,p_store_id)
  returning id into v_id;
  return v_id;
end
$function$;
