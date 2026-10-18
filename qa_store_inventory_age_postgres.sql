\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.stores(id bigint primary key,is_active boolean,onboarding_status text);
CREATE TABLE public.inventory_items(id bigint primary key,name text,unit text,is_active boolean,is_demo boolean);
CREATE TABLE public.inventory_movements(
 id bigint generated always as identity primary key,
 store_id bigint,item_id bigint,business_date date,movement_type text,
 quantity numeric,is_demo boolean not null default false
);
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $fn$
 SELECT p_store_id = nullif(current_setting('test.allowed_store',true),'')::bigint;
$fn$;
INSERT INTO public.stores VALUES(1,true,'READY'),(2,true,'READY'),(3,false,'STAGED');
INSERT INTO public.inventory_items VALUES
(11,'오래된 원두','g',true,false),
(12,'최근 우유','ml',true,false),
(13,'소진 원두','g',true,false),
(14,'예시 품목','ea',true,true),
(15,'다른 매장','ea',true,false),
(16,'입고 증거 없음','ea',true,false),
(17,'재입고됨','ea',true,false),
(18,'시연 이동 있는 품목','ea',true,false);
INSERT INTO public.inventory_movements(store_id,item_id,business_date,movement_type,quantity,is_demo) VALUES
(1,11,((now() at time zone 'Asia/Seoul')::date)-100,'RECEIPT',100,false),
(1,11,((now() at time zone 'Asia/Seoul')::date)-1,'SALE',-40,false),
(1,12,((now() at time zone 'Asia/Seoul')::date)-10,'RECEIPT',100,false),
(1,13,((now() at time zone 'Asia/Seoul')::date)-100,'RECEIPT',20,false),
(1,13,((now() at time zone 'Asia/Seoul')::date)-10,'USE',-20,false),
(1,14,((now() at time zone 'Asia/Seoul')::date)-100,'RECEIPT',100,false),
(2,15,((now() at time zone 'Asia/Seoul')::date)-90,'RECEIPT',50,false),
(1,16,((now() at time zone 'Asia/Seoul')::date)-100,'COUNT',20,false),
(1,17,((now() at time zone 'Asia/Seoul')::date)-100,'RECEIPT',100,false),
(1,17,((now() at time zone 'Asia/Seoul')::date)-2,'RECEIPT',10,false),
(1,18,((now() at time zone 'Asia/Seoul')::date)-100,'RECEIPT',10,false),
(1,18,((now() at time zone 'Asia/Seoul')::date)-90,'DEMO',100,true);
\ir supabase/migrations/20261018180500_store_inventory_age_review.sql
DO $test$
BEGIN
 IF has_function_privilege('anon','public.admin_store_inventory_age_review(bigint,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'anonymous access exposed'; END IF;
END $test$;
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SET test.allowed_store='1';
DO $test$
DECLARE found_count integer; got record;
BEGIN
 SELECT COUNT(*) INTO found_count FROM public.admin_store_inventory_age_review(1,60);
 IF found_count<>1 THEN RAISE EXCEPTION 'wrong 60d review candidates: %',found_count; END IF;
 SELECT * INTO got FROM public.admin_store_inventory_age_review(1,60);
 IF got.item_id<>11 OR got.on_hand<>60 OR got.days_since_receipt<99
    OR got.last_usage_on IS NULL
 THEN RAISE EXCEPTION 'wrong review context id %, qty %, age %, usage %',
 got.item_id,got.on_hand,got.days_since_receipt,got.last_usage_on; END IF;
 SELECT COUNT(*) INTO found_count FROM public.admin_store_inventory_age_review(1,180);
 IF found_count<>0 THEN RAISE EXCEPTION 'threshold ignored'; END IF;
 BEGIN
  PERFORM public.admin_store_inventory_age_review(2,60);
  RAISE EXCEPTION 'cross-store access unexpectedly passed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.admin_store_inventory_age_review(1,0);
  RAISE EXCEPTION 'invalid days unexpectedly passed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $test$;
SET test.allowed_store='3';
DO $test$
BEGIN
 BEGIN
  PERFORM public.admin_store_inventory_age_review(3,60);
  RAISE EXCEPTION 'STAGED store unexpectedly passed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: scoped non-demo stock aging review, signed consumption, not expiry or synthetic' AS result;
