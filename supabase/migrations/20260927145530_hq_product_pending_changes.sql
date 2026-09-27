alter table public.hq_products
  add column if not exists has_pending_changes boolean not null default false;

create or replace function public.track_hq_product_pending_changes()
returns trigger
language plpgsql
set search_path='public','pg_temp'
as $function$
begin
  if new.recipe_version_id is distinct from old.recipe_version_id and new.status='ACTIVE' then
    new.has_pending_changes:=false;
  elsif old.status='ACTIVE' and (
    new.product_key is distinct from old.product_key or
    new.name is distinct from old.name or
    new.category is distinct from old.category or
    new.sale_aliases is distinct from old.sale_aliases or
    new.purchase_aliases is distinct from old.purchase_aliases or
    not (
      coalesce(new.component_blueprint,'[]'::jsonb) @> coalesce(old.component_blueprint,'[]'::jsonb) and
      coalesce(old.component_blueprint,'[]'::jsonb) @> coalesce(new.component_blueprint,'[]'::jsonb)
    )
  ) then
    new.has_pending_changes:=true;
  end if;
  return new;
end
$function$;

drop trigger if exists track_hq_product_pending_changes on public.hq_products;
create trigger track_hq_product_pending_changes
before update on public.hq_products
for each row execute function public.track_hq_product_pending_changes();

drop function if exists public.admin_hq_product_list();
create or replace function public.admin_hq_product_list()
returns table(
  id bigint, product_key text, name text, category text, status text,
  effective_from date, effective_to date, scheduled_at timestamptz,
  removal_scheduled_at timestamptz, thumbnail_url text,
  sale_aliases text[], purchase_aliases text[],
  component_blueprint jsonb, recipe_version_id bigint, has_pending_changes boolean,
  active_store_count bigint, total_store_count bigint,
  sales_30d numeric, purchases_30d numeric, updated_at timestamptz
)
language plpgsql security definer set search_path='public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
  with assignment_counts as (
    select a.product_id,count(*) filter(where a.status='ACTIVE') as active_count
    from public.store_product_assignments a
    group by a.product_id
  ),
  transaction_totals as (
    select l.product_id,
      sum(t.total_amount) filter(where l.transaction_type='SALE') as sales_total,
      sum(t.total_amount) filter(where l.transaction_type='PURCHASE') as purchase_total
    from public.hq_product_transaction_links l
    join public.operations_transactions t
      on t.transaction_type=l.transaction_type
     and lower(t.counterparty)=lower(l.alias)
     and t.transacted_at>=now()-interval '30 days'
    group by l.product_id
  ),
  store_total as (
    select count(*)::bigint as value from public.stores where is_active
  )
  select p.id,p.product_key,p.name,p.category,p.status,p.effective_from,p.effective_to,
    p.scheduled_at,p.removal_scheduled_at,r.thumbnail_url,
    p.sale_aliases,p.purchase_aliases,p.component_blueprint,p.recipe_version_id,p.has_pending_changes,
    coalesce(a.active_count,0),s.value,
    coalesce(t.sales_total,0),coalesce(t.purchase_total,0),p.updated_at
  from public.hq_products p
  cross join store_total s
  left join public.recipe_versions r on r.id=p.recipe_version_id
  left join assignment_counts a on a.product_id=p.id
  left join transaction_totals t on t.product_id=p.id
  order by case p.status when 'ACTIVE' then 0 when 'SCHEDULED' then 1 when 'DRAFT' then 2 else 3 end,
    p.updated_at desc,p.name;
end
$function$;

revoke all on function public.track_hq_product_pending_changes() from public,anon,authenticated;
revoke all on function public.admin_hq_product_list() from public,anon;
grant execute on function public.admin_hq_product_list() to authenticated;
