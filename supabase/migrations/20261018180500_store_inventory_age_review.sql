-- #1076 MTG-14: read-only "review suggested" from verified store-scoped stock movements.
-- This is NOT a use-by/expiry estimate. No stock records are written or altered.
CREATE OR REPLACE FUNCTION public.admin_store_inventory_age_review(
  p_store_id bigint, p_days_threshold integer DEFAULT 60
)
RETURNS TABLE (
  item_id bigint, item_name text, unit text, on_hand numeric,
  last_receipt_on date, last_usage_on date, days_since_receipt integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public,pg_temp
AS $function$
BEGIN
  IF NOT public.can_manage_store(p_store_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY'
  ) THEN
    RAISE EXCEPTION 'STORE_NOT_READY' USING ERRCODE='42501';
  END IF;
  IF p_days_threshold IS NULL OR p_days_threshold NOT BETWEEN 7 AND 365 THEN
    RAISE EXCEPTION 'INVALID_REVIEW_DAYS' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  WITH sums AS (
    SELECT i.id AS ref_id, i.name AS ref_name, i.unit AS ref_unit,
      SUM(m.quantity) AS measured_balance,
      MAX(m.business_date) FILTER (
        WHERE m.movement_type='RECEIPT' AND m.quantity>0
      ) AS last_receipt,
      MAX(m.business_date) FILTER (WHERE m.quantity<0) AS last_usage
    FROM public.inventory_items i
    JOIN public.inventory_movements m ON m.item_id=i.id
      AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
      AND m.is_demo IS FALSE AND m.business_date<=((now() AT TIME ZONE 'Asia/Seoul')::date)
    WHERE i.is_active AND i.is_demo IS FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_movements dm
        WHERE dm.item_id=i.id AND dm.is_demo
          AND (dm.store_id=p_store_id OR (p_store_id=1 AND dm.store_id IS NULL))
      )
    GROUP BY i.id,i.name,i.unit
  )
  SELECT a.ref_id,a.ref_name,a.ref_unit,a.measured_balance,
    a.last_receipt,a.last_usage,
    (((now() AT TIME ZONE 'Asia/Seoul')::date)-a.last_receipt)::integer
  FROM sums a
  WHERE a.measured_balance>0
    AND a.last_receipt IS NOT NULL
    AND a.last_receipt<=((now() AT TIME ZONE 'Asia/Seoul')::date-p_days_threshold)
  ORDER BY a.last_receipt ASC,a.ref_id ASC
  LIMIT 200;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_store_inventory_age_review(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_inventory_age_review(bigint,integer) TO authenticated;
