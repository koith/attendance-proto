-- Read-only, branch-scoped reconciliation for raw records and failed imports.
-- Existing real/demo transactions and original import batches are not modified.
CREATE OR REPLACE FUNCTION public.admin_store_reconciliation_count(
 p_store_id bigint,p_from date,p_to date
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_total bigint;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 SELECT
  (SELECT count(*) FROM public.operations_raw_records r
   WHERE r.store_id=p_store_id
     AND COALESCE(r.business_date,(r.ingested_at AT TIME ZONE 'Asia/Seoul')::date) BETWEEN p_from AND p_to
     AND NOT EXISTS(SELECT 1 FROM public.operations_transactions t
       WHERE t.store_id=p_store_id AND t.source=r.source
         AND t.source_store_key=r.source_store_key AND t.source_record_key=r.source_record_key
         AND t.status='CONFIRMED'))
  +
  (SELECT count(*) FROM public.operations_import_batches b
   WHERE b.store_id=p_store_id AND b.status='FAILED'
     AND (b.created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to)
 INTO v_total;
 RETURN v_total;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_reconciliation_issues(
 p_store_id bigint,p_from date,p_to date
)
RETURNS TABLE(
 id bigint,business_date date,issue_type text,left_source text,left_key text,
 right_source text,right_key text,amount_difference bigint,status text,detail jsonb,
 created_at timestamptz,resolved_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 RETURN QUERY
 SELECT -r.id,COALESCE(r.business_date,(r.ingested_at AT TIME ZONE 'Asia/Seoul')::date),'RAW_NOT_CONFIRMED'::text,
        r.source,r.source_record_key,t.source,t.source_record_key,
        NULL::bigint,'OPEN'::text,
        jsonb_build_object('raw_id',r.id,'batch_id',r.batch_id,'transaction_status',t.status),
        r.ingested_at,NULL::timestamptz
 FROM public.operations_raw_records r
 LEFT JOIN public.operations_transactions t
   ON t.store_id=p_store_id AND t.source=r.source
     AND t.source_store_key=r.source_store_key AND t.source_record_key=r.source_record_key
 WHERE r.store_id=p_store_id
   AND COALESCE(r.business_date,(r.ingested_at AT TIME ZONE 'Asia/Seoul')::date) BETWEEN p_from AND p_to
   AND (t.id IS NULL OR t.status<>'CONFIRMED')
 UNION ALL
 SELECT -(1000000000000::bigint+b.id),(b.created_at AT TIME ZONE 'Asia/Seoul')::date,
        'IMPORT_FAILED'::text,b.source,b.id::text,
        NULL::text,NULL::text,NULL::bigint,'OPEN'::text,
        jsonb_build_object('batch_id',b.id,'file_name',b.file_name,'error',b.error_message),
        b.created_at,NULL::timestamptz
 FROM public.operations_import_batches b
 WHERE b.store_id=p_store_id AND b.status='FAILED'
   AND (b.created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
 ORDER BY 11 DESC,1 DESC LIMIT 2000;
END $function$;

-- Preserve every existing reporting field and replace the placeholder zero
-- with an exact count computed from store-scoped raw data and failed jobs.
CREATE OR REPLACE FUNCTION public.admin_store_operations_analytics(p_store_id bigint, p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v json;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 SELECT json_build_object(
  'by_channel',coalesce((SELECT json_agg(x) FROM
    (SELECT coalesce(t.channel,'기타') channel,sum(t.total_amount) amount,count(*) transactions
     FROM public.operations_transactions t
     WHERE t.store_id=p_store_id AND t.business_date BETWEEN p_from AND p_to
      AND t.transaction_type='SALE' AND t.status='CONFIRMED'
     GROUP BY 1 ORDER BY 2 DESC) x),'[]'::json),
  'daily',coalesce((SELECT json_agg(x) FROM
    (SELECT t.business_date,
      sum(CASE WHEN t.transaction_type='SALE' THEN t.total_amount
               WHEN t.transaction_type='REFUND' THEN -t.total_amount ELSE 0 END) sales,
      sum(CASE WHEN t.transaction_type='PURCHASE' THEN t.total_amount ELSE 0 END) purchases
     FROM public.operations_transactions t
     WHERE t.store_id=p_store_id AND t.business_date BETWEEN p_from AND p_to
       AND t.status='CONFIRMED'
     GROUP BY t.business_date ORDER BY t.business_date) x),'[]'::json),
  'open_reconciliation',public.admin_store_reconciliation_count(p_store_id,p_from,p_to),
  'low_stock',(SELECT count(*) FROM public.admin_store_inventory_overview_v3(p_store_id)
               WHERE is_active AND low_stock)
 ) INTO v;
 RETURN v;
END $function$
;

REVOKE ALL ON FUNCTION public.admin_store_reconciliation_count(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_reconciliation_count(bigint,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_reconciliation_issues(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_reconciliation_issues(bigint,date,date) TO authenticated;
