-- Cover the foreign keys introduced by v220 and make the demo archive
-- idempotent/queryable without full scans.
create index if not exists admin_users_store_id_idx
  on public.admin_users(store_id);
create index if not exists inventory_manual_items_source_item_id_idx
  on public.inventory_manual_items(source_item_id);
create index if not exists store_notifications_product_id_idx
  on public.store_notifications(product_id);

alter table public.recipe_versions_demo_archive
  add constraint recipe_versions_demo_archive_pkey primary key(id);
alter table public.recipe_components_demo_archive
  add constraint recipe_components_demo_archive_pkey
  primary key(recipe_version_id,item_id);


-- Field-test contract guard (2026-09-27): list_store_employees returns declared types.
CREATE OR REPLACE FUNCTION public.list_store_employees(p_store_id bigint)
RETURNS TABLE(id bigint,name text,employee_no integer,is_active boolean,wage numeric,juhyu_hours numeric,juhyu_round text,tax_rate numeric,memo text,store_id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT e.id,e.name,e.employee_no,e.is_active,e.wage::numeric,e.juhyu_hours,e.juhyu_round::text,e.tax_rate,e.memo,e.store_id
 FROM public.employees e WHERE e.store_id=p_store_id ORDER BY e.is_active DESC,e.name;
END $function$;

CREATE OR REPLACE FUNCTION public.qa_rpc_contract_health()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
WITH x AS (
 SELECT
  (SELECT count(*) FROM public.recipe_versions r WHERE r.effective_to IS NULL AND NOT r.is_demo) active_recipes,
  (SELECT count(*) FROM public.recipe_versions r WHERE r.effective_to IS NULL AND NOT r.is_demo AND NOT EXISTS(SELECT 1 FROM public.recipe_components c WHERE c.recipe_version_id=r.id)) recipes_without_components,
  (SELECT count(*) FROM public.inventory_items i WHERE i.is_active AND NOT i.is_demo) real_inventory_items,
  (SELECT count(*) FROM public.hq_products p WHERE p.status='ACTIVE' AND p.recipe_version_id IS NULL) products_without_recipe
)
SELECT jsonb_build_object('ok',recipes_without_components=0 AND products_without_recipe=0,'active_recipes',active_recipes,'recipes_without_components',recipes_without_components,'real_inventory_items',real_inventory_items,'products_without_recipe',products_without_recipe) FROM x
$$;
REVOKE ALL ON FUNCTION public.qa_rpc_contract_health() FROM public,anon,authenticated;
