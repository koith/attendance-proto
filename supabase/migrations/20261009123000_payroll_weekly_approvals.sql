-- Append-only weekly holiday allowance decisions. No historical payroll rows are modified.
create table if not exists public.payroll_weekly_approvals (
 id bigint generated always as identity primary key,
 store_id bigint not null references public.stores(id),
 employee_id bigint not null references public.employees(id),
 week_start date not null,
 calculated_won integer not null check(calculated_won>=0),
 approved_won integer not null check(approved_won>=0),
 reason text not null check(length(btrim(reason))>=3),
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 constraint weekly_approval_monday check(extract(isodow from week_start)=1)
);
create index if not exists payroll_weekly_approvals_lookup on public.payroll_weekly_approvals(store_id,employee_id,week_start,approved_at desc,id desc);
alter table public.payroll_weekly_approvals enable row level security;
revoke all on public.payroll_weekly_approvals from anon,authenticated;
create or replace function public.approve_payroll_weekly_allowance(
 p_store_id bigint,p_employee_id bigint,p_week_start date,
 p_calculated_won integer,p_approved_won integer,p_reason text
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;
begin
 if auth.uid() is null or not exists(
   select 1 from public.admin_users a
   where a.user_id=auth.uid() and (a.admin_role='HQ' or a.store_id=p_store_id)
 ) then raise exception 'NOT_AUTHORIZED'; end if;
 if not exists(select 1 from public.employees e where e.id=p_employee_id and e.store_id=p_store_id)
 then raise exception 'EMPLOYEE_STORE_MISMATCH'; end if;
 if p_week_start is null or extract(isodow from p_week_start)<>1 or
    p_calculated_won is null or p_calculated_won<0 or
    p_approved_won is null or p_approved_won<0 or length(btrim(coalesce(p_reason,'')))<3
 then raise exception 'INVALID_WEEKLY_APPROVAL'; end if;
 if exists(select 1 from public.payroll_snapshot s where s.employee_id=p_employee_id and s.ym=to_char(p_week_start,'YYYY-MM'))
 then raise exception 'PAYROLL_ALREADY_CLOSED'; end if;
 insert into public.payroll_weekly_approvals(store_id,employee_id,week_start,calculated_won,approved_won,reason,approved_by)
 values(p_store_id,p_employee_id,p_week_start,p_calculated_won,p_approved_won,p_reason,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.approve_payroll_weekly_allowance(bigint,bigint,date,integer,integer,text) from public;
grant execute on function public.approve_payroll_weekly_allowance(bigint,bigint,date,integer,integer,text) to authenticated;
