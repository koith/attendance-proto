-- Scope existing security-definer admin RPC authorization (no employee data changes).
CREATE OR REPLACE FUNCTION public.admin_correct_event(p_action text, p_event_id bigint, p_employee_id bigint, p_new_at timestamp without time zone, p_new_type text, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint; v_actor text; v_new_utc timestamp; v_target bigint;
begin
 IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_event_id IS NOT NULL AND p_action<>'VOID_ADD'
      AND NOT EXISTS(SELECT 1 FROM public.attendance_events a WHERE a.id=p_event_id AND a.employee_id=p_employee_id)
      THEN RAISE EXCEPTION 'EVENT_EMPLOYEE_MISMATCH'; END IF;
 v_actor:=coalesce(auth.jwt()->>'email','admin');
 if p_action='VOID_ADD' then
   if p_event_id is null then raise exception 'CORRECTION_ID_REQUIRED'; end if;
   select id into v_target from event_corrections where id=p_event_id and employee_id=p_employee_id and action='ADD';
   if v_target is null then raise exception 'ADD_CORRECTION_NOT_FOUND'; end if;
   insert into event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
   values(null,p_employee_id,'VOID_ADD',null,null,p_reason,v_actor) returning id into v_id;
   update event_corrections set reason=coalesce(reason,'')||' [VOID_ADD:'||v_id||']' where id=v_target;
   return v_id;
 end if;
 if p_action='VOID' and p_event_id is null then raise exception 'EVENT_ID_REQUIRED'; end if;
 v_new_utc:=case when p_new_at is null then null else (p_new_at at time zone 'Asia/Seoul') at time zone 'UTC' end;
 insert into event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
 values(p_event_id,p_employee_id,p_action,v_new_utc,p_new_type,p_reason,v_actor) returning id into v_id;
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_deactivate_employee(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  update employees set is_active=false where id=p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_events(p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS SETOF attendance_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select ev.id, ev.employee_id, ev.event_type,
      (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at,
      (ev.server_received_at at time zone 'UTC') at time zone 'Asia/Seoul' as server_received_at,
      ev.device_id, ev.created_at, ev.client_reported_at
    from attendance_events ev
    where ev.event_at >= ((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
      and ev.event_at < ((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
    order by ev.employee_id, ev.event_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_events_with_corrections(p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 return (select json_build_object(
 'events',coalesce((select json_agg(row_to_json(e)) from (
   select ev.id,ev.employee_id,ev.event_type,(ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' event_at
   from attendance_events ev join employees ee on ee.id=ev.employee_id
   where ev.event_at>=((p_from at time zone 'Asia/Seoul') at time zone 'UTC') and ev.event_at<((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
   and (current_setting('request.jwt.claims',true)::jsonb ? 'sub' is false or ee.store_id is not null)
   order by ev.employee_id,ev.event_at) e),'[]'::json),
 'corrections',coalesce((select json_agg(row_to_json(c)) from (
   select ec.id,ec.event_id,ec.employee_id,ec.action,
          case when ec.new_event_at is null then null else (ec.new_event_at at time zone 'UTC') at time zone 'Asia/Seoul' end new_event_at,
          ec.new_event_type,ec.reason,ec.created_by,ec.created_at
   from event_corrections ec
   where ec.created_at >= (p_from at time zone 'Asia/Seoul')-interval '90 days'
   and not (ec.action='ADD' and ec.reason like '%[VOID_ADD:%')
   and ec.action<>'VOID_ADD') c),'[]'::json)));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_grant(p_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid; v_cnt int; v_norm text;
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  perform pg_advisory_xact_lock(hashtext('admin_users_mutation'));
  v_norm := lower(trim(p_email));
  select count(*) into v_cnt from auth.users where lower(trim(email))=v_norm;
  if v_cnt = 0 then return json_build_object('ok',false,'error','AUTH_USER_NOT_FOUND'); end if;
  if v_cnt > 1 then return json_build_object('ok',false,'error','AUTH_USER_AMBIGUOUS'); end if;
  select id into v_uid from auth.users where lower(trim(email))=v_norm;
  -- 이미 관리자면 명시적으로 알림 (앱 결과 정확성)
  if exists (select 1 from public.admin_users where user_id=v_uid) then
    return json_build_object('ok',false,'error','ALREADY_ADMIN','user_id',v_uid);
  end if;
  insert into public.admin_users(user_id,email,note)
    values (v_uid, v_norm, 'granted by '||coalesce(auth.jwt()->>'email','admin'));
  return json_build_object('ok',true,'user_id',v_uid);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_list_admins()
 RETURNS TABLE(user_id uuid, email text, note text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select a.user_id, u.email::text, a.note, a.created_at
    from public.admin_users a
    join auth.users u on u.id = a.user_id
    order by a.created_at;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_list_all_employees()
 RETURNS SETOF employees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query select * from public.employees order by is_active desc, name;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_auth_users()
 RETURNS TABLE(user_id uuid, email text, is_admin boolean, created_at timestamp with time zone, last_sign_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select u.id, u.email::text,
           exists(select 1 from public.admin_users a where a.user_id=u.id),
           u.created_at, u.last_sign_in_at
    from auth.users u
    where u.email is not null
    order by lower(u.email);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_employees()
 RETURNS SETOF employees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query select * from employees where is_active=true order by name;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_payroll_substitutions(p_store_id bigint, p_ym text)
 RETURNS TABLE(substitute_employee_id bigint, requester_employee_id bigint, actual_minutes integer, work_start timestamp without time zone, work_end timestamp without time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_start date; v_end date;
begin
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 if p_ym !~ '^\d{4}-\d{2}$' then raise exception 'BAD_YM'; end if;
 v_start:=(p_ym||'-01')::date; v_end:=(v_start+interval '1 month')::date;
 return query
 select r.substitute_employee_id,r.requester_employee_id,coalesce(r.actual_minutes,0),r.work_start,r.work_end,r.status
 from substitution_requests r
 join employees s on s.id=r.substitute_employee_id
 where s.store_id=p_store_id
   and r.work_start>=v_start::timestamp and r.work_start<v_end::timestamp
   and r.status in('IN_PROGRESS','COMPLETED','PARTIAL')
 order by r.work_start,r.id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_pending_requests()
 RETURNS TABLE(id bigint, employee_id bigint, employee_name text, kind text, requested_at timestamp without time zone, requested_type text, note text, event_id bigint, orig_event_at timestamp without time zone, orig_event_type text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select r.id, r.employee_id, e.name, r.kind, r.requested_at, r.requested_type, r.note, r.event_id,
      case when ev.event_at is null then null
        else (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' end as orig_event_at,
      ev.event_type as orig_event_type, r.created_at
    from correction_requests r
    join employees e on e.id=r.employee_id
    left join attendance_events ev on ev.id=r.event_id
    where r.status='PENDING'
    order by r.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_retire_employee(p_id bigint, p_ended_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_period_id bigint;
  v_start date;
  v_last_type text;
  v_retired_at timestamp := clock_timestamp() at time zone 'UTC';
  v_auto_checkout boolean := false;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if p_ended_on is null then return jsonb_build_object('ok',false,'error','END_DATE_REQUIRED'); end if;
  if not exists(select 1 from public.employees where id=p_id) then
    return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_id::text));

  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type
    from public.event_corrections
    where event_id is not null and employee_id=p_id
    order by event_id,created_at desc,id desc
  ), eff as (
    select e.id::numeric ord,
           case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
           case when c.action='EDIT_TIME' and c.new_event_at is not null then c.new_event_at else e.event_at end at
    from public.attendance_events e
    left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_id and coalesce(c.action,'')<>'VOID'
    union all
    select (1000000000000000::numeric+c.id),c.new_event_type,c.new_event_at
    from public.event_corrections c
    where c.employee_id=p_id and c.action='ADD'
      and c.new_event_at is not null and c.new_event_type is not null
  )
  select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;

  if v_last_type='IN' then
    insert into public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id)
    values(p_id,'OUT',v_retired_at,v_retired_at,'ADMIN_RETIRE');
    v_auto_checkout := true;
  end if;

  select id,started_on into v_period_id,v_start
  from public.employment_periods
  where employee_id=p_id and ended_on is null
  order by started_on desc,id desc limit 1;

  if v_period_id is not null then
    if p_ended_on < v_start then return jsonb_build_object('ok',false,'error','BAD_END_DATE'); end if;
    update public.employment_periods set ended_on=p_ended_on,updated_at=now()
    where id=v_period_id;
    update public.employment_contracts
      set effective_to=least(coalesce(effective_to,p_ended_on),p_ended_on),updated_at=now()
      where employment_period_id=v_period_id and effective_from<=p_ended_on
        and (effective_to is null or effective_to>p_ended_on);
  end if;

  update public.employees set is_active=false where id=p_id;
  return jsonb_build_object('ok',true,'employee_id',p_id,'ended_on',p_ended_on,'period_id',v_period_id,'auto_checkout',v_auto_checkout,'checkout_at',case when v_auto_checkout then v_retired_at else null end);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_revoke(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_total int; v_deleted int;
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  -- 1) 자기 자신 해제 금지
  if p_user_id = auth.uid() then
    return json_build_object('ok',false,'error','CANNOT_REVOKE_SELF');
  end if;
  -- 2) grant와 동일 키로 직렬화 (count/delete race 방지)
  perform pg_advisory_xact_lock(hashtext('admin_users_mutation'));
  -- 3) 대상이 실제 관리자인지 확인
  if not exists (select 1 from public.admin_users where user_id=p_user_id) then
    return json_build_object('ok',false,'error','ADMIN_NOT_FOUND');
  end if;
  -- 4) 마지막 관리자 lockout 방지
  select count(*) into v_total from public.admin_users;
  if v_total <= 1 then
    return json_build_object('ok',false,'error','CANNOT_REMOVE_LAST_ADMIN');
  end if;
  -- 5) 실제 삭제 + 삭제 행 수 검증
  delete from public.admin_users where user_id=p_user_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    -- 락 안에서 존재확인했으므로 정상적으론 도달 불가. 방어적 처리.
    raise exception 'REVOKE_UNEXPECTED_ROWCOUNT: %', v_deleted;
  end if;
  return json_build_object('ok',true,'removed',p_user_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_period_employee(p_ym text, p_employee_id bigint, p_fields json)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  insert into payroll_period_employee(ym, employee_id,
      wage_override, juhyu_hours_override, juhyu_weeks_override, tax_rate_override, adjust_amount, memo, updated_by, updated_at)
    values (p_ym, p_employee_id,
      nullif(p_fields->>'wage_override','')::int,
      nullif(p_fields->>'juhyu_hours_override','')::numeric,
      nullif(p_fields->>'juhyu_weeks_override','')::int,
      nullif(p_fields->>'tax_rate_override','')::numeric,
      coalesce(nullif(p_fields->>'adjust_amount','')::int,0),
      nullif(p_fields->>'memo',''),
      coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (ym, employee_id) do update set
      wage_override=excluded.wage_override,
      juhyu_hours_override=excluded.juhyu_hours_override,
      juhyu_weeks_override=excluded.juhyu_weeks_override,
      tax_rate_override=excluded.tax_rate_override,
      adjust_amount=excluded.adjust_amount,
      memo=excluded.memo, updated_by=excluded.updated_by, updated_at=now();
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_update_employee(p_id bigint, p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  update employees set
    wage        = coalesce((p_fields->>'wage')::int, wage),
    juhyu_hours = coalesce((p_fields->>'juhyu_hours')::numeric, juhyu_hours),
    juhyu_round = case when p_fields ? 'juhyu_round'
                       then nullif(p_fields->>'juhyu_round','')::int else juhyu_round end,
    tax_rate    = coalesce((p_fields->>'tax_rate')::numeric, tax_rate),
    memo        = case when p_fields ? 'memo' then nullif(p_fields->>'memo','') else memo end
  where id=p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_store_pending_requests(p_store_id bigint)
RETURNS TABLE(id bigint, employee_id bigint, employee_name text, kind text,
 requested_at timestamp without time zone,requested_type text,note text,event_id bigint,
 orig_event_at timestamp without time zone,orig_event_type text,created_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $func$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT r.id,r.employee_id,e.name,r.kind,r.requested_at,r.requested_type,r.note,r.event_id,
      CASE WHEN ev.event_at IS NULL THEN NULL
        ELSE (ev.event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul' END,
      ev.event_type,r.created_at
 FROM public.correction_requests r JOIN public.employees e ON e.id=r.employee_id
 LEFT JOIN public.attendance_events ev ON ev.id=r.event_id
 WHERE e.store_id=p_store_id AND r.status='PENDING'
 ORDER BY r.created_at;
END $func$;
REVOKE ALL ON FUNCTION public.admin_store_pending_requests(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_pending_requests(bigint) TO authenticated,service_role;
