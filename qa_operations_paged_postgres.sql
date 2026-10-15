-- #833 isolated PostgreSQL 16 acceptance: >2500 rows, stable pages, filtered totals, ACL.
BEGIN;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.operations_transactions(
 id bigint PRIMARY KEY, store_id bigint NOT NULL, business_date date NOT NULL,
 transaction_type text NOT NULL,channel text,counterparty text,
 net_amount bigint,vat_amount bigint,total_amount bigint,status text,source text,is_demo boolean NOT NULL
);
CREATE OR REPLACE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT current_setting('qa.hq',true)='1' $$;
CREATE OR REPLACE FUNCTION public.can_manage_store(bigint) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT $1=1 AND current_setting('qa.store',true)='1' $$;
\i supabase/migrations/20261015150500_operations_paged_real_demo_v1.sql
INSERT INTO public.operations_transactions
SELECT g,1,DATE '2026-09-12','SALE','DEMO','샘플',100,10,110,'CONFIRMED','FIXTURE',true
FROM generate_series(1,2505) g;
INSERT INTO public.operations_transactions VALUES
(3001,1,'2026-09-14','SALE','POS','실거래A',100,10,110,'CONFIRMED','FIXTURE',false),
(3002,1,'2026-09-13','SALE','POS','실거래B',200,20,220,'CONFIRMED','FIXTURE',false),
(3003,2,'2026-09-13','SALE','POS','타지점',300,30,330,'CONFIRMED','FIXTURE',false),
(3004,1,'2026-09-12','SALE','POS','미확정',400,40,440,'PENDING','FIXTURE',false);
SELECT set_config('qa.hq','1',true),set_config('qa.store','1',true);
DO $$
DECLARE a jsonb; b jsonb; c jsonb; actual jsonb; store_actual jsonb; found boolean;
BEGIN
 a:=public.admin_operations_inquiry_page('2026-09-01','2026-09-30',NULL,NULL,1,200,'demo');
 b:=public.admin_operations_inquiry_page('2026-09-01','2026-09-30',NULL,NULL,2,200,'demo');
 c:=public.admin_operations_inquiry_page('2026-09-01','2026-09-30',NULL,NULL,13,200,'demo');
 IF (a->>'total_count')::integer<>2505 OR jsonb_array_length(a->'rows')<>200 OR
    jsonb_array_length(b->'rows')<>200 OR jsonb_array_length(c->'rows')<>105 THEN
     RAISE EXCEPTION 'PAGINATION_TRUNCATED_OR_COUNT_MISMATCH';
 END IF;
 SELECT EXISTS (
 SELECT 1 FROM jsonb_array_elements(a->'rows') x JOIN jsonb_array_elements(b->'rows') y ON x->>'id'=y->>'id'
 ) INTO found;
 IF found THEN RAISE EXCEPTION 'DUPLICATE_ROWS_ACROSS_PAGES'; END IF;
 IF (a->'rows'->0->>'id')::bigint<= (b->'rows'->0->>'id')::bigint THEN
    RAISE EXCEPTION 'SORT_ORDER_UNSTABLE';
 END IF;
 actual:=public.admin_operations_inquiry_page('2026-09-01','2026-09-30');
 IF (actual->>'total_count')::integer<>3 OR (actual->'totals'->>'total')::bigint<>660 OR
    jsonb_array_length(actual->'rows')<>3 THEN RAISE EXCEPTION 'REAL_DATA_SCOPE_OR_TOTALS'; END IF;
 store_actual:=public.admin_store_operations_inquiry_page(1,'2026-09-01','2026-09-30');
 IF (store_actual->>'total_count')::integer<>2 OR (store_actual->'totals'->>'total')::bigint<>330 THEN
    RAISE EXCEPTION 'STORE_ISOLATION_OR_TOTALS';
 END IF;
 IF (SELECT count(*) FROM public.admin_operations_channels_mode('2026-09-01','2026-09-30','actual'))<>1
 OR (SELECT count(*) FROM public.admin_operations_channels_mode('2026-09-01','2026-09-30','demo'))<>1
 OR (SELECT channel FROM public.admin_operations_channels_mode('2026-09-01','2026-09-30','actual'))<>'POS'
 OR (SELECT channel FROM public.admin_operations_channels_mode('2026-09-01','2026-09-30','demo'))<>'DEMO'
 THEN RAISE EXCEPTION 'CHANNEL_MODE_LEAK'; END IF;
 IF has_function_privilege('anon','public.admin_operations_inquiry_page(date,date,text,text,integer,integer,text)','EXECUTE')
 THEN RAISE EXCEPTION 'ANON_RPC_ACCESS'; END IF;
 BEGIN
  PERFORM public.admin_operations_inquiry_page('2026-09-01','2026-09-30',NULL,NULL,0,200,'actual');
  RAISE EXCEPTION 'INVALID_PAGE_ACCEPTED';
 EXCEPTION WHEN others THEN IF SQLERRM<>'INVALID_PAGE' THEN RAISE; END IF; END;
 PERFORM set_config('qa.hq','0',true);
 BEGIN
  PERFORM public.admin_operations_inquiry_page('2026-09-01','2026-09-30');
  RAISE EXCEPTION 'UNAUTHORIZED_HQ_ACCEPTED';
 EXCEPTION WHEN others THEN IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF; END;
 PERFORM set_config('qa.store','0',true);
 BEGIN
  PERFORM public.admin_store_operations_inquiry_page(1,'2026-09-01','2026-09-30');
  RAISE EXCEPTION 'UNAUTHORIZED_STORE_ACCEPTED';
 EXCEPTION WHEN others THEN IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: 2505 demo rows, 13 pages, actual isolation and sums, auth and channel ACL';
END $$;
ROLLBACK;
