-- Phase 1: read-only server change detection. Do not write Sheets until server payroll parity is proven.
create table if not exists public.sheet_sync_change_state (
  store_id bigint primary key references public.stores(id),
  fingerprint text not null,
  changed_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  synced_fingerprint text,
  synced_at timestamptz,
  last_error text
);
alter table public.sheet_sync_change_state enable row level security;
revoke all on public.sheet_sync_change_state from anon, authenticated;
create or replace function public.system_check_sheet_changes()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare st record; fp text;
begin
  for st in select id from public.stores where id=1 loop -- Inha pilot; expand only after server parity QA
    select md5(concat_ws('|',
      coalesce((select string_agg(md5(row_to_json(a)::text),',' order by a.id) from public.attendance_events a join public.employees e on e.id=a.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(c)::text),',' order by c.id) from public.event_corrections c join public.employees e on e.id=c.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(e)::text),',' order by e.id) from public.employees e where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(ep)::text),',' order by ep.id) from public.employment_periods ep join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(ec)::text),',' order by ec.id) from public.employment_contracts ec join public.employment_periods ep on ep.id=ec.employment_period_id join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(w)::text),',' order by w.contract_id,w.weekday) from public.employment_contract_workdays w join public.employment_contracts ec on ec.id=w.contract_id join public.employment_periods ep on ep.id=ec.employment_period_id join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(p)::text),',' order by p.ym) from public.payroll_period p where p.ym >= to_char(current_date - interval '45 days','YYYY-MM')),''),
      coalesce((select string_agg(md5(row_to_json(pe)::text),',' order by pe.ym,pe.employee_id) from public.payroll_period_employee pe join public.employees e on e.id=pe.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(s)::text),',' order by s.id) from public.payroll_snapshot s join public.employees e on e.id=s.employee_id where e.store_id=st.id),'')
    )) into fp;
    insert into public.sheet_sync_change_state(store_id,fingerprint,changed_at,checked_at)
      values(st.id,fp,now(),now())
    on conflict(store_id) do update set
      fingerprint=excluded.fingerprint,
      checked_at=now(),
      changed_at=case when sheet_sync_change_state.fingerprint is distinct from excluded.fingerprint then now() else sheet_sync_change_state.changed_at end;
  end loop;
end $$;
revoke all on function public.system_check_sheet_changes() from public, anon, authenticated;
-- Intentionally no Sheets writer: detecting a change is not evidence of payroll calculation parity.
select cron.schedule('baekeok-sheet-change-check','* * * * *','select public.system_check_sheet_changes()');
