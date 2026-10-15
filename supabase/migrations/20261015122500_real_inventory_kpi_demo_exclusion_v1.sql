-- P2 #834: remove demo-only inventory from genuine business KPIs.
-- With no non-demo ledger readings, stock is UNKNOWN (NULL) not zero; no fake reorder advice.
-- No business rows or original recipe/inventory items are modified.

CREATE OR REPLACE FUNCTION public.admin_operations_analytics(p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v json;
begin
 if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 select json_build_object(
 'by_channel',coalesce((select json_agg(x) from(select coalesce(channel,'기타') channel,sum(total_amount) amount,count(*) transactions from public.operations_transactions where business_date between p_from and p_to AND is_demo IS FALSE and transaction_type='SALE' and status='CONFIRMED' group by 1 order by 2 desc)x),'[]'::json),
 'daily',coalesce((select json_agg(x) from(select business_date,sum(case when transaction_type='SALE' then total_amount when transaction_type='REFUND' then -total_amount else 0 end) sales,sum(case when transaction_type='PURCHASE' then total_amount else 0 end) purchases from public.operations_transactions where business_date between p_from and p_to AND is_demo IS FALSE and status='CONFIRMED' group by business_date order by business_date)x),'[]'::json),
 'open_reconciliation',(select count(*) from public.operations_reconciliation_issues where business_date between p_from and p_to and status='OPEN'),
 'low_stock',(select count(*) from (select i.id from public.inventory_items i left join public.inventory_movements m on m.item_id=i.id and m.is_demo IS FALSE where i.is_active and i.is_demo IS FALSE and i.reorder_level is not null group by i.id having count(m.id)>0 and coalesce(sum(m.quantity),0)<=i.reorder_level)s)
 ) into v; return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_operations_summary(p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_sales bigint; v_purchases bigint; v_refunds bigint; v_tx bigint; v_items bigint; v_imports bigint;
begin
 if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
 select coalesce(sum(case when transaction_type='SALE' and status='CONFIRMED' then total_amount else 0 end),0),
        coalesce(sum(case when transaction_type='PURCHASE' and status='CONFIRMED' then total_amount else 0 end),0),
        coalesce(sum(case when transaction_type='REFUND' and status='CONFIRMED' then total_amount else 0 end),0),
        count(*) into v_sales,v_purchases,v_refunds,v_tx
 from public.operations_transactions where business_date between p_from and p_to AND is_demo IS FALSE;
 select count(*) into v_items from public.inventory_items where is_active and is_demo IS FALSE;
 select count(*) into v_imports from public.operations_import_batches where created_at::date between p_from and p_to;
 return json_build_object('sales',v_sales,'purchases',v_purchases,'refunds',v_refunds,'transaction_count',v_tx,'active_items',v_items,'import_count',v_imports);
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_store_inventory_overview_v3(p_store_id bigint)
 RETURNS TABLE(id bigint, sku text, name text, unit text, is_active boolean, on_hand numeric, reorder_level numeric, inventory_value numeric, low_stock boolean, category text, source_unit_system text, source_minimum_text text, source_current_text text, source_order_text text, source_note text, stock_unit text, order_unit text, conversion_quantity numeric, unit_configured boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT i.id,i.sku,i.name,i.unit,i.is_active,
   (CASE WHEN COUNT(m.id)>0 THEN SUM(m.quantity) ELSE NULL END)::numeric AS on_hand,
   i.reorder_level,
   (CASE WHEN COUNT(m.id)>0 THEN SUM(m.quantity*COALESCE(m.unit_cost,0)) ELSE NULL END)::numeric AS inventory_value,
   (CASE WHEN COUNT(m.id)=0 THEN NULL ELSE (i.reorder_level IS NOT NULL AND COALESCE(SUM(m.quantity),0)<=i.reorder_level) END) AS low_stock,
   i.category,i.source_unit_system,i.source_minimum_text,i.source_current_text,
   i.source_order_text,i.source_note,
   COALESCE(c.stock_unit,i.stock_unit),COALESCE(c.order_unit,i.order_unit),
   COALESCE(c.conversion_quantity,i.conversion_quantity),
   (COALESCE(c.stock_unit,i.stock_unit) IS NOT NULL
    AND COALESCE(c.order_unit,i.order_unit) IS NOT NULL
    AND COALESCE(c.conversion_quantity,i.conversion_quantity) IS NOT NULL)
 FROM public.inventory_items i
 LEFT JOIN public.inventory_movements m ON m.item_id=i.id AND m.is_demo IS FALSE
   AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
 LEFT JOIN public.store_inventory_unit_configs c
   ON c.store_id=p_store_id AND c.item_id=i.id
 WHERE i.is_demo IS FALSE
 GROUP BY i.id,c.stock_unit,c.order_unit,c.conversion_quantity
 ORDER BY i.is_active DESC,i.name;
END $function$
;
