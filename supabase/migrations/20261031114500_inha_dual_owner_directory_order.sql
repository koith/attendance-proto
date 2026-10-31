-- Fix UNION ordering for HQ+Inha owner manager listing.
CREATE OR REPLACE FUNCTION public.hq_store_manager_list()
RETURNS TABLE(user_id uuid,email text,store_id bigint,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT a.user_id,a.email,a.store_id,s.name
 FROM public.admin_users a JOIN public.stores s ON s.id=a.store_id
 WHERE a.admin_role='STORE_MANAGER'
 UNION ALL
 SELECT a.user_id,u.email,o.store_id,s.name
 FROM public.store_primary_owners o
 JOIN public.store_admin_memberships m ON m.store_id=o.store_id
   AND m.user_id=o.user_id AND m.role='OWNER'
 JOIN public.admin_users a ON a.user_id=o.user_id AND a.admin_role='HQ'
   AND a.store_id IS NULL
 JOIN auth.users u ON u.id=a.user_id
 JOIN public.stores s ON s.id=o.store_id
 WHERE o.store_id=1 AND u.email_confirmed_at IS NOT NULL
 AND u.deleted_at IS NULL AND NOT u.is_anonymous
 ORDER BY 4,2;
END $function$;