-- Disposable PostgreSQL only: execute the shipped function, with synthetic rows.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE FUNCTION public.can_manage_store(p_store_id bigint) RETURNS boolean LANGUAGE sql STABLE
 AS $$ SELECT p_store_id=nullif(current_setting('qa.store',true),'')::bigint $$;
CREATE TABLE public.inventory_items(id bigint PRIMARY KEY,sku text,name text,unit text,is_active boolean,
 reorder_level numeric,category text,source_unit_system text,source_minimum_text text,
 source_current_text text,source_order_text text,source_note text,stock_unit text,order_unit text,
 conversion_quantity numeric,is_demo boolean);
CREATE TABLE public.inventory_movements(id bigint PRIMARY KEY,item_id bigint,quantity numeric,
 unit_cost bigint,is_demo boolean,store_id bigint,business_date date);
CREATE TABLE public.store_inventory_unit_configs(store_id bigint,item_id bigint,
 stock_unit text,order_unit text,conversion_quantity numeric);
INSERT INTO public.inventory_items(id,sku,name,unit,is_active,reorder_level,is_demo)
 SELECT i,'QA'||i,'ingredient'||i,'g',true,2,false FROM generate_series(1,8)i;
INSERT INTO public.inventory_movements VALUES
 (1,1,10,NULL,false,701,current_date),
 (2,2,10,100,false,701,current_date),
 (3,2,-2,100,false,701,current_date), -- priced return/waste preserves signed ledger
 (4,3,10,0,false,701,current_date), -- explicitly zero-priced goods are known
 (5,4,10,100,false,701,current_date),
 (6,4,-1,NULL,false,701,current_date), -- unpriced outgoing movement invalidates value
 (7,5,10,100,false,702,current_date), -- foreign branch cannot supply missing value
 (8,5,10,100,true,701,current_date), -- neither can demo rows
 (9,5,10,100,false,701,current_date+2), -- future receipts cannot supply today's value
 (10,6,-1,100,false,701,current_date), -- negative balance is not a valid asset value
 (11,7,0,NULL,false,701,current_date), -- explicit no-op is zero, not unknown price exposure
 (12,8,'NaN',100,false,701,current_date);
CREATE TEMP TABLE qa_before AS SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) AS hash FROM public.inventory_movements m;
\i supabase/migrations/20261023023009_qa1243_inventory_valuation_fail_closed.sql
SELECT set_config('qa.store','701',false);
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT * FROM public.admin_store_inventory_overview_v3(701) LOOP
  CASE r.id
   WHEN 1 THEN IF r.inventory_value IS NOT NULL OR r.on_hand<>10 THEN RAISE EXCEPTION 'UNKNOWN_PRICE_IS_NOT_ZERO'; END IF;
   WHEN 2 THEN IF r.inventory_value<>800 OR r.on_hand<>8 THEN RAISE EXCEPTION 'SIGNED_RETURN_VALUE'; END IF;
   WHEN 3 THEN IF r.inventory_value<>0 OR r.on_hand<>10 THEN RAISE EXCEPTION 'EXPLICIT_FREE_GOODS'; END IF;
   WHEN 4 THEN IF r.inventory_value IS NOT NULL OR r.on_hand<>9 THEN RAISE EXCEPTION 'PARTIAL_PRICE'; END IF;
   WHEN 5 THEN IF r.inventory_value IS NOT NULL OR r.on_hand IS NOT NULL OR r.low_stock IS NOT NULL THEN RAISE EXCEPTION 'SCOPE_DEMO_FUTURE'; END IF;
   WHEN 6 THEN IF r.inventory_value IS NOT NULL OR r.on_hand<>-1 THEN RAISE EXCEPTION 'NEGATIVE_ASSET'; END IF;
   WHEN 7 THEN IF r.inventory_value<>0 OR r.on_hand<>0 THEN RAISE EXCEPTION 'EXPLICIT_ZERO_MOVEMENT'; END IF;
   WHEN 8 THEN IF r.inventory_value IS NOT NULL OR r.on_hand IS NOT NULL OR r.low_stock IS NOT NULL THEN RAISE EXCEPTION 'NON_FINITE_QUANTITY'; END IF;
  END CASE;
 END LOOP;
 IF (SELECT count(*) FROM public.admin_store_inventory_overview_v3(701))<>8 THEN RAISE EXCEPTION 'ROW_COUNT'; END IF;
 IF (SELECT hash FROM qa_before) IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(m)::text,'' ORDER BY id)) FROM public.inventory_movements m) THEN RAISE EXCEPTION 'READ_CHANGED_LEDGER'; END IF;
 IF has_function_privilege('anon','public.admin_store_inventory_overview_v3(bigint)','EXECUTE') THEN RAISE EXCEPTION 'ANON_EXECUTE'; END IF;
 BEGIN
  PERFORM public.admin_store_inventory_overview_v3(702);
  RAISE EXCEPTION 'CROSS_STORE_BYPASS';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF;
 END;
END $$;
\echo PASS actual inventory valuation: unknown/zero/partial/signed/negative/nonfinite/foreign/demo/future and read-only ledger
