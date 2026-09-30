-- v0.84 audit: administrator SECURITY DEFINER RPCs must not inherit PUBLIC/anon EXECUTE.
revoke execute on function public.admin_inventory_overview_v2() from public, anon;
revoke execute on function public.admin_payroll_substitutions(bigint,text) from public, anon;
grant execute on function public.admin_inventory_overview_v2() to authenticated, service_role;
grant execute on function public.admin_payroll_substitutions(bigint,text) to authenticated, service_role;
