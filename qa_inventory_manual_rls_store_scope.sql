\\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE authenticated;
CREATE TABLE public.inventory_manual_items (
  id bigint PRIMARY KEY,
  store_id bigint NOT NULL,
  name text NOT NULL
);
ALTER TABLE public.inventory_manual_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.inventory_manual_items TO authenticated;
CREATE FUNCTION public.can_manage_store(p_store_id bigint) RETURNS boolean
  LANGUAGE sql STABLE AS $fn$
    SELECT p_store_id = nullif(current_setting('test.allowed_store',true),'')::bigint
  $fn$;
-- Simulate legacy dangerously open policy before executing the real migration.
CREATE POLICY inventory_manual_items_admin ON public.inventory_manual_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.inventory_manual_items VALUES (1,1,'own'),(2,2,'other');
\\ir supabase/migrations/20261012172500_inventory_manual_rls_store_scope.sql
SET ROLE authenticated;
SET test.allowed_store TO '1';
DO $test$
DECLARE total int; changed int; blocked boolean:=false;
BEGIN
 SELECT count(*) INTO total FROM public.inventory_manual_items;
 IF total<>1 THEN RAISE EXCEPTION 'cross-store read was not denied: %',total; END IF;
 UPDATE public.inventory_manual_items SET name='own-updated' WHERE id=1;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'own store update failed'; END IF;
 UPDATE public.inventory_manual_items SET name='unauthorized' WHERE id=2;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'cross-store update succeeded'; END IF;
 DELETE FROM public.inventory_manual_items WHERE id=2;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'cross-store delete succeeded'; END IF;
 BEGIN
  INSERT INTO public.inventory_manual_items VALUES (3,2,'unauthorized');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'cross-store INSERT was allowed'; END IF;
 blocked:=false;
 BEGIN
  UPDATE public.inventory_manual_items SET store_id=2 WHERE id=1;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'cross-store reassignment was allowed'; END IF;
END $test$;
SET test.allowed_store TO '2';
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.inventory_manual_items)<>1 THEN
   RAISE EXCEPTION 'second store denied its own rows or saw other rows';
 END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS inventory_manual_items scoped read/insert/update/delete/reassignment' AS result;
