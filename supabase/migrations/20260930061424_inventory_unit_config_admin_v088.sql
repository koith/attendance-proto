create or replace function public.admin_inventory_overview_v3()
returns table(
 id bigint, sku text, name text, unit text, is_active boolean, on_hand numeric,
 reorder_level numeric, inventory_value numeric, low_stock boolean, category text,
 source_unit_system text, source_minimum_text text, source_current_text text,
 source_order_text text, source_note text, stock_unit text, order_unit text,
 conversion_quantity numeric, unit_configured boolean
)
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
 if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 return query
 select i.id,i.sku,i.name,i.unit,i.is_active,coalesce(sum(m.quantity),0)::numeric,i.reorder_level,
   coalesce(sum(m.quantity*coalesce(m.unit_cost,0)),0)::numeric,
   (i.reorder_level is not null and coalesce(sum(m.quantity),0)<=i.reorder_level),
   i.category,i.source_unit_system,i.source_minimum_text,i.source_current_text,i.source_order_text,i.source_note,
   i.stock_unit,i.order_unit,i.conversion_quantity,
   (i.stock_unit is not null and i.order_unit is not null and i.conversion_quantity is not null)
 from public.inventory_items i left join public.inventory_movements m on m.item_id=i.id
 group by i.id order by i.is_active desc,i.name;
end $$;
revoke all on function public.admin_inventory_overview_v3() from public,anon;
grant execute on function public.admin_inventory_overview_v3() to authenticated,service_role;

create or replace function public.admin_inventory_unit_config_save(
 p_item_id bigint,p_stock_unit text,p_order_unit text,p_conversion_quantity numeric
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare r public.inventory_items%rowtype;
begin
 if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 if p_item_id is null then raise exception 'ITEM_REQUIRED'; end if;
 if nullif(btrim(p_stock_unit),'') is null or nullif(btrim(p_order_unit),'') is null then raise exception 'UNIT_REQUIRED'; end if;
 if p_conversion_quantity is null or p_conversion_quantity<=0 then raise exception 'INVALID_CONVERSION_QUANTITY'; end if;
 update public.inventory_items
 set stock_unit=btrim(p_stock_unit),order_unit=btrim(p_order_unit),conversion_quantity=p_conversion_quantity,
     pack_unit=btrim(p_order_unit),pack_quantity=p_conversion_quantity
 where id=p_item_id returning * into r;
 if not found then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
 return jsonb_build_object('ok',true,'id',r.id,'stock_unit',r.stock_unit,'order_unit',r.order_unit,'conversion_quantity',r.conversion_quantity);
end $$;
revoke all on function public.admin_inventory_unit_config_save(bigint,text,text,numeric) from public,anon;
grant execute on function public.admin_inventory_unit_config_save(bigint,text,text,numeric) to authenticated,service_role;
