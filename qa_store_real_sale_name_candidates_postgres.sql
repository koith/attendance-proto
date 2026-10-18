\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.stores(id bigint PRIMARY KEY,is_active boolean,onboarding_status text);
CREATE TABLE public.operations_transactions(id bigint PRIMARY KEY,store_id bigint,source text,is_demo boolean,transaction_type text,status text,business_date date,counterparty text);
CREATE FUNCTION public.can_manage_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $fn$
SELECT id=nullif(current_setting('qa.allowed_store',true),'')::bigint $fn$;
INSERT INTO public.stores VALUES(1,true,'READY'),(2,true,'READY'),(3,false,'STAGED');
INSERT INTO public.operations_transactions VALUES
(1,1,'KIS_POS',false,'SALE','CONFIRMED','2026-10-10','Americano'),
(2,1,'KIS_POS',false,'SALE','CONFIRMED','2026-10-11','Americano'),
(3,1,'BAEMIN',false,'SALE','CONFIRMED','2026-10-11','Promo Americano'),
(4,1,'KIS_POS',false,'SALE','CONFIRMED','2026-10-11','Americano 1L'),
(5,1,'KIS_POS',true,'SALE','CONFIRMED','2026-10-11','demo-item'),
(6,2,'KIS_POS',false,'SALE','CONFIRMED','2026-10-11','other-store-item'),
(7,1,'ONLYONE',false,'PURCHASE','CONFIRMED','2026-10-11','milk'),
(8,1,'KIS_POS',false,'SALE','CANCELLED','2026-10-11','cancelled-item'),
(9,1,'UNKNOWN',false,'SALE','CONFIRMED','2026-10-11','unknown-source');
\ir supabase/migrations/20261018231500_store_real_sale_menu_candidates.sql
DO $qa$ BEGIN
 IF has_function_privilege('anon','public.admin_store_sale_name_candidates(bigint,date,date,integer)','EXECUTE') THEN RAISE EXCEPTION 'ANON_LEAK'; END IF;
END $qa$;
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('qa.allowed_store','1',true);
DO $qa$
DECLARE n integer;r record;
BEGIN
 SELECT count(*) INTO n FROM public.admin_store_sale_name_candidates(1,'2026-10-01','2026-10-31',100);
 IF n<>3 THEN RAISE EXCEPTION 'ROW_SCOPE_FAIL: %',n; END IF;
 SELECT * INTO r FROM public.admin_store_sale_name_candidates(1,'2026-10-01','2026-10-31',100);
 IF r.sale_name<>'Americano' OR r.transaction_count<>2 THEN RAISE EXCEPTION 'AGGREGATION_FAIL'; END IF;
 BEGIN
  PERFORM public.admin_store_sale_name_candidates(2,'2026-10-01','2026-10-31',100);
  RAISE EXCEPTION 'CROSS_STORE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.admin_store_sale_name_candidates(1,'2026-11-02','2026-11-01',100);
  RAISE EXCEPTION 'INVALID_RANGE_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $qa$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS verified menu candidate scope' AS result;