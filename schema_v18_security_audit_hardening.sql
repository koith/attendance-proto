-- Deep audit security/performance hardening (2026-09-18)
-- Applied to Supabase project waluhdgqhwjjwmflhrle and kept here as the durable schema record.
--
-- 1) store_settings is internal state. It is only accessed through privileged RPCs,
--    so direct Data API access from browser roles is disabled.
-- 2) admin_* SECURITY DEFINER RPCs remain available to authenticated admins only.
--    Every current admin_* RPC also performs public.is_admin() internally.
-- 3) Add covering indexes for foreign keys reported by the Supabase database advisor.

begin;

alter table public.store_settings enable row level security;
revoke all privileges on table public.store_settings from anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'admin\_%' escape '\'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end
$$;

create index if not exists correction_requests_event_id_idx
  on public.correction_requests(event_id);

create index if not exists payroll_period_employee_employee_id_idx
  on public.payroll_period_employee(employee_id);

create index if not exists payroll_snapshot_employee_id_idx
  on public.payroll_snapshot(employee_id);

create index if not exists substitution_requests_substitute_employee_id_idx
  on public.substitution_requests(substitute_employee_id);

commit;
