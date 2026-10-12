\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.recipe_versions(menu_name text, thumbnail_url text);
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
INSERT INTO public.recipe_versions VALUES ('테스트음료','https://example.test/photo.jpg');
CREATE FUNCTION public.recipe_thumbnail_for_source(p_menu_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$ SELECT thumbnail_url FROM public.recipe_versions WHERE menu_name=p_menu_name LIMIT 1 $fn$;
GRANT EXECUTE ON FUNCTION public.recipe_thumbnail_for_source(text) TO PUBLIC,anon,authenticated,service_role;
\ir supabase/migrations/20261012183000_restrict_recipe_thumbnail_rpc.sql
DO $test$
BEGIN
 IF has_function_privilege('anon','public.recipe_thumbnail_for_source(text)','EXECUTE')
 THEN RAISE EXCEPTION 'anon can still invoke privileged recipe thumbnail lookup'; END IF;
 IF has_function_privilege('authenticated','public.recipe_thumbnail_for_source(text)','EXECUTE')
 THEN RAISE EXCEPTION 'authenticated can still bypass protected recipe RPC'; END IF;
 IF NOT has_function_privilege('service_role','public.recipe_thumbnail_for_source(text)','EXECUTE')
 THEN RAISE EXCEPTION 'service role lost internal recipe lookup'; END IF;
END $test$;
SET ROLE service_role;
DO $test$
BEGIN
  IF public.recipe_thumbnail_for_source('테스트음료') <> 'https://example.test/photo.jpg' THEN
    RAISE EXCEPTION 'trusted invocation lost its SECURITY DEFINER access';
  END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS privileged recipe photo helper is internal-only' AS result;
