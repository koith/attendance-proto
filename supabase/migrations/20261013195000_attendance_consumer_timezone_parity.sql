-- 2026-10-13: all consumers must use the same historical-compatible correction clock.
-- Regression found: admin calendar used attendance_correction_effective_kst while
-- server payroll/sheet, employee personal view and HQ legacy calendar still
-- interpreted every newly entered Korean correction as UTC (+9 hours).
-- This changes only SQL FUNCTION definitions; original events/corrections,
-- closed payroll snapshots and employee/manager/store rows are untouched.
-- Existing function ACLs/security mode/signatures remain unchanged.
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
          case when ec.new_event_at is null then null else public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at) end new_event_at,
          ec.new_event_type,ec.reason,ec.created_by,ec.created_at
   from event_corrections ec
   where ec.created_at >= (p_from at time zone 'Asia/Seoul')-interval '90 days'
   and not (ec.action='ADD' and ec.reason like '%[VOID_ADD:%')
   and ec.action<>'VOID_ADD') c),'[]'::json)));
end $function$;

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
  if crypt(p_pin,v_hash) IS DISTINCT FROM v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
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
        case when ec.new_event_at is null then null else public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at) end as new_event_at,
        ec.new_event_type,ec.reason,ec.created_by,ec.created_at
      from event_corrections ec
      where ec.employee_id=p_employee_id
        and (ec.new_event_at is null or (public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at)>=p_from and public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at)<p_to))
      order by ec.created_at
    ) c),'[]'::json)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.sheet_server_payroll_source(p_store_id bigint, p_ym text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_first date;v_last date;v_begin timestamp;v_end timestamp;v_data jsonb;
begin
  if p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'BAD_YM';end if;
  if not exists(select 1 from public.stores where id=p_store_id) then raise exception 'BAD_STORE';end if;
  v_first=(p_ym||'-01')::date;
  v_last=(v_first+interval '1 month - 1 day')::date;
  v_begin=(v_first-interval '7 days')::timestamp;
  v_end=(v_first+interval '1 month 7 days')::timestamp;
  select jsonb_build_object(
    'employees',coalesce((select jsonb_agg(to_jsonb(e) order by e.name,e.id) from
      (select id,name,is_active,wage,juhyu_hours,juhyu_round,tax_rate,memo,store_id
       from public.employees where store_id=p_store_id) e),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(a) order by a.employee_id,a.event_at,a.id) from
      (select a.id,a.employee_id,a.event_type,((a.event_at at time zone 'UTC') at time zone 'Asia/Seoul') as event_at
       from public.attendance_events a join public.employees e on e.id=a.employee_id
       where e.store_id=p_store_id
         and a.event_at>=((v_begin at time zone 'Asia/Seoul') at time zone 'UTC')
         and a.event_at<((v_end at time zone 'Asia/Seoul') at time zone 'UTC')) a),'[]'::jsonb),
    'corrections',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from
      (select c.id,c.event_id,c.employee_id,c.action,
       case when c.new_event_at is not null then public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at) end as new_event_at,
       c.new_event_type,c.reason,c.created_by,c.created_at
       from public.event_corrections c join public.employees e on e.id=c.employee_id
       where e.store_id=p_store_id and c.created_at>=(v_begin at time zone 'Asia/Seoul')-interval '90 days'
         and not(c.action='ADD' and c.reason like '%[VOID_ADD:%')
         and c.action<>'VOID_ADD') c),'[]'::jsonb),
    'period',coalesce((select to_jsonb(p) from public.payroll_period p where p.ym=p_ym and p.store_id=p_store_id),
      jsonb_build_object('ym',p_ym,'status','OPEN','weeks',null)),
    'overrides',coalesce((select jsonb_agg(to_jsonb(o) order by o.employee_id) from public.payroll_period_employee o
      join public.employees e on e.id=o.employee_id where e.store_id=p_store_id and o.ym=p_ym),'[]'::jsonb),
    'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by c.employee_id) from
      (select distinct on (e.id) e.id as employee_id,c.id as contract_id,c.payroll_type,c.hourly_wage,
       c.monthly_salary,c.tax_treatment,c.business_deduction_rate,c.effective_from,c.effective_to,
       c.break_time_provided,c.break_provision_mode,c.night_allowance_enabled,c.night_allowance_mode,c.night_allowance_value,
       c.night_allowance_start,c.night_allowance_end
       from public.employees e
       join public.employment_periods ep on ep.employee_id=e.id
       join public.employment_contracts c on c.employment_period_id=ep.id
       where e.store_id=p_store_id and ep.started_on<=v_last and (ep.ended_on is null or ep.ended_on>=v_first)
         and c.effective_from<=v_last and (c.effective_to is null or c.effective_to>=v_first)
       order by e.id,c.effective_from desc,c.id desc) c),'[]'::jsonb),
    'workdays',coalesce((select jsonb_agg(to_jsonb(w) order by w.employee_id,w.contract_id,w.weekday) from
      (select e.id employee_id,c.id contract_id,c.weekly_contracted_minutes,w.weekday,w.contracted_minutes
       from public.employees e
       join public.employment_periods ep on ep.employee_id=e.id
       join public.employment_contracts c on c.employment_period_id=ep.id
       left join public.employment_contract_workdays w on w.contract_id=c.id
       where e.store_id=p_store_id and c.payroll_type='HOURLY'
         and c.effective_from<=v_last and (c.effective_to is null or c.effective_to>=v_first)) w),'[]'::jsonb),
    'substitutions',coalesce((select jsonb_agg(to_jsonb(s) order by s.work_start,s.id) from
      (select r.id,r.substitute_employee_id,r.requester_employee_id,coalesce(r.actual_minutes,0) actual_minutes,
       r.work_start,r.work_end,r.status from public.substitution_requests r
       join public.employees e on e.id=r.substitute_employee_id
       where e.store_id=p_store_id and r.work_start>=v_begin
         and r.work_start<v_end
         and r.status in ('IN_PROGRESS','COMPLETED','PARTIAL')) s),'[]'::jsonb),
    'bundles',coalesce((select jsonb_object_agg(e.id::text,jsonb_build_object(
       'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by c.effective_from desc,c.id desc)
          from public.employment_contracts c join public.employment_periods ep on ep.id=c.employment_period_id where ep.employee_id=e.id),'[]'::jsonb),
       'periods','[]'::jsonb,'workdays','[]'::jsonb))
       from public.employees e where e.store_id=p_store_id),'{}'::jsonb)
  ) into v_data;
  return v_data;
