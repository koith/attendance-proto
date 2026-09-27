alter table public.hq_products
  add column if not exists removal_scheduled_at timestamptz;

create index if not exists hq_products_due_removal_idx
  on public.hq_products(removal_scheduled_at)
  where status='ACTIVE' and removal_scheduled_at is not null;

create or replace function public.normalize_hq_product_removal_schedule()
returns trigger
language plpgsql set search_path='public','pg_temp'
as $function$
begin
  if new.status<>'ACTIVE' or (old.status='DISCONTINUED' and new.status='ACTIVE') then
    new.removal_scheduled_at:=null;
  end if;
  return new;
end
$function$;

drop trigger if exists normalize_hq_product_removal_schedule on public.hq_products;
create trigger normalize_hq_product_removal_schedule
before update on public.hq_products
for each row execute function public.normalize_hq_product_removal_schedule();

drop function if exists public.admin_hq_product_list();
create or replace function public.admin_hq_product_list()
returns table(
  id bigint, product_key text, name text, category text, status text,
  effective_from date, effective_to date, scheduled_at timestamptz,
  removal_scheduled_at timestamptz, thumbnail_url text,
  sale_aliases text[], purchase_aliases text[],
  component_blueprint jsonb, recipe_version_id bigint,
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
    p.sale_aliases,p.purchase_aliases,p.component_blueprint,p.recipe_version_id,
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

create or replace function public.admin_hq_product_removal_schedule(
  p_product_ids bigint[],
  p_removal_date date
)
returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare
  v_at timestamptz;
  v_requested integer;
  v_updated integer;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  v_requested:=coalesce(array_length(p_product_ids,1),0);
  if v_requested=0 then raise exception 'PRODUCT_REQUIRED'; end if;
  if p_removal_date is null or p_removal_date <= (now() at time zone 'Asia/Seoul')::date then
    raise exception 'FUTURE_DATE_REQUIRED';
  end if;
  if exists(
    select 1 from unnest(p_product_ids) requested(id)
    left join public.hq_products p on p.id=requested.id
    where p.id is null or p.status<>'ACTIVE'
  ) then
    raise exception 'PRODUCT_NOT_REMOVABLE';
  end if;
  v_at:=p_removal_date::timestamp at time zone 'Asia/Seoul';
  update public.hq_products
    set removal_scheduled_at=v_at,updated_at=now()
    where id=any(p_product_ids) and status='ACTIVE';
  get diagnostics v_updated=row_count;
  if v_updated<>v_requested then raise exception 'PRODUCT_SELECTION_MISMATCH'; end if;
  return jsonb_build_object('ok',true,'scheduled_count',v_updated,'removal_scheduled_at',v_at);
end
$function$;

create or replace function public.system_apply_due_hq_products()
returns integer
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare
  r record;
  v_count integer:=0;
begin
  if session_user not in ('postgres','supabase_admin') then raise exception 'NOT_AUTHORIZED'; end if;
  for r in
    select id,'LAUNCH'::text as action,scheduled_at as due_at
    from public.hq_products
    where status='SCHEDULED' and scheduled_at<=now()
    union all
    select id,'DISCONTINUE'::text as action,removal_scheduled_at as due_at
    from public.hq_products
    where status='ACTIVE' and removal_scheduled_at<=now()
    order by due_at
  loop
    perform public.admin_hq_product_apply(r.id,r.action);
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$function$;

revoke all on function public.admin_hq_product_list() from public,anon;
revoke all on function public.admin_hq_product_removal_schedule(bigint[],date) from public,anon;
revoke all on function public.system_apply_due_hq_products() from public,anon,authenticated;
revoke all on function public.normalize_hq_product_removal_schedule() from public,anon,authenticated;
grant execute on function public.admin_hq_product_list() to authenticated;
grant execute on function public.admin_hq_product_removal_schedule(bigint[],date) to authenticated;
