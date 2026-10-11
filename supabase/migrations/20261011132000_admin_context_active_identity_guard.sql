-- Admin context must use the same verified, non-suspended identity predicate
-- as public.is_admin(). No user, role or store records are modified.
CREATE OR REPLACE FUNCTION public.admin_context()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
 SELECT CASE WHEN public.is_admin() THEN
   COALESCE(
     (SELECT jsonb_build_object('role',a.admin_role,'store_id',a.store_id,'email',a.email)
      FROM public.admin_users a
      WHERE a.user_id=(SELECT auth.uid())
      LIMIT 1),
     jsonb_build_object('role',null,'store_id',null,'email',null)
   )
 ELSE jsonb_build_object('role',null,'store_id',null,'email',null)
 END
$function$;
