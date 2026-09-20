-- V26: force-close canonical effective timestamp handling.
-- Raw attendance is UTC wall-clock; human corrections are KST wall-clock; system corrections are UTC wall-clock.
-- Normalize to KST before selecting latest state and deriving the business cutoff.

create or replace function public.system_enforce_store_close()
returns json language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
 s public.store_settings%rowtype; now_kst timestamp without time zone:=now() at time zone 'Asia/Seoul';
 active_from_kst timestamp without time zone; r record; v_business_date date; v_cutoff timestamp without time zone; v_closed integer:=0;
begin
 select * into s from public.store_settings where id=1;
 if not found then return json_build_object('ok',false,'error','STORE_SETTINGS_MISSING'); end if;
 active_from_kst:=s.auto_close_from at time zone 'Asia/Seoul';
 for r in
  with latest_corr as (
   select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by
   from public.event_corrections where event_id is not null order by event_id,created_at desc,id desc
  ),eff as (
   select e.employee_id,
    case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end event_type,
    case when c.action='EDIT_TIME' and c.new_event_at is not null then
      case when coalesce(c.created_by,'')='system:auto-close' or coalesce(c.created_by,'') like 'substitution:%'
           then c.new_event_at+interval '9 hours' else c.new_event_at end
    else e.event_at+interval '9 hours' end event_at_kst,
    e.id::numeric ord
   from public.attendance_events e left join latest_corr c on c.event_id=e.id
   where coalesce(c.action,'')<>'VOID'
   union all
   select employee_id,new_event_type,
    case when coalesce(created_by,'')='system:auto-close' or coalesce(created_by,'') like 'substitution:%'
         then new_event_at+interval '9 hours' else new_event_at end,
    1000000000000000::numeric+id
   from public.event_corrections
   where action='ADD' and new_event_at is not null and new_event_type is not null
  ),last_eff as (
   select distinct on(employee_id) employee_id,event_type,event_at_kst
   from eff where event_at_kst is not null order by employee_id,event_at_kst desc,ord desc
  )
  select * from last_eff where event_type='IN'
 loop
  v_business_date:=r.event_at_kst::date-case when (extract(hour from r.event_at_kst)::int*60+extract(minute from r.event_at_kst)::int)<s.open_minute then 1 else 0 end;
  v_cutoff:=v_business_date::timestamp+make_interval(mins=>s.close_minute+s.close_grace_minutes);
  if v_cutoff>=active_from_kst and now_kst>=v_cutoff and v_cutoff>=r.event_at_kst then
   if not exists(
    select 1 from public.event_corrections
    where employee_id=r.employee_id and action='ADD' and reason='SYSTEM_STORE_CLOSE'
      and created_by='system:auto-close' and new_event_at=v_cutoff-interval '9 hours'
   ) then
    insert into public.event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
    values(null,r.employee_id,'ADD',v_cutoff-interval '9 hours','OUT','SYSTEM_STORE_CLOSE','system:auto-close');
    v_closed:=v_closed+1;
   end if;
  end if;
 end loop;
 return json_build_object('ok',true,'closed',v_closed,'checked_at',now_kst,'active_from',active_from_kst);
end $$;
