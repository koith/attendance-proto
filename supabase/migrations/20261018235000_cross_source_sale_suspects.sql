-- MTG-06: reviewer-only POS vs delivery cross-source *suspicions*.
-- Same amount and nearby times NEVER prove an actual duplicate. Read-only.
CREATE OR REPLACE FUNCTION public.admin_store_cross_source_sale_suspects(
 p_store_id bigint,p_from date,p_to date,p_limit integer DEFAULT 100
)
RETURNS TABLE(
 pos_transaction_id bigint,delivery_transaction_id bigint,business_date date,
 pos_key text,delivery_key text,delivery_source text,total_amount bigint,
 gap_seconds integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id=p_store_id
  AND s.is_active AND s.onboarding_status='READY') THEN
  RAISE EXCEPTION 'STORE_NOT_READY' USING ERRCODE='42501';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366
   OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'INVALID_SUSPECT_RANGE' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT pos.id,delivery.id,pos.business_date,pos.source_record_key,
  delivery.source_record_key,delivery.source, pos.total_amount,
  ABS(EXTRACT(EPOCH FROM (pos.transacted_at-delivery.transacted_at)))::integer
 FROM public.operations_transactions pos
 JOIN public.operations_transactions delivery
   ON delivery.store_id=pos.store_id
  AND delivery.business_date=pos.business_date
  AND delivery.id<>pos.id
  AND delivery.total_amount=pos.total_amount
  AND delivery.transacted_at BETWEEN pos.transacted_at-INTERVAL '5 minutes'
                                 AND pos.transacted_at+INTERVAL '5 minutes'
  AND delivery.source IN ('BAEMIN','COUPANG_EATS','COUPANGEATS')
  AND delivery.transaction_type='SALE' AND delivery.status='CONFIRMED'
  AND delivery.is_demo IS FALSE
 WHERE pos.store_id=p_store_id
  AND pos.business_date BETWEEN p_from AND p_to
  AND pos.source='KIS_POS' AND pos.transaction_type='SALE'
  AND pos.status='CONFIRMED' AND pos.is_demo IS FALSE AND pos.total_amount>0
 ORDER BY ABS(EXTRACT(EPOCH FROM (pos.transacted_at-delivery.transacted_at))) ASC,
  pos.business_date DESC,pos.id,delivery.id
 LIMIT p_limit;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_store_cross_source_sale_suspects(bigint,date,date,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_cross_source_sale_suspects(bigint,date,date,integer)
 TO authenticated;