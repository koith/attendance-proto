-- #1243 next phase: read-only invitation dispatch gate and token activation gate.
-- No DML at migration time. Production HQ and INHA staff data remain untouched.
CREATE OR REPLACE FUNCTION public.service_store_invitation_dispatch_preflight(
 p_store_id bigint,p_email text,p_actor_id uuid,p_mode text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_email text;v_uid uuid;v_confirmed boolean;v_has_password boolean;
 v_role text;v_linked_store bigint;v_owner uuid;v_pending uuid;
 v_state text;v_active boolean;v_actor_role text;v_actor_store bigint;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_mode NOT IN ('HQ_OWNER','HQ_ASSISTANT','STORE_ASSISTANT') THEN RAISE EXCEPTION 'INVALID_INVITATION_MODE'; END IF;
 v_email:=lower(btrim(coalesce(p_email,'')));
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR length(v_email)>254
 OR p_store_id IS NULL OR p_store_id<=0 THEN RAISE EXCEPTION 'INVALID_INVITATION'; END IF;
 SELECT a.admin_role,a.store_id INTO v_actor_role,v_actor_store
 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
 WHERE a.user_id=p_actor_id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
 AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now());
 IF p_mode LIKE 'HQ_%' AND v_actor_role IS DISTINCT FROM 'HQ'
 THEN RAISE EXCEPTION 'HQ_ONLY'; END IF;
 IF p_mode='STORE_ASSISTANT' AND
   (v_actor_role IS DISTINCT FROM 'STORE_MANAGER' OR v_actor_store IS DISTINCT FROM p_store_id
    OR NOT public.store_primary_owner_can_delegate(p_store_id,p_actor_id))
 THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 SELECT s.onboarding_status,s.is_active INTO v_state,v_active
 FROM public.stores s WHERE s.id=p_store_id;
 IF NOT FOUND OR v_state='SUSPENDED' THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
 SELECT o.user_id INTO v_owner FROM public.store_primary_owners o WHERE o.store_id=p_store_id;
 SELECT i.user_id INTO v_pending FROM public.store_primary_owner_invitation_intents i WHERE i.store_id=p_store_id;
 IF p_mode='HQ_OWNER' THEN
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'PRIMARY_OWNER_ALREADY_ASSIGNED'; END IF;
 ELSE
  IF v_state<>'READY' OR v_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'STORE_NOT_READY'; END IF;
  IF v_owner IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
   WHERE a.user_id=v_owner AND a.store_id=p_store_id AND a.admin_role='STORE_MANAGER'
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
     AND (u.banned_until IS NULL OR u.banned_until<now()))
  THEN RAISE EXCEPTION 'ACTIVE_PRIMARY_OWNER_REQUIRED'; END IF;
 END IF;
 SELECT u.id,(u.email_confirmed_at IS NOT NULL),
        (coalesce(length(u.encrypted_password),0)>0)
 INTO v_uid,v_confirmed,v_has_password FROM auth.users u
 WHERE lower(btrim(u.email))=v_email
 AND u.deleted_at IS NULL AND NOT u.is_anonymous
 AND (u.banned_until IS NULL OR u.banned_until<now());
 IF v_uid IS NOT NULL THEN
   SELECT a.admin_role,a.store_id INTO v_role,v_linked_store FROM public.admin_users a WHERE a.user_id=v_uid;
   IF v_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
   IF v_role IS NOT NULL AND
      (v_role<>'STORE_MANAGER' OR v_linked_store IS DISTINCT FROM p_store_id)
   THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
   IF p_mode='HQ_OWNER' THEN
     IF v_pending IS NOT NULL AND v_pending<>v_uid THEN RAISE EXCEPTION 'PENDING_OWNER_INVITE_EXISTS'; END IF;
   ELSE
     IF v_uid=v_owner OR v_uid=v_pending
        OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE user_id=v_uid)
        OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE user_id=v_uid)
     THEN RAISE EXCEPTION 'CANNOT_DEMOTE_OWNER_INVITE'; END IF;
   END IF;
   -- A verified account with a password must use the separate explicit
   -- reconnect path; Auth rejects re-inviting it by email.
   IF v_confirmed AND v_has_password THEN RAISE EXCEPTION 'USE_EXISTING_VERIFIED_ACCOUNT'; END IF;
 ELSE
   IF p_mode='HQ_OWNER' AND v_pending IS NOT NULL
   THEN RAISE EXCEPTION 'PENDING_OWNER_INVITE_EXISTS'; END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'delivery',
   CASE WHEN v_confirmed THEN 'RECOVERY' ELSE 'INVITE' END,
   'existing_auth_user',v_uid IS NOT NULL,'store_id',p_store_id);
