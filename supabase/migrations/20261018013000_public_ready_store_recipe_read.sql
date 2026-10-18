-- #1038: Restore the 2026-09-28 confirmed public VIEW-only recipe behavior.
-- This narrowly scoped RPC returns recipe data only for active READY stores.
-- It does not expose employee, payroll, accounts, or mutable recipe endpoints.
-- Source and photo helpers remain non-executable to untrusted roles directly.
CREATE OR REPLACE FUNCTION public.store_recipe_list_public(p_store_id bigint)
RETURNS TABLE(
  product_id bigint,recipe_version_id bigint,menu_key text,
  menu_name text,category text,thumbnail_url text,
  instructions jsonb,components jsonb,
  assignment_status text,retirement_requested_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $recipe$
WITH requested_store AS (
  SELECT s.id FROM public.stores s
  WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY'
), src AS (
  SELECT v.menu_name, min(v.category) category,
         max(nullif(v.thumbnail_url,'')) thumbnail_url
  FROM public.recipe_source_variants v
  WHERE v.category<>'토핑' AND EXISTS (SELECT 1 FROM requested_store)
  GROUP BY v.menu_name
), base AS (
  SELECT hp.id product_id,hp.recipe_version_id,
         coalesce(hp.product_key,'source_'||md5(s.menu_name)) menu_key,
         s.menu_name,s.category,
         coalesce(s.thumbnail_url,rv.thumbnail_url,
                  public.recipe_thumbnail_for_source(s.menu_name)) thumbnail_url,
         public.source_recipe_instructions(s.menu_name) instructions,
         public.source_recipe_components(s.menu_name) components
  FROM src s
  LEFT JOIN LATERAL (
    SELECT p.* FROM public.hq_products p
    WHERE p.status='ACTIVE'
      AND regexp_replace(lower(p.name),'[^0-9a-z가-힣]','','g')
        =regexp_replace(lower(s.menu_name),'[^0-9a-z가-힣]','','g')
    ORDER BY p.id LIMIT 1
  ) hp ON true
  LEFT JOIN public.recipe_versions rv ON rv.id=hp.recipe_version_id
)
SELECT b.product_id,b.recipe_version_id,b.menu_key,
       coalesce(nullif(o.menu_name,''),b.menu_name),
       coalesce(nullif(o.category,''),b.category),
       coalesce(nullif(o.thumbnail_url,''),b.thumbnail_url),
       coalesce(o.instructions,b.instructions),
       CASE WHEN o.store_id IS NULL THEN b.components ELSE o.components END,
       'ACTIVE'::text,NULL::timestamptz
FROM base b
LEFT JOIN public.store_recipe_overrides o
  ON o.store_id=p_store_id AND o.menu_key=b.menu_key
ORDER BY coalesce(nullif(o.category,''),b.category),
         coalesce(nullif(o.menu_name,''),b.menu_name);
$recipe$;
REVOKE ALL ON FUNCTION public.store_recipe_list_public(bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_recipe_list_public(bigint)
  TO anon,authenticated,service_role;
-- No direct access to internal recipe, edit, staff, or thumbnail functions.
REVOKE ALL ON FUNCTION public.source_recipe_instructions(text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.source_recipe_components(text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recipe_thumbnail_for_source(text)
  FROM PUBLIC,anon,authenticated;
