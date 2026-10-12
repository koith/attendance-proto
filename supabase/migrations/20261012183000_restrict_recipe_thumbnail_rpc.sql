-- This helper is an internal SECURITY DEFINER function used by the PIN-protected
-- staff_recipe_list RPC. Exposing its privileged lookup directly to anon or any
-- generic logged-in account bypasses the staff recipe authorization boundary.
-- Keep owner/service_role execution intact for trusted internal calls.
REVOKE ALL ON FUNCTION public.recipe_thumbnail_for_source(text)
  FROM PUBLIC, anon, authenticated;
