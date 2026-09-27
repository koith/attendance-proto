create extension if not exists pg_cron with schema pg_catalog;

alter table public.hq_products
  add column if not exists scheduled_at timestamptz;

alter table public.hq_products drop constraint if exists hq_products_status_check;
alter table public.hq_products
  add constraint hq_products_status_check
  check (status in ('DRAFT','SCHEDULED','ACTIVE','DISCONTINUED'));

-- Bring the existing active recipe catalog into HQ control so removal works
-- for products that existed before the HQ rollout feature.
insert into public.hq_products(
  product_key,name,category,status,effective_from,sale_aliases,
  component_blueprint,recipe_version_id,created_at,updated_at
)
select
  r.menu_key,r.menu_name,r.category,'ACTIVE',r.effective_from,array[r.menu_name],
  coalesce(
    jsonb_agg(
      jsonb_build_object('item_id',c.item_id,'quantity',c.quantity)
      order by c.item_id
    ) filter(where c.item_id is not null),
    '[]'::jsonb
  ),
  r.id,now(),now()
from public.recipe_versions r
left join public.recipe_components c on c.recipe_version_id=r.id
where r.effective_to is null and not r.is_demo
group by r.id
on conflict(product_key) do nothing;

insert into public.hq_product_items(product_id,item_id,quantity,created_by_hq)
select p.id,c.item_id,c.quantity,false
from public.hq_products p
join public.recipe_versions r on r.id=p.recipe_version_id
join public.recipe_components c on c.recipe_version_id=r.id
on conflict(product_id,item_id) do update set quantity=excluded.quantity;

insert into public.store_product_assignments(product_id,store_id,status,applied_at,discontinued_at)
select p.id,s.id,'ACTIVE',now(),null
from public.hq_products p
cross join public.stores s
where p.status='ACTIVE' and s.is_active
on conflict(product_id,store_id) do nothing;

insert into public.hq_product_transaction_links(product_id,transaction_type,alias)
select p.id,'SALE',p.name
from public.hq_products p
where p.status='ACTIVE'
on conflict do nothing;

