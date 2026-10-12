\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.employees(id bigint PRIMARY KEY,name text,store_id bigint,is_active boolean);
CREATE TABLE public.attendance_events(id bigint PRIMARY KEY,employee_id bigint,event_type text);
CREATE TABLE public.payroll_snapshot(id bigint PRIMARY KEY,pay_amount numeric);
CREATE TABLE public.recipe_thumbnail_cache(id bigint PRIMARY KEY,public_url text);
CREATE TABLE public.inventory_manual_items(id bigint PRIMARY KEY,store_id bigint,name text);
CREATE TABLE public.stores(id bigint PRIMARY KEY,name text);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_thumbnail_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_manual_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_thumbnail_cache_read ON public.recipe_thumbnail_cache
 FOR SELECT TO PUBLIC USING(true);
CREATE FUNCTION public.can_manage_store(p_id bigint)
 RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT p_id=nullif(current_setting('test.allowed_store',true),'')::bigint
 $f$;
CREATE POLICY inventory_manual_items_admin ON public.inventory_manual_items
 FOR ALL TO authenticated
 USING(public.can_manage_store(store_id))
 WITH CHECK(public.can_manage_store(store_id));
CREATE POLICY stores_admin_read ON public.stores
 FOR SELECT TO authenticated USING(false);
GRANT ALL ON public.employees,public.attendance_events,public.payroll_snapshot,
 public.recipe_thumbnail_cache,public.inventory_manual_items,public.stores
 TO anon,authenticated,service_role;
INSERT INTO public.employees VALUES (1,'fixture',1,true),(2,'fixture-other',2,true);
INSERT INTO public.attendance_events VALUES(1,1,'IN');
INSERT INTO public.payroll_snapshot VALUES(1,5500000);
INSERT INTO public.recipe_thumbnail_cache VALUES(1,'https://example.invalid/public-thumb');
INSERT INTO public.inventory_manual_items VALUES (1,1,'own'),(2,2,'other');
INSERT INTO public.stores VALUES (1,'staged'),(2,'other');
-- The staff POS's existing SECURITY DEFINER read remains functional even when
-- the anonymous role has no direct table DML privilege.
CREATE FUNCTION public.synthetic_pos_roster_count()
 RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path TO public,pg_temp
 AS $f$ SELECT count(*) FROM public.employees $f$;
GRANT EXECUTE ON FUNCTION public.synthetic_pos_roster_count() TO anon;

\ir supabase/migrations/20261013200000_security_invoker_write_acl.sql

DO $t$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY[
  'employees','attendance_events','payroll_snapshot','recipe_thumbnail_cache','stores'
 ] LOOP
  IF has_table_privilege('anon','public.'||v_table,'INSERT')
   OR has_table_privilege('anon','public.'||v_table,'UPDATE')
   OR has_table_privilege('anon','public.'||v_table,'DELETE')
   OR has_table_privilege('authenticated','public.'||v_table,'INSERT')
   OR has_table_privilege('authenticated','public.'||v_table,'UPDATE')
   OR has_table_privilege('authenticated','public.'||v_table,'DELETE')
   THEN RAISE EXCEPTION 'unauthorized direct DML still granted to %',v_table;
  END IF;
  IF NOT has_table_privilege('service_role','public.'||v_table,'INSERT')
    OR NOT has_table_privilege('service_role','public.'||v_table,'SELECT')
  THEN RAISE EXCEPTION 'trusted service_role lost required grant on %',v_table; END IF;
 END LOOP;
 IF has_table_privilege('anon','public.inventory_manual_items','UPDATE')
 THEN RAISE EXCEPTION 'anonymous inventory edit must be blocked by policy / grants'; END IF;
 IF NOT has_table_privilege('authenticated','public.inventory_manual_items','UPDATE')
 THEN RAISE EXCEPTION 'existing authorized store inventory edit grant removed'; END IF;
 IF NOT has_table_privilege('anon','public.recipe_thumbnail_cache','SELECT')
 THEN RAISE EXCEPTION 'public recipe photo cache was broken'; END IF;
END $t$;

SET ROLE anon;
DO $t$
BEGIN
 IF (SELECT count(*) FROM public.employees)<>0 THEN RAISE EXCEPTION 'anon saw employees'; END IF;
 IF (SELECT count(*) FROM public.payroll_snapshot)<>0 THEN RAISE EXCEPTION 'anon saw payroll'; END IF;
 IF (SELECT count(*) FROM public.recipe_thumbnail_cache)<>1 THEN
  RAISE EXCEPTION 'intended public recipe thumbnail read broke'; END IF;
 IF public.synthetic_pos_roster_count()<>2 THEN
  RAISE EXCEPTION 'original privileged POS RPC lost business data access'; END IF;
END $t$;
RESET ROLE;

SET ROLE authenticated;
SET test.allowed_store TO '1';
DO $t$
DECLARE v_n integer;
BEGIN
 SELECT count(*) INTO v_n FROM public.inventory_manual_items;
 IF v_n<>1 THEN RAISE EXCEPTION 'store scoped inventory view broke'; END IF;
 UPDATE public.inventory_manual_items SET name='still allowed' WHERE id=1;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>1 THEN RAISE EXCEPTION 'store owner lost authorized direct edit'; END IF;
 UPDATE public.inventory_manual_items SET name='cross-store' WHERE id=2;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>0 THEN RAISE EXCEPTION 'cross-store direct edit remained allowed'; END IF;
END $t$;
RESET ROLE;
-- Idempotence (migration SQL may be audited twice on same environment)
\ir supabase/migrations/20261013200000_security_invoker_write_acl.sql
ROLLBACK;
SELECT 'PASS SEC-01: 5 protected tables direct write denied, store-owned inventory preserved, POS RPC and service_role intact' AS result;
