create or replace function public.admin_hq_product_schedule(p_product_id bigint, p_launch_date date)
returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare
  v_at timestamptz;
  v_status text;
  v_pending boolean;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;

  select status,has_pending_changes into v_status,v_pending
  from public.hq_products where id=p_product_id for update;
  if v_status is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if p_launch_date is null then
    if v_status='SCHEDULED' then
      update public.hq_products
        set status='DRAFT',scheduled_at=null,updated_at=now()
        where id=p_product_id;
      return jsonb_build_object('ok',true,'status','DRAFT','scheduled_at',null,'schedule_type','LAUNCH');
    elsif v_status='ACTIVE' and exists(select 1 from public.hq_products where id=p_product_id and scheduled_at is not null) then
      update public.hq_products set scheduled_at=null,updated_at=now() where id=p_product_id;
      return jsonb_build_object('ok',true,'status','ACTIVE','scheduled_at',null,'schedule_type','UPDATE');
    end if;
    raise exception 'PRODUCT_NOT_SCHEDULED';
  end if;

  if p_launch_date <= (now() at time zone 'Asia/Seoul')::date then
    raise exception 'FUTURE_DATE_REQUIRED';
  end if;
  v_at:=p_launch_date::timestamp at time zone 'Asia/Seoul';

  if v_status='ACTIVE' then
    if not coalesce(v_pending,false) then raise exception 'PRODUCT_HAS_NO_PENDING_CHANGES'; end if;
    update public.hq_products set scheduled_at=v_at,updated_at=now() where id=p_product_id;
    return jsonb_build_object('ok',true,'status','ACTIVE','scheduled_at',v_at,'schedule_type','UPDATE');
  end if;

  update public.hq_products
    set status='SCHEDULED',scheduled_at=v_at,effective_from=p_launch_date,updated_at=now()
    where id=p_product_id and status in ('DRAFT','SCHEDULED','DISCONTINUED')
    returning status into v_status;
  if v_status is null then raise exception 'PRODUCT_NOT_SCHEDULABLE'; end if;
  return jsonb_build_object('ok',true,'status',v_status,'scheduled_at',v_at,'schedule_type','LAUNCH');
end
$function$;

create or replace function public.system_apply_due_hq_products()
returns integer
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare
  r record;
  v_count integer:=0;
begin
  if session_user not in ('postgres','supabase_admin') then raise exception 'NOT_AUTHORIZED'; end if;
  for r in
    select id,'LAUNCH'::text as action,scheduled_at as due_at
    from public.hq_products
    where scheduled_at<=now()
      and (status='SCHEDULED' or (status='ACTIVE' and has_pending_changes))
    union all
    select id,'DISCONTINUE'::text as action,removal_scheduled_at as due_at
    from public.hq_products
    where status='ACTIVE' and removal_scheduled_at<=now()
    order by due_at
  loop
    perform public.admin_hq_product_apply(r.id,r.action);
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$function$;

revoke all on function public.admin_hq_product_schedule(bigint,date) from public,anon;
revoke all on function public.system_apply_due_hq_products() from public,anon,authenticated;
grant execute on function public.admin_hq_product_schedule(bigint,date) to authenticated;
