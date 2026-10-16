-- Fix #914: HQ-only, read-only eligibility check for primary owner appointment.
-- An invited store manager is not necessarily a confirmed account or a primary owner.
-- Do not grant elevated roles or modify existing manager/owner records here.
CREATE OR REPLACE FUNCTION public.hq_store_manager_eligibility_list()
RETURNS TABLE(user_id uuid, store_id bigint, email_confirmed boolean, eligible boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  RETURN QUERY
    SELECT a.user_id, a.store_id,
      (u.email_confirmed_at IS NOT NULL),
      (u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
         AND (u.banned_until IS NULL OR u.banned_until < now()))
    FROM public.admin_users a
    JOIN auth.users u ON u.id=a.user_id
    WHERE a.admin_role='STORE_MANAGER';
END
$fn$;
REVOKE ALL ON FUNCTION public.hq_store_manager_eligibility_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_store_manager_eligibility_list() TO authenticated;
