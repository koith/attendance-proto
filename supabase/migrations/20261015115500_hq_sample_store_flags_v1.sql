-- HQ-only classification for seeded demonstration stores, without altering production store records.
-- A new RPC keeps existing hq_stores_onboarding_list return type backward compatible.
create or replace function public.hq_store_sample_flags_list()
returns table (store_id bigint,is_sample boolean)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_hq_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  return query
    select s.id,coalesce(s.source_store_key like 'demo_%',false)
    from public.stores s
    order by s.id;
end;
$$;
revoke all on function public.hq_store_sample_flags_list() from public,anon;
grant execute on function public.hq_store_sample_flags_list() to authenticated,service_role;