drop function if exists public.admin_hq_product_list();
create or replace function public.admin_hq_product_list()
returns table(
  id bigint, product_key text, name text, category text, status text,
  effective_from date, effective_to date, scheduled_at timestamptz,
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
    p.scheduled_at,p.sale_aliases,p.purchase_aliases,p.component_blueprint,p.recipe_version_id,
    coalesce(a.active_count,0),s.value,
    coalesce(t.sales_total,0),coalesce(t.purchase_total,0),
    p.updated_at
  from public.hq_products p
  cross join store_total s
  left join assignment_counts a on a.product_id=p.id
  left join transaction_totals t on t.product_id=p.id
  order by case p.status when 'ACTIVE' then 0 when 'SCHEDULED' then 1 when 'DRAFT' then 2 else 3 end,
    p.updated_at desc,p.name;
end
$function$;

create or replace function public.admin_hq_product_apply(p_product_id bigint, p_action text)
returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare
  p public.hq_products%rowtype;
  v_comp jsonb;
  v_item_id bigint;
  v_recipe_id bigint;
  v_created boolean;
  v_store_count integer:=0;
  v_action text:=upper(trim(coalesce(p_action,'')));
  v_alias text;
  v_old_hq_items bigint[]:='{}';
begin
  if not public.is_admin() and session_user not in ('postgres','supabase_admin') then raise exception 'NOT_AUTHORIZED'; end if;
  if v_action not in ('LAUNCH','DISCONTINUE') then raise exception 'INVALID_ACTION'; end if;
  select * into p from public.hq_products where id=p_product_id for update;
  if p.id is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if v_action='LAUNCH' then
    select coalesce(array_agg(item_id),'{}') into v_old_hq_items
      from public.hq_product_items where product_id=p.id and created_by_hq;
    delete from public.hq_product_items where product_id=p.id;
    for v_comp in select * from jsonb_array_elements(p.component_blueprint) loop
      v_item_id:=nullif(v_comp->>'item_id','')::bigint;
      v_created:=coalesce(v_item_id=any(v_old_hq_items),false);
      if v_item_id is not null then
        update public.inventory_items set is_active=true,updated_at=now() where id=v_item_id returning id into v_item_id;
        if v_item_id is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
      else
        select i.id into v_item_id from public.inventory_items i where lower(i.sku)=lower(trim(v_comp->>'sku')) limit 1;
        if v_item_id is null then
          insert into public.inventory_items(sku,name,unit,is_active,reorder_level,pack_quantity,pack_unit,is_demo)
          values(trim(v_comp->>'sku'),trim(v_comp->>'name'),trim(v_comp->>'unit'),true,
            nullif(v_comp->>'reorder_level','')::numeric,nullif(v_comp->>'pack_quantity','')::numeric,
            nullif(trim(coalesce(v_comp->>'pack_unit','')),''),false)
          returning id into v_item_id;
          v_created:=true;
        else
          v_created:=coalesce(v_item_id=any(v_old_hq_items),false);
          update public.inventory_items set name=trim(v_comp->>'name'),unit=trim(v_comp->>'unit'),is_active=true,
            reorder_level=coalesce(nullif(v_comp->>'reorder_level','')::numeric,reorder_level),
            pack_quantity=coalesce(nullif(v_comp->>'pack_quantity','')::numeric,pack_quantity),
            pack_unit=coalesce(nullif(trim(coalesce(v_comp->>'pack_unit','')),''),pack_unit),updated_at=now()
          where id=v_item_id;
        end if;
      end if;
      insert into public.hq_product_items(product_id,item_id,quantity,created_by_hq)
      values(p.id,v_item_id,(v_comp->>'quantity')::numeric,v_created)
      on conflict(product_id,item_id) do update set quantity=excluded.quantity,
        created_by_hq=public.hq_product_items.created_by_hq or excluded.created_by_hq;
    end loop;

    if p.recipe_version_id is not null then
      update public.recipe_versions set effective_to=current_date where id=p.recipe_version_id and effective_to is null;
    end if;
    insert into public.recipe_versions(menu_key,menu_name,category,effective_from,effective_to,is_demo)
    values(p.product_key,p.name,p.category,current_date,null,false) returning id into v_recipe_id;
    insert into public.recipe_components(recipe_version_id,item_id,quantity)
      select v_recipe_id,item_id,quantity from public.hq_product_items where product_id=p.id;

    insert into public.store_product_assignments(product_id,store_id,status,applied_at,discontinued_at)
      select p.id,s.id,'ACTIVE',now(),null from public.stores s where s.is_active
      on conflict(product_id,store_id) do update set status='ACTIVE',applied_at=now(),discontinued_at=null;
    get diagnostics v_store_count=row_count;

    delete from public.hq_product_transaction_links where product_id=p.id;
    foreach v_alias in array p.sale_aliases loop
      insert into public.hq_product_transaction_links values(p.id,'SALE',v_alias) on conflict do nothing;
    end loop;
    foreach v_alias in array p.purchase_aliases loop
      insert into public.hq_product_transaction_links values(p.id,'PURCHASE',v_alias) on conflict do nothing;
    end loop;
    update public.hq_products set status='ACTIVE',effective_from=current_date,effective_to=null,
      scheduled_at=null,recipe_version_id=v_recipe_id,updated_at=now() where id=p.id;
  else
    if p.recipe_version_id is not null then
      update public.recipe_versions set effective_to=current_date where id=p.recipe_version_id and effective_to is null;
    end if;
    update public.store_product_assignments set status='DISCONTINUED',discontinued_at=now()
      where product_id=p.id and status='ACTIVE';
    get diagnostics v_store_count=row_count;
    update public.inventory_items i set is_active=false,updated_at=now()
      where exists(select 1 from public.hq_product_items pi where pi.product_id=p.id and pi.item_id=i.id and pi.created_by_hq)
        and not exists(select 1 from public.hq_product_items pi2 join public.hq_products p2 on p2.id=pi2.product_id
          where pi2.item_id=i.id and p2.id<>p.id and p2.status='ACTIVE');
    update public.hq_products set status='DISCONTINUED',effective_to=current_date,
      scheduled_at=null,updated_at=now() where id=p.id;
    v_recipe_id:=p.recipe_version_id;
  end if;

  insert into public.hq_product_rollouts(product_id,action,affected_store_count,recipe_version_id,details,actor_id)
  values(p.id,v_action,v_store_count,v_recipe_id,
    jsonb_build_object('product_key',p.product_key,'name',p.name,'component_count',jsonb_array_length(p.component_blueprint)),auth.uid());
  return jsonb_build_object('ok',true,'action',v_action,'product_id',p.id,'affected_store_count',v_store_count,'recipe_version_id',v_recipe_id);
end
$function$;

create or replace function public.admin_hq_product_schedule(p_product_id bigint, p_launch_date date)
returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare
  v_at timestamptz;
  v_status text;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_launch_date is null then
    update public.hq_products
      set status='DRAFT',scheduled_at=null,updated_at=now()
      where id=p_product_id and status='SCHEDULED'
      returning status into v_status;
    if v_status is null then raise exception 'PRODUCT_NOT_SCHEDULED'; end if;
    return jsonb_build_object('ok',true,'status','DRAFT','scheduled_at',null);
  end if;
  if p_launch_date <= (now() at time zone 'Asia/Seoul')::date then
    raise exception 'FUTURE_DATE_REQUIRED';
  end if;
  v_at:=p_launch_date::timestamp at time zone 'Asia/Seoul';
  update public.hq_products
    set status='SCHEDULED',scheduled_at=v_at,effective_from=p_launch_date,updated_at=now()
    where id=p_product_id and status in ('DRAFT','SCHEDULED','DISCONTINUED')
    returning status into v_status;
  if v_status is null then raise exception 'PRODUCT_NOT_SCHEDULABLE'; end if;
  return jsonb_build_object('ok',true,'status',v_status,'scheduled_at',v_at);
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
    select id from public.hq_products
    where status='SCHEDULED' and scheduled_at<=now()
    order by scheduled_at
    for update skip locked
  loop
    perform public.admin_hq_product_apply(r.id,'LAUNCH');
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$function$;

revoke all on function public.admin_hq_product_list() from public,anon;
revoke all on function public.admin_hq_product_apply(bigint,text) from public,anon;
revoke all on function public.admin_hq_product_schedule(bigint,date) from public,anon;
revoke all on function public.system_apply_due_hq_products() from public,anon,authenticated;
grant execute on function public.admin_hq_product_list() to authenticated;
grant execute on function public.admin_hq_product_apply(bigint,text) to authenticated;
grant execute on function public.admin_hq_product_schedule(bigint,date) to authenticated;

do $block$
begin
  if not exists(select 1 from cron.job where jobname='apply-due-hq-products') then
    perform cron.schedule(
      'apply-due-hq-products',
      '* * * * *',
      'select public.system_apply_due_hq_products()'
    );
  end if;
end
$block$;
