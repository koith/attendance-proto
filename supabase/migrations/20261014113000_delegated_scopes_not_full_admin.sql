-- Explicit delegated profiles confer only the three listed rights, not legacy full admin.
-- HQ, appointed owners, and unprofiled legacy managers retain their old access.
-- Three checked boxes do NOT authorize payroll-close or employee document storage.
-- This changes function definitions only and never rewrites operational data.
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
SELECT EXISTS (
 SELECT 1
 FROM public.admin_users a
 JOIN auth.users u ON u.id=a.user_id
 WHERE a.user_id=auth.uid()
   AND u.email_confirmed_at IS NOT NULL
   AND u.deleted_at IS NULL AND NOT u.is_anonymous
   AND (u.banned_until IS NULL OR u.banned_until<now())
   AND (
     a.admin_role='HQ'
     OR (
       a.admin_role='STORE_MANAGER'
       AND a.store_id=p_store_id
       AND EXISTS (
         SELECT 1 FROM public.stores s
         WHERE s.id=p_store_id AND s.is_active
           AND s.onboarding_status='READY'
       )
       AND (
         EXISTS (
           SELECT 1 FROM public.store_primary_owners o
           WHERE o.store_id=p_store_id AND o.user_id=a.user_id
         )
         OR NOT EXISTS (
           SELECT 1 FROM public.store_delegated_permissions d
           WHERE d.store_id=p_store_id AND d.user_id=a.user_id

         )
       )
     )
   )
);
$fn$;


CREATE OR REPLACE FUNCTION public.store_delegated_permissions_self()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE a record; d public.store_delegated_permissions%ROWTYPE; v_owner boolean;
BEGIN
 SELECT admin_role,store_id INTO a FROM public.admin_users WHERE user_id=auth.uid();
 IF NOT FOUND OR a.admin_role NOT IN ('HQ','STORE_MANAGER') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF a.admin_role='HQ' THEN
  RETURN jsonb_build_object('limited',false,'staff_edit',true,'attendance_approve',true,'payroll_view',true);
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=a.store_id AND user_id=auth.uid()) INTO v_owner;
 SELECT * INTO d FROM public.store_delegated_permissions WHERE store_id=a.store_id AND user_id=auth.uid();
 RETURN jsonb_build_object(
  'limited', NOT v_owner AND d.user_id IS NOT NULL,
  'staff_edit',v_owner OR coalesce(d.staff_edit,true),
  'attendance_approve',v_owner OR coalesce(d.attendance_approve,true),
  'payroll_view',v_owner OR coalesce(d.payroll_view,true),
  'store_id',a.store_id);
END $fn$;


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
)
         )
       )
     )
 );
$fn$;

