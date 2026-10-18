\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.stores(id bigint PRIMARY KEY,is_active boolean,onboarding_status text);
CREATE TABLE public.operations_transactions(
 id bigint PRIMARY KEY,store_id bigint,business_date date,
 source text,source_record_key text,transaction_type text,status text,
 is_demo boolean,total_amount bigint,transacted_at timestamptz
);
CREATE FUNCTION public.can_manage_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $fn$
SELECT id=nullif(current_setting('qa.allowed_store',true),'')::bigint $fn$;
INSERT INTO public.stores VALUES(1,true,'READY'),(2,true,'READY'),(3,false,'STAGED');
INSERT INTO public.operations_transactions VALUES
(1,1,'2026-10-10','KIS_POS','pos-1','SALE','CONFIRMED',false,4800,'2026-10-10 12:00+09'),
(2,1,'2026-10-10','BAEMIN','delivery-1','SALE','CONFIRMED',false,4800,'2026-10-10 12:02+09'),
(3,1,'2026-10-10','BAEMIN','demo-delivery','SALE','CONFIRMED',true,4800,'2026-10-10 12:01+09'),
(4,2,'2026-10-10','BAEMIN','other-store','SALE','CONFIRMED',false,4800,'2026-10-10 12:02+09'),
(5,1,'2026-10-10','BAEMIN','too-late','SALE','CONFIRMED',false,4800,'2026-10-10 12:06+09'),
(6,1,'2026-10-10','BAEMIN','different-price','SALE','CONFIRMED',false,5000,'2026-10-10 12:01+09'),
(7,1,'2026-10-10','BAEMIN','refund','REFUND','CONFIRMED',false,4800,'2026-10-10 12:01+09'),
(8,1,'2026-10-10','BAEMIN','cancel','SALE','CANCELLED',false,4800,'2026-10-10 12:01+09'),
(9,1,'2026-10-10','KIS_POS','same-pos','SALE','CONFIRMED',false,4800,'2026-10-10 12:01+09'),
(10,1,'2026-10-10','BAEMIN','other-day-key','SALE','CONFIRMED',false,4800,'2026-10-11 12:01+09');
\ir supabase/migrations/20261018235000_cross_source_sale_suspects.sql
DO $qa$ BEGIN
 IF has_function_privilege('anon','public.admin_store_cross_source_sale_suspects(bigint,date,date,integer)','EXECUTE') THEN RAISE EXCEPTION 'ANON_LEAK'; END IF;
END $qa$;
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('qa.allowed_store','1',true);
DO $qa$
DECLARE n integer;rec record;
BEGIN
 SELECT count(*) INTO n FROM public.admin_store_cross_source_sale_suspects(1,'2026-10-01','2026-10-31',100);
 IF n<>2 THEN RAISE EXCEPTION 'CROSS_SOURCE_SCOPE_FAIL %',n; END IF;
 SELECT * INTO rec FROM public.admin_store_cross_source_sale_suspects(1,'2026-10-01','2026-10-31',100);
 IF rec.delivery_transaction_id<>2 OR rec.delivery_source<>'BAEMIN' OR rec.gap_seconds>300 THEN RAISE EXCEPTION 'RESULT_SHAPE_FAIL'; END IF;
 BEGIN
  PERFORM public.admin_store_cross_source_sale_suspects(2,'2026-10-01','2026-10-31',100);
  RAISE EXCEPTION 'CROSS_STORE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.admin_store_cross_source_sale_suspects(1,'2026-11-02','2026-11-01',100);
  RAISE EXCEPTION 'INVALID_RANGE_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $qa$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS POS delivery suspected duplicates are suggestions, never adjustments' AS result;