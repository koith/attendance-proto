-- Bounded, independently deployable store authorization hardening.
CREATE OR REPLACE FUNCTION public.admin_absence_decision_set(p_employee_id bigint, p_work_date date, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_id bigint; v_actor text:=coalesce(auth.jwt()->>'email',''); begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; if not exists(select 1 from public.employees where id=p_employee_id) then return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if; if p_decision not in ('NEEDS_REVIEW','UNEXCUSED','NOT_UNEXCUSED') then return jsonb_build_object('ok',false,'error','BAD_DECISION'); end if; insert into public.absence_decisions(employee_id,work_date,decision,note,decided_by_email,decided_at) values(p_employee_id,p_work_date,p_decision,nullif(p_note,''),v_actor,now()) on conflict(employee_id,work_date) do update set decision=excluded.decision,note=excluded.note,decided_by_email=excluded.decided_by_email,decided_at=now() returning id into v_id; return jsonb_build_object('ok',true,'id',v_id); end; $function$;


CREATE OR REPLACE FUNCTION public.admin_absence_decisions(p_from date, p_to date, p_employee_id bigint DEFAULT NULL::bigint)
 RETURNS SETOF absence_decisions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin IF NOT (CASE WHEN p_employee_id IS NULL THEN public.is_hq_admin() ELSE public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) END) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; return query select * from public.absence_decisions d where d.work_date between p_from and p_to and (p_employee_id is null or d.employee_id=p_employee_id) order by d.work_date,d.employee_id; end; $function$;


CREATE OR REPLACE FUNCTION public.admin_close_payroll(p_ym text, p_rows json, p_fingerprint text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor text; r json; n int:=0; v_month date;
begin
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 if p_ym !~ '^\\d{4}-\\d{2}$' then raise exception 'BAD_YM'; end if;
 v_month:=(p_ym||'-01')::date;
 if v_month>=date_trunc('month',now() at time zone 'Asia/Seoul')::date then raise exception 'CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE'; end if;
 if exists(select 1 from public.payroll_period where ym=p_ym and status='CLOSED') then raise exception 'PAYROLL_ALREADY_CLOSED'; end if;
 v_actor:=coalesce(auth.jwt()->>'email','admin');
 delete from public.payroll_snapshot where ym=p_ym;
 for r in select * from json_array_elements(p_rows) loop
   insert into public.payroll_snapshot(ym,employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_by)
   values(p_ym,(r->>'employee_id')::bigint,r->>'employee_name',nullif(r->>'hours','')::numeric,nullif(r->>'wage','')::int,nullif(r->>'weeks','')::int,
   nullif(r->>'base_pay','')::int,nullif(r->>'juhyu_pay','')::int,coalesce(nullif(r->>'adjust','')::int,0),nullif(r->>'gross_pay','')::int,
   nullif(r->>'tax_rate','')::numeric,nullif(r->>'net_pay','')::int,r->>'memo',p_fingerprint,v_actor);
   n:=n+1;
 end loop;
 insert into public.payroll_period(ym,status,updated_by,updated_at) values(p_ym,'CLOSED',v_actor,now())
 on conflict(ym) do update set status='CLOSED',updated_by=v_actor,updated_at=now();
 return json_build_object('ok',true,'count',n);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_contract_break_mode_set(p_contract_id bigint, p_break_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if p_break_mode not in ('PROVIDED','NOT_PROVIDED','IGNORED') or p_break_mode is null then
    return jsonb_build_object('ok',false,'error','INVALID_BREAK_MODE');
  end if;
  update public.employment_contracts set
    break_provision_mode=p_break_mode,
    break_time_provided=(p_break_mode='PROVIDED'),
    updated_by_email=coalesce(auth.jwt()->>'email',''),
    updated_at=now()
  where id=p_contract_id;
  if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'id',p_contract_id,'break_provision_mode',p_break_mode);
end $function$;

