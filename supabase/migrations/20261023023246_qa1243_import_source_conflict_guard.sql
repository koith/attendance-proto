-- MTG-05/06/08: reject ambiguous identity before a CSV row can overwrite another row.
-- Corrections in separate imports retain the established explicit upload behavior.
-- Function-only replacement, no production data DML.
CREATE OR REPLACE FUNCTION public.admin_store_operations_import_stage(
 p_store_id bigint,p_source text,p_file_name text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_bid bigint;v_n int:=0;v_source text;v_key text;v_store_key text;
 v_row jsonb;v_date date;v_total bigint;v_net bigint;v_vat bigint;
 v_type text;v_channel text;v_counterparty text;v_rawid bigint;v_time timestamptz;
 v_rawkey text;v_rows int;v_seen text[]:=ARRAY[]::text[];
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
   IF length(v_rawkey)>180 THEN RAISE EXCEPTION 'SOURCE_RECORD_KEY_TOO_LONG_ROW_%',v_n; END IF;
   v_key:=CASE WHEN v_rawkey IS NULL OR v_rawkey ~ '^[0-9]+$'
      THEN 'file:'||md5(p_file_name)||':'||coalesce(v_rawkey,v_n::text)
      ELSE v_rawkey END;
   IF v_key=ANY(v_seen) THEN RAISE EXCEPTION 'DUPLICATE_SOURCE_RECORD_KEY_ROW_%',v_n; END IF;
   v_seen:=array_append(v_seen,v_key);
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
REVOKE ALL ON FUNCTION public.admin_store_operations_import_stage(bigint,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_operations_import_stage(bigint,text,text,jsonb) TO authenticated;
