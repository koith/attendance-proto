-- Preserve existing contracts: TRUE => PROVIDED, FALSE => NOT_PROVIDED.
-- New contracts default to NOT_PROVIDED; IGNORED means neither break deduction nor allowance.
alter table public.employment_contracts add column if not exists break_provision_mode text;
update public.employment_contracts set break_provision_mode=case when break_time_provided then 'PROVIDED' else 'NOT_PROVIDED' end where break_provision_mode is null;
alter table public.employment_contracts alter column break_provision_mode set default 'NOT_PROVIDED', alter column break_provision_mode set not null;
do $$ begin if not exists(select 1 from pg_constraint where conname='employment_contracts_break_provision_mode_check') then alter table public.employment_contracts add constraint employment_contracts_break_provision_mode_check check (break_provision_mode in ('PROVIDED','NOT_PROVIDED','IGNORED')); end if; end $$;
create or replace function public.admin_contract_break_mode_set(p_contract_id bigint,p_break_mode text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 if p_break_mode is null or p_break_mode not in ('PROVIDED','NOT_PROVIDED','IGNORED') then return jsonb_build_object('ok',false,'error','INVALID_BREAK_MODE'); end if;
 update public.employment_contracts set break_provision_mode=p_break_mode,break_time_provided=(p_break_mode='PROVIDED'),updated_by_email=coalesce(auth.jwt()->>'email',''),updated_at=now() where id=p_contract_id;
 if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
 return jsonb_build_object('ok',true,'id',p_contract_id,'break_provision_mode',p_break_mode);
end $$;
revoke all on function public.admin_contract_break_mode_set(bigint,text) from public,anon;
grant execute on function public.admin_contract_break_mode_set(bigint,text) to authenticated,service_role;
create or replace function public.admin_store_payroll_contracts_v4(p_store_id bigint,p_month date)
returns table(employee_id bigint,contract_id bigint,payroll_type text,hourly_wage integer,monthly_salary integer,tax_treatment text,business_deduction_rate numeric,effective_from date,effective_to date,break_time_provided boolean,night_allowance_enabled boolean,night_allowance_mode text,night_allowance_value numeric,night_allowance_start time without time zone,night_allowance_end time without time zone,break_provision_mode text)
language sql security definer set search_path=public,pg_temp as $
select v.*,coalesce(c.break_provision_mode,case when v.break_time_provided then 'PROVIDED' else 'NOT_PROVIDED' end) from public.admin_store_payroll_contracts_v3(p_store_id,p_month) v join public.employment_contracts c on c.id=v.contract_id where public.can_manage_store(p_store_id)
$;
revoke all on function public.admin_store_payroll_contracts_v4(bigint,date) from public,anon;
grant execute on function public.admin_store_payroll_contracts_v4(bigint,date) to authenticated,service_role;

-- Compatibility for older cached clients that still call the boolean RPC.
create or replace function public._contract_break_mode_legacy_sync() returns trigger language plpgsql as $$
begin
 if new.break_time_provided is distinct from old.break_time_provided
    and new.break_provision_mode is not distinct from old.break_provision_mode then
   new.break_provision_mode=case when new.break_time_provided then 'PROVIDED' else 'NOT_PROVIDED' end;
 end if;
 return new;
end $$;
drop trigger if exists contract_break_mode_legacy_sync on public.employment_contracts;
create trigger contract_break_mode_legacy_sync before update of break_time_provided,break_provision_mode on public.employment_contracts
for each row execute function public._contract_break_mode_legacy_sync();
