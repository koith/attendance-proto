-- Meeting UI support V23: one admin-authorized query for employee contract/document status.
create or replace function public.admin_employee_contract_statuses()
returns table(employee_id bigint, contract_registered boolean, contract_effective boolean, document_attached boolean)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
  select e.id,
    exists(select 1 from employment_periods ep join employment_contracts c on c.employment_period_id=ep.id where ep.employee_id=e.id),
    exists(select 1 from employment_periods ep join employment_contracts c on c.employment_period_id=ep.id
      where ep.employee_id=e.id and c.effective_from<=current_date and (c.effective_to is null or c.effective_to>=current_date)),
    exists(select 1 from employee_documents d where d.employee_id=e.id)
  from employees e
  where e.is_active=true
  order by e.name;
end;
$$;
