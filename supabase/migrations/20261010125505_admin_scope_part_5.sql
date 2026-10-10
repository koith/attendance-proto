-- Bounded, independently deployable store authorization hardening.
CREATE OR REPLACE FUNCTION public.admin_employment_period_set(p_id bigint, p_employee_id bigint, p_started_on date, p_ended_on date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_id bigint; v_actor text:=coalesce(auth.jwt()->>'email',''); begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; if not exists(select 1 from public.employees where id=p_employee_id) then return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if; if p_started_on is null or (p_ended_on is not null and p_ended_on<p_started_on) then return jsonb_build_object('ok',false,'error','BAD_PERIOD_DATES'); end if; if exists(select 1 from public.employment_periods x where x.employee_id=p_employee_id and (p_id is null or x.id<>p_id) and daterange(x.started_on,coalesce(x.ended_on,'infinity'::date),'[]') && daterange(p_started_on,coalesce(p_ended_on,'infinity'::date),'[]')) then return jsonb_build_object('ok',false,'error','PERIOD_OVERLAP'); end if; if p_id is not null and exists(select 1 from public.employment_contracts c where c.employment_period_id=p_id and (c.effective_from<p_started_on or (p_ended_on is not null and (c.effective_to is null or c.effective_to>p_ended_on)))) then return jsonb_build_object('ok',false,'error','PERIOD_CONTRACT_CONFLICT'); end if; if p_id is null then insert into public.employment_periods(employee_id,started_on,ended_on,note,created_by_email,updated_by_email) values(p_employee_id,p_started_on,p_ended_on,nullif(p_note,''),v_actor,v_actor) returning id into v_id; else update public.employment_periods set started_on=p_started_on,ended_on=p_ended_on,note=nullif(p_note,''),updated_by_email=v_actor,updated_at=now() where id=p_id and employee_id=p_employee_id returning id into v_id; if v_id is null then return jsonb_build_object('ok',false,'error','PERIOD_NOT_FOUND'); end if; end if; return jsonb_build_object('ok',true,'id',v_id); end; $function$;


CREATE OR REPLACE FUNCTION public.admin_payroll_period(p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return (select json_build_object(
    'period', coalesce((select row_to_json(p) from payroll_period p where p.ym=p_ym),
                       json_build_object('ym',p_ym,'status','OPEN','weeks',null)),
    'overrides', coalesce((select json_agg(row_to_json(o)) from payroll_period_employee o where o.ym=p_ym),'[]'::json)));
end; $function$;


CREATE OR REPLACE FUNCTION public.admin_reopen_payroll(p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor text;
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  update payroll_period set status='OPEN', updated_by=v_actor, updated_at=now() where ym=p_ym;
  return json_build_object('ok',true);
end; $function$;


CREATE OR REPLACE FUNCTION public.admin_resolve_request(p_request_id bigint, p_approve boolean, p_reject_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r correction_requests%rowtype; v_actor text; v_action text;
begin
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 v_actor:=coalesce(auth.jwt()->>'email','admin');
 select * into r from correction_requests where id=p_request_id and status='PENDING';
 if not found then return json_build_object('ok',false,'error','NOT_FOUND_OR_RESOLVED'); end if;
 IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=r.employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 if p_approve then
   if r.kind='MISSING_OUT' or r.kind='MISSING_IN' then v_action:='ADD'; else v_action:='EDIT_TIME'; end if;
   insert into event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
   values(r.event_id,r.employee_id,v_action,
          case when r.requested_at is null then null else (r.requested_at at time zone 'Asia/Seoul') at time zone 'UTC' end,
          coalesce(r.requested_type,case when r.kind='MISSING_OUT' then 'OUT' when r.kind='MISSING_IN' then 'IN' else null end),
          '직원 정정요청 승인: '||coalesce(r.note,''),v_actor);
   update correction_requests set status='APPROVED',resolved_by=v_actor,resolved_at=now() where id=p_request_id;
   return json_build_object('ok',true,'status','APPROVED');
 else
   update correction_requests set status='REJECTED',resolved_by=v_actor,resolved_at=now(),reject_reason=p_reject_reason where id=p_request_id;
   return json_build_object('ok',true,'status','REJECTED');
 end if;
end $function$;

