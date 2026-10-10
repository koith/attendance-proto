-- Period/month-scoped server sources and allowance approvals.
CREATE OR REPLACE FUNCTION public.approve_payroll_weekly_decision_internal(p_store_id bigint, p_employee_id bigint, p_week_start date, p_calculated_won integer, p_approved_won integer, p_reason text, p_approver_id uuid, p_decision text DEFAULT 'APPROVE'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id bigint; v_ym text;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_store_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND is_active)
 THEN RAISE EXCEPTION 'STORE_NOT_ACTIVE'; END IF;
 IF p_approver_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.admin_users a WHERE a.user_id=p_approver_id
    AND (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id))
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id)
 THEN RAISE EXCEPTION 'EMPLOYEE_STORE_MISMATCH'; END IF;
 IF p_decision NOT IN ('APPROVE','REJECT') OR
    p_week_start IS NULL OR EXTRACT(isodow FROM p_week_start)<>1 OR
    p_calculated_won IS NULL OR p_calculated_won<0 OR
    p_approved_won IS NULL OR p_approved_won<0 OR
    (p_decision='REJECT' AND p_approved_won<>0) OR
    LENGTH(BTRIM(COALESCE(p_reason,'')))<3
 THEN RAISE EXCEPTION 'INVALID_WEEKLY_DECISION'; END IF;
 IF (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul') <
      (p_week_start::timestamp+INTERVAL '7 days 2 hours')
 THEN RAISE EXCEPTION 'WEEK_NOT_CLOSED'; END IF;
 v_ym:=TO_CHAR(p_week_start,'YYYY-MM');
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:'||p_store_id||':'||v_ym,0));
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE store_id=p_store_id AND ym=v_ym AND status='CLOSED')
    OR EXISTS(SELECT 1 FROM public.payroll_snapshot s WHERE s.store_id=p_store_id AND s.employee_id=p_employee_id AND s.ym=v_ym)
 THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 INSERT INTO public.payroll_weekly_approvals
  (store_id,employee_id,week_start,calculated_won,approved_won,reason,approved_by,decision)
 VALUES(p_store_id,p_employee_id,p_week_start,p_calculated_won,p_approved_won,
        BTRIM(p_reason),p_approver_id,p_decision)
 RETURNING id INTO v_id;
 RETURN v_id;
END $function$;

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
       case when c.new_event_at is not null then ((c.new_event_at at time zone 'UTC') at time zone 'Asia/Seoul') end as new_event_at,
       c.new_event_type,c.reason,c.created_at
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
       where e.store_id=p_store_id and r.work_start>=v_first::timestamp
         and r.work_start<(v_first+interval '1 month')::timestamp
         and r.status in ('IN_PROGRESS','COMPLETED','PARTIAL')) s),'[]'::jsonb),
    'bundles',coalesce((select jsonb_object_agg(e.id::text,jsonb_build_object(
       'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by c.effective_from desc,c.id desc)
          from public.employment_contracts c join public.employment_periods ep on ep.id=c.employment_period_id where ep.employee_id=e.id),'[]'::jsonb),
       'periods','[]'::jsonb,'workdays','[]'::jsonb))
       from public.employees e where e.store_id=p_store_id),'{}'::jsonb)
  ) into v_data;
  return v_data;
end $function$;

