-- Prevent cross-store candidate discovery and block STAGED store PIN staff requests.
-- Preserve signatures, caller permissions, existing attendance, staff and payroll rows.

CREATE OR REPLACE FUNCTION public.substitution_candidate_availability(p_requester bigint, p_pin text, p_start timestamp without time zone, p_end timestamp without time zone)
 RETURNS TABLE(employee_id bigint, available boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; begin select pin_bcrypt into h from employees where id=p_requester and is_active=true; if h is null or crypt(p_pin,h) IS DISTINCT FROM h or p_end<=p_start then return; end if; if not exists(select 1 from public.employees req join public.stores st on st.id=req.store_id where req.id=p_requester and st.is_active and st.onboarding_status='READY') then return; end if; return query select e.id, not substitution_is_working(e.id) and not substitution_schedule_conflict(e.id,p_start,p_end) and not exists(select 1 from substitution_requests r where r.substitute_employee_id=e.id and r.status in ('ACCEPTED','IN_PROGRESS') and r.work_start<p_end and r.work_end>p_start), case when substitution_is_working(e.id) then 'CURRENTLY_WORKING' when substitution_schedule_conflict(e.id,p_start,p_end) then 'WORK_SCHEDULE' when exists(select 1 from substitution_requests r where r.substitute_employee_id=e.id and r.status in ('ACCEPTED','IN_PROGRESS') and r.work_start<p_end and r.work_end>p_start) then 'SUBSTITUTION_RESERVED' else null end from employees e where e.is_active=true and e.id<>p_requester and e.store_id=(select req.store_id from public.employees req where req.id=p_requester); end $function$;

CREATE OR REPLACE FUNCTION public.substitution_request_list(p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare h text;q record;
begin
  select pin_bcrypt into h from employees where id=p_employee and is_active=true;
  if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  if not exists(select 1 from public.employees e join public.stores st on st.id=e.store_id where e.id=p_employee and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;

  perform substitution_enforce_due();
  for q in select id from substitution_requests
    where p_employee in(requester_employee_id,substitute_employee_id)
      and status in('ACCEPTED','IN_PROGRESS')
  loop
    perform substitution_refresh_one(q.id);
  end loop;

  return json_build_object('ok',true,'requests',(
    select coalesce(json_agg(x order by x.work_start desc),'[]'::json)
    from (
      select r.id,r.requester_employee_id,r.substitute_employee_id,a.name requester_name,b.name substitute_name,
             r.work_start,r.work_end,r.status,r.requested_at,r.accepted_at,r.resolved_at,r.note,r.actual_minutes
      from substitution_requests r
      join employees a on a.id=r.requester_employee_id
      join employees b on b.id=r.substitute_employee_id
      where p_employee in(r.requester_employee_id,r.substitute_employee_id) and a.store_id=b.store_id
    ) x
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.substitution_request_cancel(p_request bigint, p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; begin select pin_bcrypt into h from employees where id=p_employee and is_active=true; if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if; if not exists(select 1 from public.employees e join public.stores st on st.id=e.store_id where e.id=p_employee and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if; update substitution_requests set status='CANCELLED',resolved_at=now() where id=p_request and requester_employee_id=p_employee and status in('REQUESTED','ACCEPTED'); if not found then return json_build_object('ok',false,'error','NOT_CANCELLABLE'); end if; return json_build_object('ok',true); end $function$;