end $function$;

CREATE OR REPLACE FUNCTION public.sheet_month_attendance_projection(p_store_id bigint, p_ym text)
 RETURNS TABLE(employee_id bigint, employee_name text, event_id bigint, event_type text, event_at timestamp without time zone, source text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with bounds as (
 select to_date(p_ym||'-01','YYYY-MM-DD')::timestamp as start_at,
        (to_date(p_ym||'-01','YYYY-MM-DD')+interval '1 month')::timestamp as end_at
 where p_ym between '2000-01' and '2099-12' and length(p_ym)=7
), base as (
 select e.id employee_id,e.name employee_name,a.id event_id,a.event_type,a.event_at
 from public.attendance_events a join public.employees e on e.id=a.employee_id
 where e.store_id=p_store_id
), edits as (
 select distinct on (c.event_id) c.event_id,c.action,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) as new_event_at,c.new_event_type
 from public.event_corrections c where c.event_id is not null
 order by c.event_id,c.created_at desc,c.id desc
), effective as (
 select b.employee_id,b.employee_name,b.event_id,
        case when edits.action='EDIT_TYPE' then coalesce(edits.new_event_type,b.event_type) else b.event_type end as event_type,
        case when edits.action='EDIT_TIME' then coalesce(edits.new_event_at,b.event_at) else b.event_at end as event_at,
        'event'::text as source
 from base b left join edits on edits.event_id=b.event_id
 where edits.action is distinct from 'VOID'
 union all
 select e.id,e.name,c.id,c.new_event_type,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at),'correction'::text
 from public.event_corrections c join public.employees e on e.id=c.employee_id
 where e.store_id=p_store_id and c.action='ADD' and coalesce(c.reason,'') not like '%[VOID_ADD:%'
 -- Preserve the UTC output contract and exclude corrections marked VOID_ADD.
)
select x.employee_id,x.employee_name,x.event_id,x.event_type,x.event_at,x.source
from effective x cross join bounds b
where x.event_at>=b.start_at and x.event_at<b.end_at
order by x.employee_name,x.event_at,x.event_id;
$function$;
