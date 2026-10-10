-- Store-specific sales and purchase operations for verified Baekeok owners.
-- Preserve imported global/demo data with NULL store_id; never backfill without provenance.
ALTER TABLE public.operations_transactions ADD COLUMN IF NOT EXISTS store_id bigint REFERENCES public.stores(id);
ALTER TABLE public.operations_import_batches ADD COLUMN IF NOT EXISTS store_id bigint REFERENCES public.stores(id);
ALTER TABLE public.operations_raw_records ADD COLUMN IF NOT EXISTS store_id bigint REFERENCES public.stores(id);
CREATE INDEX IF NOT EXISTS operations_transactions_store_date_idx
 ON public.operations_transactions(store_id,business_date DESC,id DESC);
CREATE INDEX IF NOT EXISTS operations_batches_store_idx
 ON public.operations_import_batches(store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS operations_raw_store_idx
 ON public.operations_raw_records(store_id,source,source_record_key);

CREATE OR REPLACE FUNCTION public.admin_store_operations_summary(p_store_id bigint,p_from date,p_to date)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
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
 WHERE store_id=p_store_id AND business_date BETWEEN p_from AND p_to;
 SELECT count(*) INTO v_items FROM public.admin_store_inventory_overview_v3(p_store_id) WHERE is_active;
 SELECT count(*) INTO v_imports FROM public.operations_import_batches
 WHERE store_id=p_store_id AND created_at::date BETWEEN p_from AND p_to;
 RETURN json_build_object('sales',v_sales,'purchases',v_purchases,
   'refunds',v_refunds,'transaction_count',v_tx,'active_items',v_items,'import_count',v_imports);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_operations_analytics(p_store_id bigint,p_from date,p_to date)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
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
  'open_reconciliation',0,
  'low_stock',(SELECT count(*) FROM public.admin_store_inventory_overview_v3(p_store_id)
               WHERE is_active AND low_stock)
 ) INTO v;
 RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_operations_trend(p_store_id bigint,p_window text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_start timestamptz;v_bucket text;v json;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 CASE p_window
 WHEN '1h' THEN v_start=now()-interval '1 hour';v_bucket='minute';
 WHEN '24h' THEN v_start=now()-interval '24 hours';v_bucket='hour';
 WHEN '7d' THEN v_start=now()-interval '7 days';v_bucket='day';
 WHEN '1m' THEN v_start=now()-interval '1 month';v_bucket='day';
 WHEN '6m' THEN v_start=now()-interval '6 months';v_bucket='week';
 WHEN '1y' THEN v_start=now()-interval '1 year';v_bucket='month';
 ELSE RAISE EXCEPTION 'INVALID_WINDOW'; END CASE;
 WITH base AS (
   SELECT date_trunc(v_bucket,t.transacted_at) bucket,
     t.transaction_type,coalesce(t.counterparty,'미분류') menu,t.total_amount
   FROM public.operations_transactions t
   WHERE t.store_id=p_store_id AND t.transacted_at>=v_start AND t.status='CONFIRMED'
 ), totals AS (
   SELECT bucket,sum(CASE WHEN transaction_type='SALE' THEN total_amount
                          WHEN transaction_type='REFUND' THEN -total_amount ELSE 0 END) sales,
      sum(CASE WHEN transaction_type='PURCHASE' THEN total_amount ELSE 0 END) purchases
   FROM base GROUP BY bucket
 ), menus AS (
   SELECT bucket,menu,sum(CASE WHEN transaction_type='SALE' THEN total_amount
                               WHEN transaction_type='REFUND' THEN -total_amount ELSE 0 END) amount
   FROM base WHERE transaction_type IN('SALE','REFUND') GROUP BY bucket,menu
 ), topmenus AS (SELECT menu,sum(amount) amount FROM menus GROUP BY menu ORDER BY amount DESC LIMIT 8)
 SELECT json_build_object('window',p_window,'bucket',v_bucket,
   'totals',coalesce((SELECT json_agg(t ORDER BY bucket) FROM totals t),'[]'::json),
   'menus',coalesce((SELECT json_agg(m ORDER BY bucket,menu) FROM menus m
                    JOIN topmenus tm USING(menu)),'[]'::json),
   'menu_names',coalesce((SELECT json_agg(menu ORDER BY amount DESC) FROM topmenus),'[]'::json)
 ) INTO v;
 RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_operations_transactions(
 p_store_id bigint,p_from date,p_to date,p_type text DEFAULT NULL)
RETURNS TABLE(id bigint,business_date date,transaction_type text,channel text,
 counterparty text,net_amount bigint,vat_amount bigint,total_amount bigint,status text,source text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 RETURN QUERY SELECT t.id,t.business_date,t.transaction_type,t.channel,t.counterparty,
    t.net_amount,t.vat_amount,t.total_amount,t.status,t.source
 FROM public.operations_transactions t
 WHERE t.store_id=p_store_id AND t.business_date BETWEEN p_from AND p_to
   AND (p_type IS NULL OR t.transaction_type=p_type)
 ORDER BY t.business_date DESC,t.id DESC LIMIT 500;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_operations_inquiry(
 p_store_id bigint,p_from date,p_to date,p_type text DEFAULT NULL,p_channel text DEFAULT NULL)
RETURNS TABLE(id bigint,business_date date,transaction_type text,channel text,
 counterparty text,net_amount bigint,vat_amount bigint,total_amount bigint,status text,source text,is_demo boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 RETURN QUERY SELECT t.id,t.business_date,t.transaction_type,t.channel,t.counterparty,
  t.net_amount,t.vat_amount,t.total_amount,t.status,t.source,t.is_demo
 FROM public.operations_transactions t
 WHERE t.store_id=p_store_id AND t.business_date BETWEEN p_from AND p_to
   AND (p_type IS NULL OR t.transaction_type=p_type)
   AND (p_channel IS NULL OR t.channel=p_channel)
 ORDER BY t.business_date DESC,t.id DESC LIMIT 2000;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_operations_channels(
 p_store_id bigint,p_from date,p_to date)
RETURNS TABLE(channel text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 RETURN QUERY SELECT DISTINCT coalesce(t.channel,'기타')
 FROM public.operations_transactions t
 WHERE t.store_id=p_store_id AND t.business_date BETWEEN p_from AND p_to
 ORDER BY 1;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_operations_imports(p_store_id bigint)
RETURNS TABLE(id bigint,source text,file_name text,status text,row_count integer,
 error_message text,created_at timestamptz,completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT b.id,b.source,b.file_name,b.status,b.row_count,
  b.error_message,b.created_at,b.completed_at FROM public.operations_import_batches b
 WHERE b.store_id=p_store_id ORDER BY b.id DESC LIMIT 100;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_operations_collect_request(p_store_id bigint,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_bid bigint;v_source text:=upper(btrim(coalesce(p_source,'')));
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF v_source NOT IN ('KIS_POS','BAEMIN','COUPANGEATS','DDANGYO','ONLYONE')
 THEN RAISE EXCEPTION 'INVALID_SOURCE'; END IF;
 INSERT INTO public.operations_import_batches(
   store_id,source,source_store_key,idempotency_key,file_name,status,row_count)
 VALUES(p_store_id,v_source,'store:'||p_store_id,
        md5(v_source||clock_timestamp()::text),null,'READY',0)
 RETURNING id INTO v_bid;
 RETURN jsonb_build_object('ok',true,'batch_id',v_bid,'status','READY',
                           'source',v_source,'connector_configured',false);
END $function$;

-- Validated, idempotent per-store manual CSV import.
-- Rows without verified timestamp use the business date at 12:00 KST,
-- explicitly noted as date_only=true in metadata. No demo rows are reused.
CREATE OR REPLACE FUNCTION public.admin_store_operations_import_stage(
 p_store_id bigint,p_source text,p_file_name text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_bid bigint;v_n int:=0;v_source text;v_key text;v_store_key text;
 v_row jsonb;v_date date;v_total bigint;v_net bigint;v_vat bigint;
 v_type text;v_channel text;v_counterparty text;v_rawid bigint;v_time timestamptz;
 v_rawkey text;v_rows int;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 v_source:=upper(btrim(coalesce(p_source,'')));
 IF v_source NOT IN ('KIS_POS','BAEMIN','COUPANGEATS','DDANGYO','ONLYONE')
 THEN RAISE EXCEPTION 'INVALID_SOURCE'; END IF;
 IF NULLIF(btrim(p_file_name),'') IS NULL OR length(p_file_name)>255
 THEN RAISE EXCEPTION 'INVALID_FILE_NAME'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'ROWS_MUST_BE_ARRAY'; END IF;
 v_rows:=jsonb_array_length(p_rows);
 IF v_rows<1 OR v_rows>1500 THEN RAISE EXCEPTION 'INVALID_ROW_COUNT'; END IF;
 v_store_key:='store:'||p_store_id;
 INSERT INTO public.operations_import_batches(
    store_id,source,source_store_key,idempotency_key,file_name,status,row_count,started_at)
 VALUES(p_store_id,v_source,v_store_key,
        md5(v_source||':'||p_store_id||':'||p_file_name||':'||clock_timestamp()::text),
        p_file_name,'PROCESSING',v_rows,now()) RETURNING id INTO v_bid;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   v_n:=v_n+1;
   IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_ROW'; END IF;
   v_rawkey:=nullif(btrim(v_row->>'source_record_key'),'');
   v_key:=CASE WHEN v_rawkey IS NULL OR v_rawkey ~ '^[0-9]+$'
      THEN 'file:'||md5(p_file_name)||':'||coalesce(v_rawkey,v_n::text)
      ELSE left(v_rawkey,180) END;
   IF coalesce(v_row->>'business_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   THEN RAISE EXCEPTION 'INVALID_BUSINESS_DATE_ROW_%',v_n; END IF;
   v_date:=(v_row->>'business_date')::date;
   v_type:=upper(btrim(coalesce(v_row->>'transaction_type','')));
   IF v_type NOT IN ('SALE','PURCHASE','REFUND','ADJUSTMENT')
   THEN RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE_ROW_%',v_n; END IF;
   IF coalesce(v_row->>'total_amount','') !~ '^[0-9]{1,15}$'
   THEN RAISE EXCEPTION 'INVALID_TOTAL_AMOUNT_ROW_%',v_n; END IF;
   v_total:=(v_row->>'total_amount')::bigint;
   IF coalesce(v_row->>'net_amount','')<>'' AND
      (v_row->>'net_amount') !~ '^[0-9]{1,15}$'
   THEN RAISE EXCEPTION 'INVALID_NET_AMOUNT_ROW_%',v_n; END IF;
   IF coalesce(v_row->>'vat_amount','')<>'' AND
      (v_row->>'vat_amount') !~ '^[0-9]{1,15}$'
   THEN RAISE EXCEPTION 'INVALID_VAT_AMOUNT_ROW_%',v_n; END IF;
   v_net:=coalesce(nullif(v_row->>'net_amount','')::bigint,v_total);
   v_vat:=coalesce(nullif(v_row->>'vat_amount','')::bigint,0);
   IF v_net+v_vat<>v_total THEN RAISE EXCEPTION 'AMOUNT_MISMATCH_ROW_%',v_n; END IF;
   v_channel:=nullif(left(btrim(coalesce(v_row->>'channel','')),100),'');
   v_counterparty:=nullif(left(btrim(coalesce(v_row->>'counterparty','')),200),'');
   v_time:=(v_date::timestamp+interval '12 hours') AT TIME ZONE 'Asia/Seoul';
   INSERT INTO public.operations_raw_records(
      store_id,batch_id,source,source_store_key,source_record_key,
      business_date,payload,payload_hash)
   VALUES(p_store_id,v_bid,v_source,v_store_key,v_key,v_date,v_row,md5(v_row::text))
   ON CONFLICT(source,source_store_key,source_record_key) DO UPDATE
   SET store_id=excluded.store_id,batch_id=excluded.batch_id,
       business_date=excluded.business_date,payload=excluded.payload,
       payload_hash=excluded.payload_hash,ingested_at=now()
   RETURNING id INTO v_rawid;
   INSERT INTO public.operations_transactions(
     store_id,raw_record_id,source,source_store_key,source_record_key,
     transaction_type,transacted_at,business_date,channel,counterparty,
     net_amount,vat_amount,total_amount,status,metadata,is_demo)
   VALUES(p_store_id,v_rawid,v_source,v_store_key,v_key,v_type,v_time,v_date,
     v_channel,v_counterparty,v_net,v_vat,v_total,'CONFIRMED',
     jsonb_build_object('date_only',true,'file_name',p_file_name),false)
   ON CONFLICT(source,source_store_key,source_record_key) DO UPDATE SET
     raw_record_id=excluded.raw_record_id,store_id=excluded.store_id,
     transaction_type=excluded.transaction_type,transacted_at=excluded.transacted_at,
     business_date=excluded.business_date,channel=excluded.channel,
     counterparty=excluded.counterparty,net_amount=excluded.net_amount,
     vat_amount=excluded.vat_amount,total_amount=excluded.total_amount,
     status=excluded.status,metadata=excluded.metadata,
     is_demo=false,normalized_at=now();
 END LOOP;
 UPDATE public.operations_import_batches SET status='COMPLETED',
   completed_at=now() WHERE id=v_bid;
 RETURN jsonb_build_object('ok',true,'batch_id',v_bid,'row_count',v_n,
    'store_id',p_store_id,'normalized',true);
END $function$;

-- Store-level reconciliation issues aren't yet provenance mapped: report zero
-- instead of leaking HQ-global rows; full scoped reconciliation is a follow-up.
CREATE OR REPLACE FUNCTION public.admin_store_reconciliation_issues(
 p_store_id bigint,p_from date,p_to date)
RETURNS TABLE(id bigint,business_date date,issue_type text,left_source text,
 left_key text,right_source text,right_key text,amount_difference bigint,
 status text,detail jsonb,created_at timestamptz,resolved_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.admin_store_operations_summary(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_summary(bigint,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_analytics(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_analytics(bigint,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_trend(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_trend(bigint,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_transactions(bigint,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_transactions(bigint,date,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_inquiry(bigint,date,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_inquiry(bigint,date,date,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_channels(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_channels(bigint,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_imports(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_imports(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_collect_request(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_collect_request(bigint,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_operations_import_stage(bigint,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_import_stage(bigint,text,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_store_reconciliation_issues(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_reconciliation_issues(bigint,date,date) TO authenticated;
