-- Defense in depth: source recipe helpers must not be callable directly by
-- anonymous/authenticated Data API roles, even if RLS policies later change.
-- Authenticated manager/staff SECURITY DEFINER RPCs retain access through the
-- database function owner. This does not mutate any recipe or employee data.
REVOKE ALL ON FUNCTION public.source_recipe_instructions(text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.source_recipe_components(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.source_recipe_instructions(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.source_recipe_components(text) TO service_role;
