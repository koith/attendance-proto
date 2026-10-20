-- #1243 — explicit HQ reconnect of a *verified existing* Auth login.
-- No onboarding data is written by this migration. Function executes only when
-- an HQ operator confirms the intended store and role in the dashboard.
-- A previously registered email is NOT re-invited using Supabase Auth inviteUserByEmail.
-- This action sends no mail, resets no password, and never touches HQ accounts.
CREATE OR REPLACE FUNCTION public.hq_store_existing_verified_account_connect(
 p_email text,p_store_id bigint,p_intended_role text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $fn$
DECLARE
 v_email text;v_user uuid;v_role text;v_assigned_store bigint;
 v_status text;v_active boolean;v_owner uuid;v_pending uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_hq_admin()
 THEN RAISE EXCEPTION 'HQ_ONLY'; END IF;
 IF p_intended_role NOT IN ('OWNER','ASSISTANT')
 THEN RAISE EXCEPTION 'INVALID_MANAGER_ROLE'; END IF;
 v_email:=lower(btrim(coalesce(p_email,'')));
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR length(v_email)>254 OR p_store_id IS NULL
 THEN RAISE EXCEPTION 'INVALID_CONNECTION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT s.onboarding_status,s.is_active INTO v_status,v_active
 FROM public.stores s WHERE s.id=p_store_id FOR UPDATE;
 IF NOT FOUND OR v_status='SUSPENDED' THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
 SELECT u.id INTO v_user FROM auth.users u
 WHERE lower(btrim(u.email))=v_email
   AND u.email_confirmed_at IS NOT NULL
   AND coalesce(length(u.encrypted_password),0)>0
   AND u.deleted_at IS NULL AND NOT u.is_anonymous
   AND (u.banned_until IS NULL OR u.banned_until<now());
 IF v_user IS NULL THEN RAISE EXCEPTION 'VERIFIED_PASSWORD_ACCOUNT_REQUIRED'; END IF;
 SELECT a.admin_role,a.store_id INTO v_role,v_assigned_store
 FROM public.admin_users a WHERE a.user_id=v_user FOR UPDATE;
 IF v_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
 IF v_role IS NOT NULL AND
    (v_role<>'STORE_MANAGER' OR v_assigned_store IS DISTINCT FROM p_store_id)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 SELECT o.user_id INTO v_owner FROM public.store_primary_owners o
 WHERE o.store_id=p_store_id FOR UPDATE;
 SELECT i.user_id INTO v_pending FROM public.store_primary_owner_invitation_intents i
 WHERE i.store_id=p_store_id FOR UPDATE;
 IF p_intended_role='OWNER' THEN
   IF v_owner IS NOT NULL AND v_owner<>v_user
   THEN RAISE EXCEPTION 'PRIMARY_OWNER_ALREADY_ASSIGNED'; END IF;
   IF v_pending IS NOT NULL AND v_pending<>v_user
   THEN RAISE EXCEPTION 'PENDING_OWNER_INVITE_EXISTS'; END IF;
 ELSE
   IF v_status<>'READY' OR NOT v_active
   THEN RAISE EXCEPTION 'STORE_NOT_READY'; END IF;
   IF v_owner IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
      WHERE a.user_id=v_owner AND a.store_id=p_store_id AND a.admin_role='STORE_MANAGER'
        AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
        AND (u.banned_until IS NULL OR u.banned_until<now())
   ) THEN RAISE EXCEPTION 'ACTIVE_PRIMARY_OWNER_REQUIRED'; END IF;
   IF v_owner=v_user OR v_pending=v_user OR EXISTS (
      SELECT 1 FROM public.store_primary_owners WHERE user_id=v_user
   ) OR EXISTS (
      SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE user_id=v_user
   ) THEN RAISE EXCEPTION 'CANNOT_DEMOTE_OWNER'; END IF;
 END IF;
 IF v_role IS NULL THEN
   INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
   VALUES(v_user,v_email,'HQ verified existing-account connection','STORE_MANAGER',p_store_id);
 END IF;
 IF p_intended_role='OWNER' THEN
   INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
   VALUES(p_store_id,v_user,auth.uid())
   ON CONFLICT(store_id) DO NOTHING;
   DELETE FROM public.store_primary_owner_invitation_intents
   WHERE store_id=p_store_id AND user_id=v_user;
 ELSE
   INSERT INTO public.store_delegated_permissions(
      store_id,user_id,staff_edit,attendance_approve,payroll_view,granted_by)
   VALUES(p_store_id,v_user,false,false,false,auth.uid())
   ON CONFLICT(store_id,user_id) DO NOTHING;
 END IF;
 RETURN jsonb_build_object('ok',true,'user_id',v_user,'store_id',p_store_id,
  'intended_role',p_intended_role,'connection','EXISTING_VERIFIED_ACCOUNT',
  'already_assigned',v_role='STORE_MANAGER');
END $fn$;
REVOKE ALL ON FUNCTION public.hq_store_existing_verified_account_connect(text,bigint,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_existing_verified_account_connect(text,bigint,text)
 TO authenticated;
