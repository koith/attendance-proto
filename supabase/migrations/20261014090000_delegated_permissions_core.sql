-- Fail-closed delegated permission registry. Ordinary managers remain full until a primary owner explicitly limits them.
CREATE TABLE IF NOT EXISTS public.store_delegated_permissions(
 store_id bigint NOT NULL REFERENCES public.stores(id),
 user_id uuid NOT NULL REFERENCES public.admin_users(user_id) ON DELETE CASCADE,
 staff_edit boolean NOT NULL DEFAULT true,
 attendance_approve boolean NOT NULL DEFAULT true,
 payroll_view boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,user_id)
);
ALTER TABLE public.store_delegated_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_delegated_permissions FROM PUBLIC,anon,authenticated;

-- Any partial grant loses blanket administrator access. This prevents bypassing
-- granular permissions by directly calling old RPCs with a valid admin JWT.
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
             AND NOT (d.staff_edit AND d.attendance_approve AND d.payroll_view)
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
  'limited', NOT v_owner AND NOT(coalesce(d.staff_edit,true) AND coalesce(d.attendance_approve,true) AND coalesce(d.payroll_view,true)),
  'staff_edit',v_owner OR coalesce(d.staff_edit,true),
  'attendance_approve',v_owner OR coalesce(d.attendance_approve,true),
  'payroll_view',v_owner OR coalesce(d.payroll_view,true),
  'store_id',a.store_id);
END $fn$;

REVOKE ALL ON FUNCTION public.store_delegated_permissions_self() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_delegated_permissions_self() TO authenticated;
