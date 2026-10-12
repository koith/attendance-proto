\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.operations_raw_records(
 id bigint PRIMARY KEY,store_id bigint,source text,source_store_key text,
 source_record_key text,business_date date,ingested_at timestamptz,batch_id bigint
);
CREATE TABLE public.operations_transactions(
 id bigint PRIMARY KEY,store_id bigint,source text,source_store_key text,
 source_record_key text,status text,business_date date,transaction_type text,
 channel text,total_amount bigint
);
CREATE TABLE public.operations_import_batches(
 id bigint PRIMARY KEY,store_id bigint,status text,source text,
 file_name text,error_message text,created_at timestamptz
);
CREATE FUNCTION public.can_manage_store(p_store_id bigint) RETURNS boolean LANGUAGE sql STABLE
 AS $fn$ SELECT p_store_id=nullif(current_setting('test.allowed_store',true),'')::bigint $fn$;
CREATE FUNCTION public.admin_store_inventory_overview_v3(p_store_id bigint)
 RETURNS TABLE(is_active boolean,low_stock boolean) LANGUAGE sql
 AS $fn$ SELECT true,false WHERE false $fn$;
ALTER TABLE public.operations_raw_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_raw_records,public.operations_transactions,public.operations_import_batches FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
INSERT INTO public.operations_raw_records VALUES
 (11,1,'KIS_POS','store:1','r11','2026-10-10','2026-10-12 09:00:00+00',NULL),
 (12,1,'KIS_POS','store:1','r12','2026-10-10','2026-10-12 09:01:00+00',NULL),
 (13,1,'KIS_POS','store:1','r13','2026-10-10','2026-10-12 09:02:00+00',NULL),
 (14,2,'BAEMIN','store:2','r14','2026-10-10','2026-10-12 09:03:00+00',NULL),
 (15,1,'KIS_POS','store:1','r15','2026-09-10','2026-09-12 09:01:00+00',NULL);
INSERT INTO public.operations_transactions VALUES
 (101,1,'KIS_POS','store:1','r11','CONFIRMED','2026-10-10','SALE','POS',4500),
 (102,1,'KIS_POS','store:1','r13','REJECTED','2026-10-10','SALE','POS',7700);
INSERT INTO public.operations_import_batches VALUES
 (21,1,'FAILED','KIS_POS','import_bad.csv','INVALID_ROW','2026-10-12 09:04:00+00'),
 (22,2,'FAILED','BAEMIN','other_bad.csv','INVALID_ROW','2026-10-12 09:05:00+00'),
 (23,1,'COMPLETED','KIS_POS','valid.csv',NULL,'2026-10-12 09:06:00+00');
\ir supabase/migrations/20261012221000_store_operations_reconciliation.sql
DO $test$
BEGIN
 IF has_function_privilege('anon','public.admin_store_reconciliation_count(bigint,date,date)','EXECUTE')
 OR has_function_privilege('anon','public.admin_store_reconciliation_issues(bigint,date,date)','EXECUTE')
 THEN RAISE EXCEPTION 'anonymous reconciliation exposed'; END IF;
END $test$;
SET ROLE authenticated;
SET test.allowed_store TO '1';
DO $test$
DECLARE n bigint; counts json; denied boolean:=false; status_count bigint;
BEGIN
 n:=public.admin_store_reconciliation_count(1,'2026-10-01','2026-10-31');
 IF n<>3 THEN RAISE EXCEPTION 'incorrect real reconciliation count: %',n; END IF;
 SELECT count(*) INTO n FROM public.admin_store_reconciliation_issues(1,'2026-10-01','2026-10-31');
 IF n<>3 THEN RAISE EXCEPTION 'expected raw unnormalized + rejected + failed import: %',n; END IF;
 SELECT count(*) INTO status_count FROM public.admin_store_reconciliation_issues(1,'2026-10-01','2026-10-31') WHERE status='OPEN';
 IF status_count<>3 THEN RAISE EXCEPTION 'reconciliation status must remain OPEN'; END IF;
 counts:=public.admin_store_operations_analytics(1,'2026-10-01','2026-10-31');
 IF (counts->>'open_reconciliation')::bigint<>3 THEN
  RAISE EXCEPTION 'existing report KPI not wired to actual reconciliation: %',counts; END IF;
 IF json_array_length(counts->'daily')<>1 THEN RAISE EXCEPTION 'normal report daily data changed'; END IF;
 n:=public.admin_store_reconciliation_count(1,'2026-09-01','2026-09-30');
 IF n<>1 THEN RAISE EXCEPTION 'date-filtered reconciliation count wrong: %',n; END IF;
 BEGIN PERFORM public.admin_store_reconciliation_count(2,'2026-10-01','2026-10-31');
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-store reconciliation read succeeded'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM public.admin_store_reconciliation_issues(2,'2026-10-01','2026-10-31');
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-store detailed reconciliation disclosed'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM public.admin_store_reconciliation_issues(1,'2026-10-31','2026-10-01');
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'invalid date range succeeded'; END IF;
END $test$;
SET test.allowed_store TO '2';
DO $test$
DECLARE n bigint;
BEGIN
 n:=public.admin_store_reconciliation_count(2,'2026-10-01','2026-10-31');
 IF n<>2 THEN RAISE EXCEPTION 'second store sees wrong count: %',n; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS read-only store reconciliation: missed records/rejected normalization/failed import; HQ report unaffected' result;
