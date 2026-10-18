-- MTG-07 #1118: read-only discovery of VERIFIED non-demo sale names from
-- the user's own store. A transaction COUNT is not the sold item quantity.
CREATE OR REPLACE FUNCTION public.admin_store_sale_name_candidates(
 p_store_id bigint,p_from date,p_to date,p_limit integer DEFAULT 100
)
RETURNS TABLE(sale_name text,transaction_count bigint,last_seen_on date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.stores s
  WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY') THEN
  RAISE EXCEPTION 'STORE_NOT_READY' USING ERRCODE='42501';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR
    p_to-p_from>366 OR p_to>(now() AT TIME ZONE 'Asia/Seoul')::date OR
    p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'INVALID_CANDIDATE_RANGE' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT btrim(t.counterparty)::text AS sale_name,
  count(*)::bigint AS transaction_count,max(t.business_date)::date AS last_seen_on
 FROM public.operations_transactions t
 WHERE t.store_id=p_store_id AND t.is_demo IS FALSE
   AND t.transaction_type='SALE' AND t.status='CONFIRMED'
   AND t.business_date BETWEEN p_from AND p_to
   -- These are documented sale-menu sources; do not extract purchase supplier,
   -- unknown source customer fields or demo labels as menu names.
   AND t.source IN ('KIS_POS','BAEMIN','COUPANG_EATS','COUPANGEATS')
   AND t.counterparty IS NOT NULL
   AND length(btrim(t.counterparty)) BETWEEN 1 AND 120
   AND btrim(t.counterparty) NOT LIKE '[예시]%'
 GROUP BY btrim(t.counterparty)
 ORDER BY count(*) DESC,max(t.business_date) DESC,btrim(t.counterparty)
 LIMIT p_limit;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_store_sale_name_candidates(bigint,date,date,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_sale_name_candidates(bigint,date,date,integer)
 TO authenticated;
