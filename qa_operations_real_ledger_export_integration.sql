\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
CREATE TABLE public.operations_transactions(
 id bigint PRIMARY KEY, store_id bigint, business_date date, transaction_type text,
 channel text, counterparty text, net_amount bigint, vat_amount bigint,
 total_amount bigint, status text, source text, source_record_key text,
 is_demo boolean
);
ALTER TABLE public.operations_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_transactions FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.can_manage_store(p_store_id bigint)
 RETURNS boolean LANGUAGE sql STABLE AS $fn$
 SELECT p_store_id = nullif(current_setting('test.allowed_store',true),'')::bigint
 $fn$;
CREATE FUNCTION public.is_hq_admin()
 RETURNS boolean LANGUAGE sql STABLE AS $fn$
 SELECT coalesce(nullif(current_setting('test.hq',true),''),'false')='true'
 $fn$;
INSERT INTO public.operations_transactions
 SELECT i,1,'2026-10-10'::date,'SALE','KIS_POS','커피',4000,400,4400,
   'CONFIRMED','KIS_POS','receipt-'||i,false
 FROM generate_series(1,1007) i;
INSERT INTO public.operations_transactions VALUES
 (2001,2,'2026-10-10','SALE','BAEMIN','타 매장',7000,700,7700,'CONFIRMED','BAEMIN','other1',false),
 (2002,2,'2026-10-10','PURCHASE','ONLYONE','타 매장 매입',10000,1000,11000,'CONFIRMED','ONLYONE','other2',false),
 (3000,1,'2026-10-10','SALE','KIS_POS','=HYPERLINK("bad")',100,10,110,'CONFIRMED','DEMO','fake',true),
 (3001,1,'2026-10-10','SALE','KIS_POS','무효 거래',100,10,110,'REJECTED','KIS_POS','reject',false),
 (3002,1,'2026-09-15','SALE','KIS_POS','이전 달',100,10,110,'CONFIRMED','KIS_POS','sept',false);

\ir supabase/migrations/20261012200500_operations_real_ledger_export.sql
DO $test$
BEGIN
 IF has_function_privilege('anon','public.admin_store_operations_export_page(bigint,date,date,text,text,bigint,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'anonymous store export RPC exposed'; END IF;
 IF has_function_privilege('anon','public.admin_operations_export_page(date,date,text,text,bigint,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'anonymous HQ export RPC exposed'; END IF;
END $test$;

SET ROLE authenticated;
SET test.allowed_store TO '1';
SET test.hq TO 'false';
DO $test$
DECLARE n integer; mn bigint; mx bigint; denied boolean:=false;
BEGIN
 SELECT count(*),min(id),max(id) INTO n,mn,mx
 FROM public.admin_store_operations_export_page(1,'2026-10-01','2026-10-31',NULL,NULL,NULL,500);
 IF n<>500 OR mn<>508 OR mx<>1007 THEN
   RAISE EXCEPTION 'first page wrong count/cursor: count %, min %, max %',n,mn,mx;
 END IF;
 SELECT count(*),min(id),max(id) INTO n,mn,mx
 FROM public.admin_store_operations_export_page(1,'2026-10-01','2026-10-31',NULL,NULL,508,500);
 IF n<>500 OR mn<>8 OR mx<>507 THEN
   RAISE EXCEPTION 'second page wrong count/cursor: count %, min %, max %',n,mn,mx;
 END IF;
 SELECT count(*),min(id),max(id) INTO n,mn,mx
 FROM public.admin_store_operations_export_page(1,'2026-10-01','2026-10-31',NULL,NULL,8,500);
 IF n<>7 OR mn<>1 OR mx<>7 THEN
   RAISE EXCEPTION 'final page wrong count/cursor: count %, min %, max %',n,mn,mx;
 END IF;
 SELECT count(*) INTO n
 FROM public.admin_store_operations_export_page(1,'2026-10-01','2026-10-31','PURCHASE',NULL,NULL,500);
 IF n<>0 THEN RAISE EXCEPTION 'type-filter failed'; END IF;
 SELECT count(*) INTO n
 FROM public.admin_store_operations_export_page(1,'2026-10-01','2026-10-31',NULL,'BAEMIN',NULL,500);
 IF n<>0 THEN RAISE EXCEPTION 'channel-filter failed'; END IF;
 BEGIN
   PERFORM * FROM public.admin_store_operations_export_page(2,'2026-10-01','2026-10-31');
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-store financial export succeeded'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM public.admin_operations_export_page('2026-10-01','2026-10-31');
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'store owner invoked HQ financial export'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM public.admin_store_operations_export_page(1,'2026-10-01','2026-10-31',NULL,NULL,NULL,501);
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'oversized page succeeded'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM public.admin_store_operations_export_page(1,'2026-10-31','2026-10-01');
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'invalid date range succeeded'; END IF;
END $test$;
SET test.hq TO 'true';
DO $test$
DECLARE n integer; demo_visible integer; invalid_visible integer;
BEGIN
 SELECT count(*),count(*) FILTER (WHERE is_demo),count(*) FILTER (WHERE status<>'CONFIRMED')
 INTO n,demo_visible,invalid_visible
 FROM public.admin_operations_export_page('2026-10-01','2026-10-31',NULL,NULL,NULL,500);
 IF n<>500 OR demo_visible<>0 OR invalid_visible<>0 THEN
   RAISE EXCEPTION 'HQ first page leaked demo/rejected data or incorrect pagination';
 END IF;
 SELECT count(*) INTO n
 FROM public.admin_operations_export_page('2026-10-01','2026-10-31','PURCHASE','ONLYONE');
 IF n<>1 THEN RAISE EXCEPTION 'HQ must see real cross-store purchase'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS real-only scoped operations export: 1,007 rows paginated, RBAC, demo/invalid filter, no data writes' AS result;
