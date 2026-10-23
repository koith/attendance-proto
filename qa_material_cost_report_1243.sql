\set ON_ERROR_STOP on
\i qa_inventory_valuation_1243.sql
CREATE TABLE public.store_inventory_stocktakes(id bigint PRIMARY KEY,store_id bigint,status text,counted_on date,posted_at timestamptz);
CREATE TABLE public.store_inventory_stocktake_lines(stocktake_id bigint,item_id bigint,counted_quantity numeric,PRIMARY KEY(stocktake_id,item_id));
CREATE TABLE public.operations_transactions(store_id bigint,business_date date,is_demo boolean,transaction_type text,status text,total_amount bigint);
CREATE TABLE public.operations_import_batches(store_id bigint,created_at timestamptz);
\i supabase/migrations/20261023024132_qa1243_verified_material_cost_report.sql
UPDATE public.inventory_items SET is_active=false WHERE id<>2;
DELETE FROM public.inventory_movements; -- disposable fixture only
INSERT INTO public.inventory_movements VALUES
 (1,2,10,100,false,701,'2026-09-30'),
 (2,2,5,120,false,701,'2026-10-01'),
 (3,2,-1,100,false,701,'2026-10-02'),
 (4,2,-3,100,false,701,'2026-10-03'),
 (5,2,-1,100,false,701,'2026-10-04'),
 (6,2,-1,100,false,701,'2026-10-05'),
 (7,2,99,100,false,702,'2026-10-05'),
 (8,2,99,100,true,701,'2026-10-05'),
 (9,2,99,100,false,701,'2026-10-21');
ALTER TABLE public.inventory_movements ADD COLUMN movement_type text;
UPDATE public.inventory_movements SET movement_type=CASE id WHEN 2 THEN 'RECEIPT' WHEN 3 THEN 'RETURN' WHEN 4 THEN 'USAGE' WHEN 5 THEN 'WASTE' WHEN 6 THEN 'SERVICE' ELSE 'OPENING' END;
INSERT INTO public.store_inventory_stocktakes VALUES
 (1,701,'POSTED','2026-09-30',now()),(2,701,'POSTED','2026-10-20',now());
INSERT INTO public.store_inventory_stocktake_lines VALUES(1,2,10),(2,2,9);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.admin_store_material_cost_report(701,'2026-10-01','2026-10-20');
 IF r->>'status'<>'VERIFIED' OR (r->>'material_cost')::numeric<>500
 OR (r->>'opening')::numeric<>1000 OR (r->>'closing')::numeric<>1000
 OR (r->>'receipts')::numeric<>600 OR (r->>'returns')::numeric<>100
 OR (r->>'waste')::numeric<>100 OR (r->>'service')::numeric<>100 THEN
 RAISE EXCEPTION 'INDEPENDENT_COST_EQUATION_FAILED %',r;END IF;
 UPDATE public.inventory_movements SET unit_cost=NULL WHERE id=4;
 IF public.admin_store_material_cost_report(701,'2026-10-01','2026-10-20')->>'status'<>'INCOMPLETE_VALUATION' THEN RAISE EXCEPTION 'UNKNOWN_PRICE_ACCEPTED'; END IF;
 UPDATE public.inventory_movements SET unit_cost=100 WHERE id=4;
 UPDATE public.store_inventory_stocktake_lines SET counted_quantity=8 WHERE stocktake_id=2;
 IF public.admin_store_material_cost_report(701,'2026-10-01','2026-10-20')->>'status'<>'INCOMPLETE_VALUATION' THEN RAISE EXCEPTION 'COUNT_MISMATCH_ACCEPTED'; END IF;
 UPDATE public.store_inventory_stocktakes SET status='DRAFT' WHERE id=2;
 IF public.admin_store_material_cost_report(701,'2026-10-01','2026-10-20')->>'status'<>'FINAL_COUNTS_REQUIRED' THEN RAISE EXCEPTION 'UNFINALIZED_COUNT'; END IF;
 IF public.admin_store_material_cost_report(701,current_date-1,current_date+1)->>'status'<>'PERIOD_NOT_CLOSED' THEN RAISE EXCEPTION 'FUTURE_COST'; END IF;
 BEGIN PERFORM public.admin_store_material_cost_report(702,'2026-10-01','2026-10-20');RAISE EXCEPTION 'FOREIGN_COST';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.admin_store_material_cost_report(bigint,date,date)','EXECUTE') THEN RAISE EXCEPTION 'ANON_COST';END IF;
END $$;
\echo PASS actual cost: opening + receipts - returns - closing = usage, waste/service separate, missing/foreign/demo/future/draft guards
