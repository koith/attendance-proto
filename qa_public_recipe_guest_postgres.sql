-- Synthetic PostgreSQL-only fixture; never touches operational Supabase.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA IF NOT EXISTS public;
CREATE TABLE public.stores(
 id bigint PRIMARY KEY, is_active boolean, onboarding_status text
);
CREATE TABLE public.recipe_source_variants(
 menu_name text, category text, thumbnail_url text
);
CREATE TABLE public.hq_products(
 id bigint, recipe_version_id bigint, product_key text, name text, status text
);
CREATE TABLE public.recipe_versions(id bigint, thumbnail_url text);
CREATE TABLE public.store_recipe_overrides(
 store_id bigint,menu_key text,menu_name text,category text,
 thumbnail_url text,instructions jsonb,components jsonb
);
CREATE FUNCTION public.recipe_thumbnail_for_source(text) RETURNS text
LANGUAGE sql AS $$ SELECT '/thumb'::text $$;
CREATE FUNCTION public.source_recipe_instructions(text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '[{"label":"기본","content":"테스트 제조법"}]'::jsonb $$;
CREATE FUNCTION public.source_recipe_components(text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '[{"item_name":"원두","quantity":18}]'::jsonb $$;
INSERT INTO public.stores VALUES
 (701,true,'READY'),(702,true,'READY'),(703,true,'STAGED'),(704,false,'READY');
INSERT INTO public.recipe_source_variants
 VALUES ('QA아메리카노','커피','');
INSERT INTO public.store_recipe_overrides
 VALUES (701,'source_'||md5('QA아메리카노'),'701점 전용 레시피',null,null,
 '[{"label":"기본","content":"701 전용"}]'::jsonb,'[]'::jsonb);
\ir supabase/migrations/20261018013000_public_ready_store_recipe_read.sql
DO $qa$
DECLARE n int; label text;
BEGIN
 IF NOT has_function_privilege('anon','public.store_recipe_list_public(bigint)','EXECUTE')
   THEN RAISE EXCEPTION 'PUBLIC_RECIPE_NOT_GRANTED'; END IF;
 IF has_function_privilege('anon','public.source_recipe_instructions(text)','EXECUTE')
  OR has_function_privilege('anon','public.source_recipe_components(text)','EXECUTE')
  OR has_function_privilege('anon','public.recipe_thumbnail_for_source(text)','EXECUTE')
   THEN RAISE EXCEPTION 'INTERNAL_HELPER_EXPOSED'; END IF;
 IF has_table_privilege('anon','public.store_recipe_overrides','UPDATE')
   THEN RAISE EXCEPTION 'PUBLIC_RECIPE_EDIT_ENABLED'; END IF;
 SELECT count(*),max(menu_name) INTO n,label FROM public.store_recipe_list_public(701);
 IF n<>1 OR label<>'701점 전용 레시피'
   THEN RAISE EXCEPTION 'READY_STORE_OVERRIDE_INCORRECT: % %',n,label; END IF;
 SELECT max(menu_name) INTO label FROM public.store_recipe_list_public(702);
 IF label<>'QA아메리카노'
   THEN RAISE EXCEPTION 'CROSS_STORE_OVERRIDE_LEAK: %',label; END IF;
 SELECT count(*) INTO n FROM public.store_recipe_list_public(703);
 IF n<>0 THEN RAISE EXCEPTION 'STAGED_STORE_RECIPE_EXPOSED'; END IF;
 SELECT count(*) INTO n FROM public.store_recipe_list_public(704);
 IF n<>0 THEN RAISE EXCEPTION 'INACTIVE_STORE_RECIPE_EXPOSED'; END IF;
 SELECT count(*) INTO n FROM public.store_recipe_list_public(999);
 IF n<>0 THEN RAISE EXCEPTION 'UNKNOWN_STORE_RECIPE_EXPOSED'; END IF;
END $qa$;
SET ROLE anon;
SELECT CASE WHEN (SELECT count(*) FROM public.store_recipe_list_public(701))=1
             AND (SELECT max(menu_name) FROM public.store_recipe_list_public(701))='701점 전용 레시피'
  THEN 'PASS anonymous READY recipe' ELSE (SELECT 1/0)::text END AS result;
SELECT CASE WHEN (SELECT count(*) FROM public.store_recipe_list_public(703))=0
  THEN 'PASS staged-store deny' ELSE (SELECT 1/0)::text END AS result;
RESET ROLE;
SELECT 'PASS anonymous read-only recipe/RLS-boundary fixture' AS result;
