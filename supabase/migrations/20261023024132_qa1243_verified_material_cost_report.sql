-- MTG-12: derive usage cost only from priced movement evidence and matching,
-- finalized opening/closing counts. Never equate purchase gross with usage.
-- Function DDL only; no inventory, stocktake, recipe or finance rows are changed.
CREATE OR REPLACE FUNCTION public.admin_store_material_cost_report(p_store_id bigint,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_open bigint;v_close bigint;v_items bigint;v_missing bigint;
 v_opening numeric;v_closing numeric;v_receipts numeric;v_returns numeric;
 v_usage numeric;v_waste numeric;v_service numeric;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF p_to>=(now() AT TIME ZONE 'Asia/Seoul')::date THEN
  RETURN jsonb_build_object('status','PERIOD_NOT_CLOSED','material_cost',NULL);
 END IF;
 SELECT id INTO v_open FROM public.store_inventory_stocktakes
 WHERE store_id=p_store_id AND status='POSTED' AND posted_at IS NOT NULL AND counted_on=p_from-1
 ORDER BY posted_at DESC,id DESC LIMIT 1;
 SELECT id INTO v_close FROM public.store_inventory_stocktakes
 WHERE store_id=p_store_id AND status='POSTED' AND posted_at IS NOT NULL AND counted_on=p_to
 ORDER BY posted_at DESC,id DESC LIMIT 1;
 IF v_open IS NULL OR v_close IS NULL THEN
  RETURN jsonb_build_object('status','FINAL_COUNTS_REQUIRED','material_cost',NULL);
 END IF;
 -- Every active real ingredient requires both physical boundaries. Priced
 -- movements reconcile to those counts; missing quantities/prices stay unknown.
 WITH evidence AS (
 SELECT i.id,o.counted_quantity oq,c.counted_quantity cq,
   count(m.id) FILTER(WHERE m.business_date<p_from) AS opening_rows,
   sum(m.quantity) FILTER(WHERE m.business_date<p_from) AS opening_qty,
   sum(m.quantity) AS closing_qty,
   sum(m.quantity*coalesce(m.unit_cost,0)) FILTER(WHERE m.business_date<p_from) AS opening_value,
   sum(m.quantity*coalesce(m.unit_cost,0)) AS closing_value,
   sum(m.quantity*coalesce(m.unit_cost,0)) FILTER(WHERE m.business_date>=p_from AND m.movement_type='RECEIPT') AS receipts,
   -sum(m.quantity*coalesce(m.unit_cost,0)) FILTER(WHERE m.business_date>=p_from AND m.movement_type='RETURN') AS returns,
   -sum(m.quantity*coalesce(m.unit_cost,0)) FILTER(WHERE m.business_date>=p_from AND m.movement_type IN('USAGE','WASTE','SERVICE')) AS usage,
   -sum(m.quantity*coalesce(m.unit_cost,0)) FILTER(WHERE m.business_date>=p_from AND m.movement_type='WASTE') AS waste,
   -sum(m.quantity*coalesce(m.unit_cost,0)) FILTER(WHERE m.business_date>=p_from AND m.movement_type='SERVICE') AS service,
   bool_or(m.quantity IS NULL OR m.quantity::text IN('NaN','Infinity','-Infinity')
    OR (m.quantity<>0 AND (m.unit_cost IS NULL OR m.unit_cost<0))
    OR (m.business_date>=p_from AND m.quantity<>0 AND (
      m.movement_type NOT IN('RECEIPT','RETURN','USAGE','WASTE','SERVICE')
      OR (m.movement_type='RECEIPT' AND m.quantity<0)
      OR (m.movement_type<>'RECEIPT' AND m.quantity>0)))) AS invalid
 FROM public.inventory_items i
 LEFT JOIN public.store_inventory_stocktake_lines o ON o.stocktake_id=v_open AND o.item_id=i.id
 LEFT JOIN public.store_inventory_stocktake_lines c ON c.stocktake_id=v_close AND c.item_id=i.id
 LEFT JOIN public.inventory_movements m ON m.item_id=i.id AND m.is_demo IS FALSE
  AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL)) AND m.business_date<=p_to
 WHERE i.is_active AND i.is_demo IS FALSE
 GROUP BY i.id,o.counted_quantity,c.counted_quantity
 )
 SELECT count(*),count(*) FILTER(WHERE opening_rows=0 OR oq IS NULL OR cq IS NULL
    OR oq::text IN('NaN','Infinity','-Infinity') OR cq::text IN('NaN','Infinity','-Infinity')
    OR oq<0 OR cq<0 OR opening_qty IS DISTINCT FROM oq OR closing_qty IS DISTINCT FROM cq
    OR invalid OR opening_value<0 OR closing_value<0),
   sum(opening_value),sum(closing_value),sum(coalesce(receipts,0)),sum(coalesce(returns,0)),
   sum(coalesce(usage,0)),sum(coalesce(waste,0)),sum(coalesce(service,0))
 INTO v_items,v_missing,v_opening,v_closing,v_receipts,v_returns,v_usage,v_waste,v_service FROM evidence;
 IF v_items=0 OR v_missing>0 THEN
  RETURN jsonb_build_object('status','INCOMPLETE_VALUATION','material_cost',NULL,
   'items',v_items,'missing_items',v_missing);
 END IF;
 IF v_opening+v_receipts-v_returns-v_closing IS DISTINCT FROM v_usage OR v_usage<0 THEN
  RETURN jsonb_build_object('status','VALUATION_MISMATCH','material_cost',NULL);
 END IF;
 RETURN jsonb_build_object('status','VERIFIED','store_id',p_store_id,'from',p_from,'to',p_to,
  'material_cost',round(v_usage),'unrounded_value',v_usage,'opening',v_opening,'closing',v_closing,
  'receipts',v_receipts,'returns',v_returns,'waste',v_waste,'service',v_service,
  'basis','PRICED_MOVEMENTS_AND_POSTED_COUNTS','items',v_items);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_store_material_cost_report(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_material_cost_report(bigint,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_store_operations_summary(p_store_id bigint, p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sales bigint;v_purchases bigint;v_refunds bigint;v_tx bigint;v_items bigint;v_imports bigint;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 SELECT coalesce(sum(CASE WHEN transaction_type='SALE' AND status='CONFIRMED' THEN total_amount ELSE 0 END),0),
        coalesce(sum(CASE WHEN transaction_type='PURCHASE' AND status='CONFIRMED' THEN total_amount ELSE 0 END),0),
        coalesce(sum(CASE WHEN transaction_type='REFUND' AND status='CONFIRMED' THEN total_amount ELSE 0 END),0),
        count(*) INTO v_sales,v_purchases,v_refunds,v_tx
 FROM public.operations_transactions
 WHERE store_id=p_store_id AND business_date BETWEEN p_from AND p_to AND is_demo IS FALSE;
 SELECT count(*) INTO v_items FROM public.admin_store_inventory_overview_v3(p_store_id) WHERE is_active;
 SELECT count(*) INTO v_imports FROM public.operations_import_batches
 WHERE store_id=p_store_id AND created_at::date BETWEEN p_from AND p_to;
 RETURN json_build_object('sales',v_sales,'purchases',v_purchases,
   'material_cost',public.admin_store_material_cost_report(p_store_id,p_from,p_to),
   'refunds',v_refunds,'transaction_count',v_tx,'active_items',v_items,'import_count',v_imports);
END $function$;
