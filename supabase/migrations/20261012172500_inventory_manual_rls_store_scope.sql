-- Scope direct inventory_manual_items access to the same confirmed store authority used by admin RPCs.
-- Replaces the legacy authenticated USING(true)/WITH CHECK(true) policy.
-- Existing inventory rows are untouched.
DROP POLICY IF EXISTS inventory_manual_items_admin ON public.inventory_manual_items;
CREATE POLICY inventory_manual_items_admin ON public.inventory_manual_items
  FOR ALL TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));
