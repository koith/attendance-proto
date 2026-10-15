-- #833: stable server-side pagination and real/demo data isolation.
-- Original transactions and legacy RPC signatures are preserved.
-- Actual mode returns ONLY confirmed, non-demo source rows. Demo mode is opt-in.
CREATE OR REPLACE FUNCTION public.admin_operations_inquiry_page(p_from date, p_to date, p_type text DEFAULT NULL, p_channel text DEFAULT NULL, p_page integer DEFAULT 1, p_page_size integer DEFAULT 100, p_mode text DEFAULT 'actual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $func$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('actual','demo') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
 IF p_page IS NULL OR p_page < 1 OR p_page > 100000 OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 200 THEN
    RAISE EXCEPTION 'INVALID_PAGE';
 END IF;
 WITH matching AS MATERIALIZED (
   SELECT x.id,x.business_date,x.transaction_type,x.channel,x.counterparty,
          x.net_amount,x.vat_amount,x.total_amount,x.status,x.source,x.is_demo
   FROM public.operations_transactions x
   WHERE x.business_date BETWEEN p_from AND p_to 
     AND (p_type IS NULL OR x.transaction_type=p_type)
     AND (p_channel IS NULL OR COALESCE(x.channel,'기타')=p_channel)
     AND (CASE WHEN p_mode='demo' THEN x.is_demo IS TRUE
               ELSE x.is_demo IS FALSE AND x.status='CONFIRMED' END)
 ), stats AS (
   SELECT count(*) AS total_count,
          COALESCE(sum(net_amount) FILTER(WHERE status='CONFIRMED'),0) AS net,
          COALESCE(sum(vat_amount) FILTER(WHERE status='CONFIRMED'),0) AS vat,
          COALESCE(sum(total_amount) FILTER(WHERE status='CONFIRMED'),0) AS total
   FROM matching
 ), paged AS (
   SELECT * FROM matching ORDER BY business_date DESC,id DESC
   LIMIT p_page_size OFFSET (p_page-1)*p_page_size
 )
 SELECT jsonb_build_object(
   'rows',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.business_date DESC,r.id DESC) FROM paged r),'[]'::jsonb),
   'total_count',s.total_count,
   'totals',jsonb_build_object('net',s.net,'vat',s.vat,'total',s.total),
   'page',p_page,'page_size',p_page_size,'mode',p_mode
 ) INTO v_result FROM stats s;
 RETURN v_result;
END $func$;
CREATE OR REPLACE FUNCTION public.admin_store_operations_inquiry_page(p_store_id bigint, p_from date, p_to date, p_type text DEFAULT NULL, p_channel text DEFAULT NULL, p_page integer DEFAULT 1, p_page_size integer DEFAULT 100, p_mode text DEFAULT 'actual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $func$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('actual','demo') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
 IF p_page IS NULL OR p_page < 1 OR p_page > 100000 OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 200 THEN
    RAISE EXCEPTION 'INVALID_PAGE';
 END IF;
 WITH matching AS MATERIALIZED (
   SELECT x.id,x.business_date,x.transaction_type,x.channel,x.counterparty,
          x.net_amount,x.vat_amount,x.total_amount,x.status,x.source,x.is_demo
   FROM public.operations_transactions x
   WHERE x.business_date BETWEEN p_from AND p_to AND x.store_id = p_store_id
     AND (p_type IS NULL OR x.transaction_type=p_type)
     AND (p_channel IS NULL OR COALESCE(x.channel,'기타')=p_channel)
     AND (CASE WHEN p_mode='demo' THEN x.is_demo IS TRUE
               ELSE x.is_demo IS FALSE AND x.status='CONFIRMED' END)
 ), stats AS (
   SELECT count(*) AS total_count,
          COALESCE(sum(net_amount) FILTER(WHERE status='CONFIRMED'),0) AS net,
          COALESCE(sum(vat_amount) FILTER(WHERE status='CONFIRMED'),0) AS vat,
          COALESCE(sum(total_amount) FILTER(WHERE status='CONFIRMED'),0) AS total
   FROM matching
 ), paged AS (
   SELECT * FROM matching ORDER BY business_date DESC,id DESC
   LIMIT p_page_size OFFSET (p_page-1)*p_page_size
 )
 SELECT jsonb_build_object(
   'rows',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.business_date DESC,r.id DESC) FROM paged r),'[]'::jsonb),
   'total_count',s.total_count,
   'totals',jsonb_build_object('net',s.net,'vat',s.vat,'total',s.total),
   'page',p_page,'page_size',p_page_size,'mode',p_mode
 ) INTO v_result FROM stats s;
 RETURN v_result;
END $func$;
CREATE OR REPLACE FUNCTION public.admin_operations_channels_mode(p_from date, p_to date, p_mode text DEFAULT 'actual')
RETURNS TABLE(channel text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $func$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('actual','demo') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
 RETURN QUERY
 SELECT DISTINCT COALESCE(x.channel,'기타')::text
 FROM public.operations_transactions x
 WHERE x.business_date BETWEEN p_from AND p_to 
 AND (CASE WHEN p_mode='demo' THEN x.is_demo IS TRUE
           ELSE x.is_demo IS FALSE AND x.status='CONFIRMED' END)
 ORDER BY 1;
END $func$;
CREATE OR REPLACE FUNCTION public.admin_store_operations_channels_mode(p_store_id bigint, p_from date, p_to date, p_mode text DEFAULT 'actual')
RETURNS TABLE(channel text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $func$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('actual','demo') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
 RETURN QUERY
 SELECT DISTINCT COALESCE(x.channel,'기타')::text
 FROM public.operations_transactions x
 WHERE x.business_date BETWEEN p_from AND p_to AND x.store_id=p_store_id
 AND (CASE WHEN p_mode='demo' THEN x.is_demo IS TRUE
           ELSE x.is_demo IS FALSE AND x.status='CONFIRMED' END)
 ORDER BY 1;
END $func$;

REVOKE ALL ON FUNCTION public.admin_operations_inquiry_page(date,date,text,text,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_operations_inquiry_page(date,date,text,text,integer,integer,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_store_operations_inquiry_page(bigint,date,date,text,text,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_inquiry_page(bigint,date,date,text,text,integer,integer,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_operations_channels_mode(date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_operations_channels_mode(date,date,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_store_operations_channels_mode(bigint,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_channels_mode(bigint,date,date,text) TO authenticated, service_role;