END $fn$;
REVOKE ALL ON FUNCTION public.service_store_invitation_dispatch_preflight(bigint,text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_store_invitation_dispatch_preflight(bigint,text,uuid,text)
 TO service_role;

-- Must succeed BEFORE any password PUT. A revoked/expired invitation
-- must not reset the recipient's password even if a stale Auth URL still works.
CREATE OR REPLACE FUNCTION public.store_invitation_activation_preflight()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_uid uuid;v_store bigint;v_role text;v_state text;v_active boolean;
 v_owner uuid;v_expires timestamptz;v_invited_owner boolean;v_confirmed boolean;
BEGIN
 v_uid:=auth.uid();
 IF v_uid IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated'
 THEN RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED'; END IF;
 SELECT u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
   AND (u.banned_until IS NULL OR u.banned_until<now()) INTO v_confirmed
 FROM auth.users u WHERE u.id=v_uid;
 IF v_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'EMAIL_CONFIRMATION_REQUIRED'; END IF;
 SELECT a.store_id,a.admin_role INTO v_store,v_role FROM public.admin_users a WHERE a.user_id=v_uid;
 IF v_role IS DISTINCT FROM 'STORE_MANAGER' OR v_store IS NULL
 THEN RAISE EXCEPTION 'INVITATION_CANCELLED_OR_NOT_FOUND'; END IF;
 SELECT s.onboarding_status,s.is_active INTO v_state,v_active FROM public.stores s WHERE s.id=v_store;
 IF NOT FOUND OR v_state='SUSPENDED' THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
 SELECT o.user_id INTO v_owner FROM public.store_primary_owners o WHERE o.store_id=v_store;
 SELECT i.expires_at INTO v_expires FROM public.store_primary_owner_invitation_intents i
 WHERE i.store_id=v_store AND i.user_id=v_uid;
 v_invited_owner:=FOUND;
 IF v_invited_owner THEN
   IF v_expires<=now() THEN RAISE EXCEPTION 'OWNER_INVITATION_EXPIRED'; END IF;
   IF v_owner IS NOT NULL AND v_owner<>v_uid THEN RAISE EXCEPTION 'PRIMARY_OWNER_ALREADY_ASSIGNED'; END IF;
   RETURN jsonb_build_object('ok',true,'store_id',v_store,'intended_role','OWNER');
 END IF;
 IF v_owner=v_uid THEN
   RETURN jsonb_build_object('ok',true,'store_id',v_store,'intended_role','OWNER');
 END IF;
 IF v_state<>'READY' OR v_active IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'STORE_NOT_READY'; END IF;
 IF v_owner IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=v_owner AND a.store_id=v_store AND a.admin_role='STORE_MANAGER'
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
      AND (u.banned_until IS NULL OR u.banned_until<now()))
 THEN RAISE EXCEPTION 'ACTIVE_PRIMARY_OWNER_REQUIRED'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.store_delegated_permissions d
   WHERE d.store_id=v_store AND d.user_id=v_uid)
 THEN RAISE EXCEPTION 'INVITATION_CANCELLED_OR_NOT_FOUND'; END IF;
 RETURN jsonb_build_object('ok',true,'store_id',v_store,'intended_role','ASSISTANT');
END $fn$;
REVOKE ALL ON FUNCTION public.store_invitation_activation_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_invitation_activation_preflight() TO authenticated;
