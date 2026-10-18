-- MTG-07 #1107: manager-only, read-only verified sale-menu alias / branch SKU preview.
-- Uses existing approved HQ product/alias registry and ACTIVE store assignments.
-- Never alters original recipes, SKU quantities, inventory or POS transactions.
CREATE OR REPLACE FUNCTION public.admin_store_sale_sku_preview(
  p_store_id bigint,p_sale_names text[]
)
RETURNS TABLE(input_index integer,sale_name text,match_status text,
              product_id bigint,product_name text,matched_alias text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN
   RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.stores s
   WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY'
 ) THEN RAISE EXCEPTION 'STORE_NOT_READY' USING ERRCODE='42501';
 END IF;
 IF p_sale_names IS NULL OR cardinality(p_sale_names) NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT 1 FROM unnest(p_sale_names) n
       WHERE n IS NULL OR btrim(n)='' OR length(n)>120) THEN
   RAISE EXCEPTION 'INVALID_MENU_NAMES' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 WITH inputs AS (
   SELECT u.ord::integer AS ix,u.name::text AS original,
      regexp_replace(lower(btrim(u.name)),'[[:space:]]+',' ','g') AS normalized
   FROM unnest(p_sale_names) WITH ORDINALITY AS u(name,ord)
 ), prepared AS (
   SELECT i.ix,i.original,i.normalized,
     CASE WHEN i.normalized LIKE '행사 %'
          THEN substr(i.normalized,4)
          WHEN right(i.normalized,3)=' 행사'
          THEN left(i.normalized,length(i.normalized)-3)
          ELSE NULL END AS promo_base
   FROM inputs i
 ), candidates AS (
   SELECT p.ix,h.id AS pid,h.name AS pname,l.alias AS alias,
      CASE
       WHEN regexp_replace(lower(btrim(l.alias)),'[[:space:]]+',' ','g')=p.normalized THEN 0
       WHEN p.promo_base IS NOT NULL AND
         regexp_replace(lower(btrim(l.alias)),'[[:space:]]+',' ','g')=p.promo_base THEN 1
       ELSE 9 END AS priority
   FROM prepared p
   JOIN public.hq_product_transaction_links l ON l.transaction_type='SALE'
   JOIN public.hq_products h ON h.id=l.product_id AND h.status='ACTIVE'
   JOIN public.store_product_assignments spa ON spa.product_id=h.id
      AND spa.store_id=p_store_id AND spa.status='ACTIVE'
 ), best AS (
   SELECT c.*,min(c.priority) OVER (PARTITION BY c.ix) AS best_priority
   FROM candidates c WHERE c.priority<9
 ), resolved AS (
   SELECT b.ix,min(b.priority) AS tier,
     count(DISTINCT b.pid)::integer AS n_products,
     max(b.pid) AS sole_id,max(b.pname) AS sole_name,max(b.alias) AS sole_alias
   FROM best b WHERE b.priority=b.best_priority GROUP BY b.ix
 )
 SELECT p.ix,p.original,
   CASE WHEN r.ix IS NULL THEN 'UNMAPPED'
        WHEN r.n_products<>1 THEN 'AMBIGUOUS'
        WHEN r.tier=0 THEN 'EXACT'
        ELSE 'PROMOTION' END,
   CASE WHEN r.n_products=1 THEN r.sole_id ELSE NULL END,
   CASE WHEN r.n_products=1 THEN r.sole_name ELSE NULL END,
   CASE WHEN r.n_products=1 THEN r.sole_alias ELSE NULL END
 FROM prepared p LEFT JOIN resolved r ON r.ix=p.ix
 ORDER BY p.ix;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_store_sale_sku_preview(bigint,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_sale_sku_preview(bigint,text[]) TO authenticated;
