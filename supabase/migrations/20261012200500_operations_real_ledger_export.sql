-- Read-only, cursor-paged, confirmed REAL operations ledger export.
-- Additive RPCs only: no modification to existing production sales, payroll,
-- POS, attendance, inventory, or historical demo transactions.
-- Direct tables remain RLS protected; clients use scoped SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.admin_store_operations_export_page(
  p_store_id bigint, p_from date, p_to date, p_type text DEFAULT NULL,
  p_channel text DEFAULT NULL, p_before_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id bigint, business_date date, transaction_type text, channel text,
  counterparty text, net_amount bigint, vat_amount bigint, total_amount bigint,
  status text, source text, source_record_key text, is_demo boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NOT public.can_manage_store(p_store_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'INVALID_PAGE_SIZE';
  END IF;
  RETURN QUERY
    SELECT t.id,t.business_date,t.transaction_type,t.channel,t.counterparty,
           t.net_amount,t.vat_amount,t.total_amount,
           t.status,t.source,t.source_record_key,t.is_demo
      FROM public.operations_transactions t
     WHERE t.store_id = p_store_id
       AND t.business_date BETWEEN p_from AND p_to
       AND (p_type IS NULL OR t.transaction_type = p_type)
       AND (p_channel IS NULL OR t.channel = p_channel)
       AND (p_before_id IS NULL OR t.id < p_before_id)
       AND t.is_demo = false
       AND t.status = 'CONFIRMED'
     ORDER BY t.id DESC
     LIMIT p_limit;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_operations_export_page(
  p_from date, p_to date, p_type text DEFAULT NULL,
  p_channel text DEFAULT NULL, p_before_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id bigint, business_date date, transaction_type text, channel text,
  counterparty text, net_amount bigint, vat_amount bigint, total_amount bigint,
  status text, source text, source_record_key text, is_demo boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NOT public.is_hq_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'INVALID_PAGE_SIZE';
  END IF;
  RETURN QUERY
    SELECT t.id,t.business_date,t.transaction_type,t.channel,t.counterparty,
           t.net_amount,t.vat_amount,t.total_amount,
           t.status,t.source,t.source_record_key,t.is_demo
      FROM public.operations_transactions t
     WHERE t.business_date BETWEEN p_from AND p_to
       AND (p_type IS NULL OR t.transaction_type = p_type)
       AND (p_channel IS NULL OR t.channel = p_channel)
       AND (p_before_id IS NULL OR t.id < p_before_id)
       AND t.is_demo = false
       AND t.status = 'CONFIRMED'
     ORDER BY t.id DESC
     LIMIT p_limit;
END $function$;

REVOKE ALL ON FUNCTION public.admin_store_operations_export_page(bigint,date,date,text,text,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_export_page(bigint,date,date,text,text,bigint,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_operations_export_page(date,date,text,text,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_operations_export_page(date,date,text,text,bigint,integer) TO authenticated;
