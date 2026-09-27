create index if not exists hq_product_items_item_idx
  on public.hq_product_items(item_id);
create index if not exists hq_products_recipe_version_idx
  on public.hq_products(recipe_version_id);
create index if not exists hq_product_rollouts_recipe_version_idx
  on public.hq_product_rollouts(recipe_version_id);

create or replace function public.admin_inventory_manual_list(p_store_id bigint default 1)
returns setof public.inventory_manual_items
language plpgsql security definer set search_path='public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select * from public.inventory_manual_items
    where store_id=p_store_id and is_active
    order by category nulls last,name;
end
$function$;

create or replace function public.admin_inventory_manual_save(
  p_id bigint, p_store_id bigint, p_name text, p_sku text, p_category text,
  p_unit text, p_on_hand numeric, p_target_level numeric, p_reorder_point numeric,
  p_thumbnail_url text
)
returns public.inventory_manual_items
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare r public.inventory_manual_items;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'name required'; end if;
  if coalesce(p_target_level,0)<0 or coalesce(p_reorder_point,0)<0 or coalesce(p_on_hand,0)<0 then raise exception 'stock values must be >= 0'; end if;
  if coalesce(p_target_level,0)>0 and coalesce(p_reorder_point,0)>coalesce(p_target_level,0) then raise exception 'reorder point must not exceed target level'; end if;
  if p_id is null then
    insert into public.inventory_manual_items(store_id,name,sku,category,unit,on_hand,target_level,reorder_point,thumbnail_url)
    values(coalesce(p_store_id,1),trim(p_name),nullif(trim(p_sku),''),nullif(trim(p_category),''),coalesce(nullif(trim(p_unit),''),'ea'),coalesce(p_on_hand,0),coalesce(p_target_level,0),coalesce(p_reorder_point,0),nullif(trim(p_thumbnail_url),''))
    on conflict(store_id,name) do update set sku=excluded.sku,category=excluded.category,unit=excluded.unit,on_hand=excluded.on_hand,target_level=excluded.target_level,reorder_point=excluded.reorder_point,thumbnail_url=excluded.thumbnail_url,updated_at=now()
    returning * into r;
  else
    update public.inventory_manual_items set name=trim(p_name),sku=nullif(trim(p_sku),''),category=nullif(trim(p_category),''),unit=coalesce(nullif(trim(p_unit),''),'ea'),on_hand=coalesce(p_on_hand,0),target_level=coalesce(p_target_level,0),reorder_point=coalesce(p_reorder_point,0),thumbnail_url=nullif(trim(p_thumbnail_url),''),updated_at=now()
    where id=p_id and store_id=coalesce(p_store_id,1) returning * into r;
  end if;
  return r;
end
$function$;

revoke all on function public.admin_inventory_manual_list(bigint) from public, anon;
revoke all on function public.admin_inventory_manual_save(bigint,bigint,text,text,text,text,numeric,numeric,numeric,text) from public, anon;
revoke all on function public.admin_recipe_list_v2() from public, anon;
revoke all on function public.admin_recipe_save(bigint,text,text,jsonb,text) from public, anon;
grant execute on function public.admin_inventory_manual_list(bigint) to authenticated;
grant execute on function public.admin_inventory_manual_save(bigint,bigint,text,text,text,text,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.admin_recipe_list_v2() to authenticated;
grant execute on function public.admin_recipe_save(bigint,text,text,jsonb,text) to authenticated;

