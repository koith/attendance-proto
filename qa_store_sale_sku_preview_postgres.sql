\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.stores(id bigint primary key,is_active boolean,onboarding_status text);
CREATE TABLE public.hq_products(id bigint primary key,name text,status text);
CREATE TABLE public.hq_product_transaction_links(product_id bigint,transaction_type text,alias text);
CREATE TABLE public.store_product_assignments(product_id bigint,store_id bigint,status text);
CREATE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $f$
SELECT p_store_id=nullif(current_setting('qa.current_store',true),'')::bigint;
$f$;
INSERT INTO public.stores VALUES (1,true,'READY'),(2,true,'READY'),(3,false,'STAGED');
INSERT INTO public.hq_products VALUES
 (11,'아메리카노','ACTIVE'),(12,'아메리카노 1L','ACTIVE'),
 (13,'라떼','ACTIVE'),(14,'중복 명칭 1','ACTIVE'),(15,'중복 명칭 2','ACTIVE'),
 (16,'다른 매장 메뉴','ACTIVE'),(17,'폐기상품','RETIRED');
INSERT INTO public.hq_product_transaction_links VALUES
 (11,'SALE','아메리카노'),(12,'SALE','아메리카노 1L'),(13,'SALE','카페 라떼'),
 (14,'SALE','중복메뉴'),(15,'SALE','중복메뉴'),
 (16,'SALE','다른 매장 메뉴'),(17,'SALE','폐기상품'),
 (13,'PURCHASE','우유');
INSERT INTO public.store_product_assignments VALUES
 (11,1,'ACTIVE'),(12,1,'ACTIVE'),(13,1,'ACTIVE'),
 (14,1,'ACTIVE'),(15,1,'ACTIVE'),(16,2,'ACTIVE'),(17,1,'ACTIVE'),
 (11,2,'ACTIVE'),(13,2,'PAUSED');
\ir supabase/migrations/20261018212000_store_sale_sku_preview.sql
DO $qa$
BEGIN
 IF has_function_privilege('anon','public.admin_store_sale_sku_preview(bigint,text[])','EXECUTE')
 THEN RAISE EXCEPTION 'Public unauthenticated SKU leak'; END IF;
END $qa$;
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('qa.current_store','1',true);
DO $qa$
DECLARE n integer; rows record;
BEGIN
 SELECT count(*) INTO n FROM public.admin_store_sale_sku_preview(1,
 ARRAY['아메리카노','행사 아메리카노','아메리카노 1L','행사 아메리카노 1L','아메리카노 2L',
 '중복메뉴','다른 매장 메뉴','폐기상품','카페 라떼','우유']);
 IF n<>10 THEN RAISE EXCEPTION 'Result count lost: %',n; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['아메리카노']);
 IF rows.product_id<>11 OR rows.match_status<>'EXACT' THEN RAISE EXCEPTION 'Exact match wrong'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['행사 아메리카노']);
 IF rows.product_id<>11 OR rows.match_status<>'PROMOTION' THEN RAISE EXCEPTION 'Campaign match wrong'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['아메리카노 1L']);
 IF rows.product_id<>12 OR rows.match_status<>'EXACT' THEN RAISE EXCEPTION '1L collapsed to regular SKU'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['행사 아메리카노 1L']);
 IF rows.product_id<>12 OR rows.match_status<>'PROMOTION' THEN RAISE EXCEPTION '1L campaign SKU collapsed'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['아메리카노 2L']);
 IF rows.product_id IS NOT NULL OR rows.match_status<>'UNMAPPED' THEN RAISE EXCEPTION '2L false merge'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['중복메뉴']);
 IF rows.product_id IS NOT NULL OR rows.match_status<>'AMBIGUOUS' THEN RAISE EXCEPTION 'Ambiguous SKU must be reviewed'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['다른 매장 메뉴']);
 IF rows.product_id IS NOT NULL OR rows.match_status<>'UNMAPPED' THEN RAISE EXCEPTION 'Cross-store product leaked'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['폐기상품']);
 IF rows.product_id IS NOT NULL OR rows.match_status<>'UNMAPPED' THEN RAISE EXCEPTION 'Retired product matched'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['카페 라떼']);
 IF rows.product_id<>13 THEN RAISE EXCEPTION 'Existing sale alias missing'; END IF;
 SELECT * INTO rows FROM public.admin_store_sale_sku_preview(1,ARRAY['우유']);
 IF rows.product_id IS NOT NULL THEN RAISE EXCEPTION 'Purchase alias mapped as sale'; END IF;
 BEGIN
  PERFORM public.admin_store_sale_sku_preview(2,ARRAY['아메리카노']);
  RAISE EXCEPTION 'Cross-store caller allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.admin_store_sale_sku_preview(1,ARRAY['']);
  RAISE EXCEPTION 'Blank menu allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $qa$;
RESET ROLE;
-- Explicit approved direct campaign alias supersedes fallback (may refer to a distinct SKU).
INSERT INTO public.hq_product_transaction_links VALUES (13,'SALE','행사 아메리카노');
SET ROLE authenticated;
SELECT set_config('qa.current_store','1',true);
DO $qa$
DECLARE row record;
BEGIN
 SELECT * INTO row FROM public.admin_store_sale_sku_preview(1,ARRAY['행사 아메리카노']);
 IF row.product_id<>13 OR row.match_status<>'EXACT' THEN RAISE EXCEPTION 'Approved exact campaign alias must win'; END IF;
END $qa$;
SELECT set_config('qa.current_store','3',true);
DO $qa$
BEGIN
 BEGIN
  PERFORM public.admin_store_sale_sku_preview(3,ARRAY['아메리카노']);
  RAISE EXCEPTION 'STAGED store allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $qa$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS MTG-07: approved alias, campaign priority, 1L kept, scoped unknown/ambiguous fail-closed' AS result;
