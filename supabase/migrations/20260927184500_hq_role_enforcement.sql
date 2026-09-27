-- Product distribution is a head-office concern.  Store managers remain
-- administrators for their own store, but must not be able to invoke the HQ
-- distribution RPCs directly.
do $migration$
declare
  fn record;
  ddl text;
begin
  for fn in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'admin_hq_product_list',
         'admin_hq_product_save',
         'admin_hq_product_apply',
         'admin_hq_product_schedule',
         'admin_hq_product_removal_schedule'
       )
  loop
    ddl := pg_get_functiondef(fn.oid);
    ddl := replace(ddl, 'public.is_admin()', 'public.is_hq_admin()');
    execute ddl;
  end loop;
end
$migration$;

do $verification$
declare
  insecure_count integer;
begin
  select count(*)
    into insecure_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'admin_hq_product_list',
       'admin_hq_product_save',
       'admin_hq_product_apply',
       'admin_hq_product_schedule',
       'admin_hq_product_removal_schedule'
     )
     and pg_get_functiondef(p.oid) like '%public.is_admin()%';

  if insecure_count > 0 then
    raise exception 'HQ_ROLE_ENFORCEMENT_FAILED';
  end if;
end
$verification$;
