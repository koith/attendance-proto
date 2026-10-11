-- Recipe instructions must not be retrievable without a verified employee PIN
-- and an active shift or scoped management account.
-- Staff use staff_recipe_list; managers use admin_store_recipe_list.
REVOKE ALL ON FUNCTION public.store_recipe_list_public(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_recipe_list_public(bigint) TO service_role;
