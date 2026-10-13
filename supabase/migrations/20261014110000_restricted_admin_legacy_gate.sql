-- Restrict legacy administrator policies for explicitly scoped managers.
-- In particular storage.objects/employee-docs uses public.is_admin() directly:
-- a scoped employee-name editor must not acquire unlimited HR document access.
-- The login/context RPC remains independently available to every confirmed
-- current administrator so limited managers can reach their scoped portal.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $fn$
 SELECT EXISTS (
   SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
   WHERE a.user_id=auth.uid()
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
     AND (
       a.admin_role='HQ'
       OR (
         a.admin_role='STORE_MANAGER'
         AND EXISTS(SELECT 1 FROM public.stores s WHERE s.id=a.store_id
           AND s.is_active AND s.onboarding_status='READY')
         AND (
           EXISTS(SELECT 1 FROM public.store_primary_owners o
             WHERE o.store_id=a.store_id AND o.user_id=a.user_id)
           OR NOT EXISTS(SELECT 1 FROM public.store_delegated_permissions d
             WHERE d.store_id=a.store_id AND d.user_id=a.user_id
               AND NOT(d.staff_edit AND d.attendance_approve AND d.payroll_view))
         )
       )
     )
 );
$fn$;

CREATE OR REPLACE FUNCTION public.admin_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $fn$
 SELECT COALESCE(
   (SELECT jsonb_build_object('role',a.admin_role,'store_id',a.store_id,'email',a.email)
    FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=auth.uid()
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
    LIMIT 1),
   jsonb_build_object('role',NULL,'store_id',NULL,'email',NULL)
 );
$fn$;

-- Preserve existing API exposure; never expand anonymous privileges.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_admin(),public.admin_context() TO authenticated,service_role;
