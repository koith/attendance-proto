-- Never expose or allow POS entry into an un-onboarded demo branch.
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.admin_users a
     WHERE a.user_id=(SELECT auth.uid()) AND
      (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id AND
        EXISTS(SELECT 1 FROM public.stores ss WHERE ss.id=p_store_id AND ss.onboarding_status<>'SUSPENDED'))))
 OR EXISTS(SELECT 1 FROM public.store_admin_memberships m
     JOIN public.stores s ON s.id=m.store_id
     WHERE m.user_id=(SELECT auth.uid()) AND m.store_id=p_store_id
       AND s.onboarding_status<>'SUSPENDED');
$function$;

CREATE OR REPLACE FUNCTION public.hq_store_dashboard()
 RETURNS TABLE(store_id bigint, store_name text, store_code text, source_store_key text, region_group text, sales_total numeric, sales_7d numeric, tx_count bigint, trend jsonb, menu_trend jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 WITH keys AS (
   SELECT s.source_store_key FROM public.stores s WHERE s.is_active AND s.onboarding_status='READY' AND s.source_store_key IS NOT NULL
   GROUP BY s.source_store_key HAVING count(*)=1
 ), base AS (
   SELECT s.id,s.name,s.code,s.source_store_key,s.region_group
   FROM public.stores s JOIN keys k ON k.source_store_key=s.source_store_key WHERE s.is_active
 ), totals AS (
   SELECT t.source_store_key,
      coalesce(sum(t.total_amount),0)::numeric total,
      coalesce(sum(t.total_amount) FILTER (WHERE t.business_date>=((now() AT TIME ZONE 'Asia/Seoul')::date-6)),0)::numeric d7,
      count(*)::bigint n
   FROM public.operations_transactions t
   WHERE t.transaction_type='SALE' AND t.is_demo IS FALSE
   GROUP BY t.source_store_key
 ), daily AS (
   SELECT t.source_store_key,t.business_date,sum(t.total_amount)::numeric sales
   FROM public.operations_transactions t
   WHERE t.transaction_type='SALE' AND t.is_demo IS FALSE
     AND t.business_date>=((now() AT TIME ZONE 'Asia/Seoul')::date-13)
   GROUP BY t.source_store_key,t.business_date
 ), menus AS (
   SELECT t.source_store_key,coalesce(nullif(t.counterparty,''),'기타') menu,
          sum(t.total_amount)::numeric sales,count(*)::bigint orders
   FROM public.operations_transactions t
   WHERE t.transaction_type='SALE' AND t.is_demo IS FALSE
     AND t.business_date>=((now() AT TIME ZONE 'Asia/Seoul')::date-6)
   GROUP BY t.source_store_key,coalesce(nullif(t.counterparty,''),'기타')
 )
 SELECT s.id,s.name,s.code,s.source_store_key,s.region_group,
        coalesce(t.total,0),coalesce(t.d7,0),coalesce(t.n,0),
        coalesce((SELECT jsonb_agg(jsonb_build_object('date',d.business_date,'sales',d.sales) ORDER BY d.business_date)
                  FROM daily d WHERE d.source_store_key=s.source_store_key),'[]'::jsonb),
        coalesce((SELECT jsonb_agg(jsonb_build_object('name',m.menu,'sales',m.sales,'orders',m.orders,
                                      'channels','{}'::jsonb) ORDER BY m.sales DESC)
                  FROM menus m WHERE m.source_store_key=s.source_store_key),'[]'::jsonb)
 FROM public.stores s
 LEFT JOIN keys k ON k.source_store_key=s.source_store_key
 LEFT JOIN totals t ON t.source_store_key=s.source_store_key AND k.source_store_key IS NOT NULL
 WHERE s.is_active AND s.onboarding_status='READY' ORDER BY s.region_group,s.name;
END $function$;

CREATE OR REPLACE FUNCTION public.list_employees_state(p_store_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(id bigint, name text, employee_no integer, working boolean, working_since timestamp without time zone, today_work_seconds bigint, today_first_in timestamp without time zone, today_last_out timestamp without time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with cfg as (
 select greatest(coalesce((select open_minute from public.store_settings where store_id=p_store_id limit 1),420)::int-60,0) start_minute,
        (clock_timestamp() at time zone 'Asia/Seoul') local_now
), bounds as (
 select case when (extract(hour from local_now)::int*60+extract(minute from local_now)::int)<start_minute then local_now::date-1 else local_now::date end work_date,start_minute from cfg
), win as (
 select (((work_date::timestamp+make_interval(mins=>start_minute)) at time zone 'Asia/Seoul') at time zone 'UTC')::timestamp w0,
        ((((work_date+1)::timestamp+make_interval(mins=>start_minute)) at time zone 'Asia/Seoul') at time zone 'UTC')::timestamp w1 from bounds
), base_effective as (
 select ae.employee_id,
  coalesce((select ec.new_event_type from public.event_corrections ec where ec.event_id=ae.id and ec.action='EDIT_TYPE' and ec.new_event_type is not null order by ec.created_at desc,ec.id desc limit 1),ae.event_type) event_type,
  coalesce((select ec.new_event_at from public.event_corrections ec where ec.event_id=ae.id and ec.action='EDIT_TIME' and ec.new_event_at is not null order by ec.created_at desc,ec.id desc limit 1),ae.event_at) event_at
 from public.attendance_events ae where not exists(select 1 from public.event_corrections ec where ec.event_id=ae.id and ec.action='VOID')
), added_effective as (
 select ec.employee_id,ec.new_event_type event_type,ec.new_event_at event_at from public.event_corrections ec where ec.action='ADD' and ec.new_event_type is not null and ec.new_event_at is not null
), effective_events as (select * from base_effective union all select * from added_effective),
ordered as (
 select x.*,lead(x.event_type) over(partition by x.employee_id order by x.event_at) next_type,lead(x.event_at) over(partition by x.employee_id order by x.event_at) next_at from effective_events x
), totals as (
 select o.employee_id,
  coalesce(sum(extract(epoch from(o.next_at-o.event_at))) filter(where o.event_type='IN' and o.next_type='OUT' and o.event_at>=w.w0 and o.event_at<w.w1),0)::bigint work_seconds,
  min(o.event_at) filter(where o.event_type='IN' and o.next_type='OUT' and o.event_at>=w.w0 and o.event_at<w.w1) first_in,
  max(o.next_at) filter(where o.event_type='IN' and o.next_type='OUT' and o.event_at>=w.w0 and o.event_at<w.w1) last_out
 from ordered o cross join win w group by o.employee_id
), es as (
 select e.id,e.name,e.employee_no,le.event_type last_type,le.event_at last_at,t.work_seconds,t.first_in,t.last_out
 from public.employees e
 left join lateral(select x.event_type,x.event_at from effective_events x where x.employee_id=e.id order by x.event_at desc limit 1) le on true
 left join totals t on t.employee_id=e.id
 where e.is_active and p_store_id is not null and e.store_id=p_store_id AND
   EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY')
)
select id,name,employee_no,(last_type='IN'),
 case when last_type='IN' then ((last_at at time zone 'UTC') at time zone 'Asia/Seoul') end,
 coalesce(work_seconds,0),
 case when first_in is not null then ((first_in at time zone 'UTC') at time zone 'Asia/Seoul') end,
 case when last_out is not null then ((last_out at time zone 'UTC') at time zone 'Asia/Seoul') end
from es order by (last_type='IN') desc,name
$function$;

CREATE OR REPLACE FUNCTION public.list_stores()
 RETURNS TABLE(id bigint, name text, code text, source_store_key text, is_active boolean, region_group text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select s.id,s.name,s.code,s.source_store_key,s.is_active,s.region_group from public.stores s where s.is_active AND s.onboarding_status='READY' order by s.region_group,s.name
$function$;

CREATE OR REPLACE FUNCTION public.punch(p_employee_id bigint, p_pin text, p_device text DEFAULT 'POS'::text, p_substitute_for_employee_id bigint DEFAULT NULL::bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text; v_store_id bigint; v_last_type text; v_type text;
  v_instant timestamptz:=clock_timestamp(); v_now_utc timestamp:=v_instant at time zone 'UTC'; v_now_kst timestamp:=v_instant at time zone 'Asia/Seoul';
  v_sub_name text; v_open_minute integer:=420; v_close_minute integer:=1500; v_reopen_minute integer; v_local_minute integer; v_close_clock_minute integer;
begin
  select pin_bcrypt,store_id into v_hash,v_store_id from public.employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if not exists(select 1 from public.stores s where s.id=v_store_id AND s.is_active AND s.onboarding_status='READY')
  then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if crypt(p_pin,v_hash)<>v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));
  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type from public.event_corrections
    where event_id is not null and employee_id=p_employee_id order by event_id,created_at desc,id desc
  ),eff as (
    select e.id::numeric ord,case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
      case when c.action='EDIT_TIME' and c.new_event_at is not null then c.new_event_at else e.event_at end at
    from public.attendance_events e left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_employee_id and coalesce(c.action,'')<>'VOID'
    union all
    select 1000000000000000::numeric+c.id,c.new_event_type,c.new_event_at from public.event_corrections c
    where c.employee_id=p_employee_id and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null
  ) select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;
  v_type:=case when v_last_type='IN' then 'OUT' else 'IN' end;
  if v_type='IN' then
    select coalesce(open_minute,420),coalesce(close_minute,1500) into v_open_minute,v_close_minute
      from public.store_settings where id=coalesce(v_store_id,1);
    v_reopen_minute:=greatest(v_open_minute-60,0);
    v_local_minute:=extract(hour from v_now_kst)::integer*60+extract(minute from v_now_kst)::integer;
    if v_close_minute>=1440 then
      v_close_clock_minute:=v_close_minute-1440;
      if v_local_minute>=v_close_clock_minute and v_local_minute<v_reopen_minute then
        return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
      end if;
    elsif v_local_minute>=v_close_minute or v_local_minute<v_reopen_minute then
      return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
    end if;
  end if;
  if v_type='OUT' then p_substitute_for_employee_id:=null;
  elsif p_substitute_for_employee_id is not null then
    if p_substitute_for_employee_id=p_employee_id then return json_build_object('ok',false,'error','SUBSTITUTE_SELF'); end if;
    select name into v_sub_name from public.employees where id=p_substitute_for_employee_id and is_active=true;
    if v_sub_name is null then return json_build_object('ok',false,'error','SUBSTITUTE_NOT_ACTIVE'); end if;
  end if;
  insert into public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id,substitute_for_employee_id)
  values(p_employee_id,v_type,v_now_utc,v_now_utc,coalesce(p_device,'POS'),p_substitute_for_employee_id);
  return json_build_object('ok',true,'type',v_type,'at',to_char(v_now_kst,'YYYY-MM-DD"T"HH24:MI:SS'),'name',(select name from public.employees where id=p_employee_id),
    'substitute_for_employee_id',p_substitute_for_employee_id,'substitute_for_name',v_sub_name);
end;$function$;

CREATE OR REPLACE FUNCTION public.staff_actual_attendance(p_employee_id bigint, p_pin text, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_hash text; v_emp json;
begin
  select pin_bcrypt, json_build_object('id',id,'name',name,'employee_no',employee_no,'store_id',store_id)
    into v_hash,v_emp from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if not exists(select 1 from public.stores s where s.id=(v_emp->>'store_id')::bigint AND s.is_active AND s.onboarding_status='READY')
  then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if crypt(p_pin,v_hash)<>v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  return json_build_object(
    'ok',true,'employee',v_emp,
    'events',coalesce((select json_agg(row_to_json(t)) from (
      select ev.id,ev.employee_id,ev.event_type,
        (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
      from attendance_events ev
      where ev.employee_id=p_employee_id
        and ev.event_at>=((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
        and ev.event_at<((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
      order by ev.event_at
    ) t),'[]'::json),
    'corrections',coalesce((select json_agg(row_to_json(c)) from (
      select ec.id,ec.event_id,ec.employee_id,ec.action,
        case when ec.new_event_at is null then null else (ec.new_event_at at time zone 'UTC') at time zone 'Asia/Seoul' end as new_event_at,
        ec.new_event_type,ec.reason,ec.created_at
      from event_corrections ec
      where ec.employee_id=p_employee_id
        and (ec.new_event_at is null or (ec.new_event_at>=((p_from at time zone 'Asia/Seoul') at time zone 'UTC') and ec.new_event_at<((p_to at time zone 'Asia/Seoul') at time zone 'UTC')))
      order by ec.created_at
    ) c),'[]'::json)
  );
end $function$;

