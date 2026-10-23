-- MTG-12 / QA-06: missing valuation is UNKNOWN, never assumed free.
-- Read-only function replacement; no ledger, price or operating row DML.
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
   (CASE WHEN COUNT(m.id)=0 OR BOOL_OR(m.quantity IS NULL OR m.quantity::text IN ('NaN','Infinity','-Infinity')) THEN NULL ELSE SUM(m.quantity) END)::numeric AS on_hand,
   i.reorder_level,
   (CASE WHEN COUNT(m.id)=0
     OR BOOL_OR(m.quantity IS NULL OR m.quantity::text IN ('NaN','Infinity','-Infinity'))
     OR BOOL_OR(m.quantity<>0 AND (m.unit_cost IS NULL OR m.unit_cost<0))
     OR SUM(m.quantity)<0 OR SUM(m.quantity*m.unit_cost)<0
    THEN NULL ELSE SUM(m.quantity*COALESCE(m.unit_cost,0)) END)::numeric AS inventory_value,
   (CASE WHEN COUNT(m.id)=0 OR BOOL_OR(m.quantity IS NULL OR m.quantity::text IN ('NaN','Infinity','-Infinity')) THEN NULL ELSE (i.reorder_level IS NOT NULL AND COALESCE(SUM(m.quantity),0)<=i.reorder_level) END) AS low_stock,
   i.category,i.source_unit_system,i.source_minimum_text,i.source_current_text,
   i.source_order_text,i.source_note,
   COALESCE(c.stock_unit,i.stock_unit),COALESCE(c.order_unit,i.order_unit),
   COALESCE(c.conversion_quantity,i.conversion_quantity),
   (COALESCE(c.stock_unit,i.stock_unit) IS NOT NULL
    AND COALESCE(c.order_unit,i.order_unit) IS NOT NULL
    AND COALESCE(c.conversion_quantity,i.conversion_quantity) IS NOT NULL)
 FROM public.inventory_items i
 LEFT JOIN public.inventory_movements m ON m.item_id=i.id AND m.is_demo IS FALSE
   AND m.business_date<=(now() AT TIME ZONE 'Asia/Seoul')::date
   AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
 LEFT JOIN public.store_inventory_unit_configs c
   ON c.store_id=p_store_id AND c.item_id=i.id
 WHERE i.is_demo IS FALSE
 GROUP BY i.id,c.stock_unit,c.order_unit,c.conversion_quantity
 ORDER BY i.is_active DESC,i.name;
END $function$
;

REVOKE ALL ON FUNCTION public.admin_store_inventory_overview_v3(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_inventory_overview_v3(bigint) TO authenticated;
