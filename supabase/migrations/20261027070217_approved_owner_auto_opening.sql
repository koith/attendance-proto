-- New HQ invitations may explicitly approve opening after verified acceptance.
-- Existing invitations stay false. Applying this migration activates no store.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.store_owner_temp_first_logins
 ADD COLUMN IF NOT EXISTS auto_open_after_accept boolean NOT NULL DEFAULT false;
ALTER TABLE public.store_primary_owner_invitation_intents
 ADD COLUMN IF NOT EXISTS auto_open_after_accept boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.owner_opening_rules(p_store_id bigint,p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $rules$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=p_actor_id AND a.admin_role='HQ' AND u.email_confirmed_at IS NOT NULL
   AND u.deleted_at IS NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now()))
 THEN RAISE EXCEPTION 'HQ_OPENING_APPROVAL_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id
  AND s.onboarding_status='STAGED' AND s.is_active=false)
 THEN RAISE EXCEPTION 'STAGED_STORE_REQUIRED'; END IF;
 IF (SELECT r.decision FROM public.store_provenance_reviews r
   WHERE r.store_id=p_store_id ORDER BY r.id DESC LIMIT 1) IS DISTINCT FROM 'VERIFIED'
 THEN RAISE EXCEPTION 'PROVENANCE_VERIFICATION_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.employees e WHERE e.store_id=p_store_id AND
  (coalesce(e.memo,'') ILIKE '%데모%' OR coalesce(e.memo,'') ILIKE '%샘플%' OR e.name ILIKE '%테스트%'))
 THEN RAISE EXCEPTION 'DEMO_EMPLOYEES_REQUIRE_REVIEW'; END IF;
END $rules$;
REVOKE ALL ON FUNCTION private.owner_opening_rules(bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.service_store_owner_opening_preflight(p_store_id bigint,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $preflight$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 PERFORM private.owner_opening_rules(p_store_id,p_actor_id);
 IF EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id)
 THEN RAISE EXCEPTION 'OWNER_ALREADY_ASSIGNED'; END IF;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id);
END $preflight$;
REVOKE ALL ON FUNCTION public.service_store_owner_opening_preflight(bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_store_owner_opening_preflight(bigint,uuid) TO service_role;

-- Explicit overloads preserve the legacy 3/4-argument, non-opening contracts.
CREATE OR REPLACE FUNCTION public.service_store_owner_temp_issue(
 p_store_id bigint,p_user_id uuid,p_actor_id uuid,p_auto_open_after_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $issue_temp$
DECLARE result jsonb;
BEGIN
 result:=public.service_store_owner_temp_issue(p_store_id,p_user_id,p_actor_id);
 IF p_auto_open_after_accept IS TRUE THEN
  PERFORM private.owner_opening_rules(p_store_id,p_actor_id);
  UPDATE public.store_owner_temp_first_logins SET auto_open_after_accept=true
   WHERE store_id=p_store_id AND user_id=p_user_id AND issued_by=p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_APPROVAL_NOT_BOUND'; END IF;
 END IF;
 RETURN result||jsonb_build_object('auto_open_after_accept',p_auto_open_after_accept IS TRUE);
END $issue_temp$;
REVOKE ALL ON FUNCTION public.service_store_owner_temp_issue(bigint,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_store_owner_temp_issue(bigint,uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.service_native_owner_invitation_issue(
 p_store_id bigint,p_user_id uuid,p_actor_id uuid,p_email text,p_auto_open_after_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $issue_native$
DECLARE result jsonb;
BEGIN
 result:=public.service_native_owner_invitation_issue(p_store_id,p_user_id,p_actor_id,p_email);
 IF p_auto_open_after_accept IS TRUE THEN
  PERFORM private.owner_opening_rules(p_store_id,p_actor_id);
  UPDATE public.store_primary_owner_invitation_intents SET auto_open_after_accept=true
   WHERE store_id=p_store_id AND user_id=p_user_id AND invited_by=p_actor_id AND source='native_mail_v1';
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_APPROVAL_NOT_BOUND'; END IF;
 END IF;
 RETURN result||jsonb_build_object('auto_open_after_accept',p_auto_open_after_accept IS TRUE);
END $issue_native$;
REVOKE ALL ON FUNCTION public.service_native_owner_invitation_issue(bigint,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_native_owner_invitation_issue(bigint,uuid,uuid,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION private.finish_approved_owner_opening(
 p_store_id bigint,p_owner_id uuid,p_approved_by uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $finish$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'authenticated' OR auth.uid() IS DISTINCT FROM p_owner_id
 THEN RAISE EXCEPTION 'OWNER_AUTHENTICATION_REQUIRED'; END IF;
 PERFORM private.owner_opening_rules(p_store_id,p_approved_by);
 IF NOT EXISTS(SELECT 1 FROM public.store_primary_owners o JOIN public.admin_users a
  ON a.user_id=o.user_id AND a.store_id=o.store_id JOIN auth.users u ON u.id=o.user_id
  WHERE o.store_id=p_store_id AND o.user_id=p_owner_id AND a.admin_role='STORE_MANAGER'
   AND u.email_confirmed_at IS NOT NULL AND coalesce(length(u.encrypted_password),0)>0
   AND u.deleted_at IS NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now()))
 THEN RAISE EXCEPTION 'CONFIRMED_PRIMARY_OWNER_REQUIRED'; END IF;
 UPDATE public.stores SET onboarding_status='READY',is_active=true
  WHERE id=p_store_id AND onboarding_status='STAGED' AND is_active=false;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_OPENING_NOT_CONFIRMED'; END IF;
END $finish$;
REVOKE ALL ON FUNCTION private.finish_approved_owner_opening(bigint,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- A lost completion response may be acknowledged again; this path never grants
-- a role, changes approval, or opens/reopens a store.
CREATE OR REPLACE FUNCTION private.verified_completed_owner(p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $completed$
DECLARE found_owner record;
BEGIN
 SELECT o.store_id,s.onboarding_status,s.is_active INTO found_owner
 FROM public.store_primary_owners o JOIN public.admin_users a
  ON a.user_id=o.user_id AND a.store_id=o.store_id JOIN auth.users u ON u.id=o.user_id
  JOIN public.stores s ON s.id=o.store_id
 WHERE o.user_id=auth.uid() AND a.admin_role='STORE_MANAGER'
  AND coalesce(auth.jwt()->>'role','')='authenticated'
  AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
  AND (u.banned_until IS NULL OR u.banned_until<now())
  AND length(p_new_password) BETWEEN 12 AND 128 AND u.encrypted_password IS NOT NULL
  AND extensions.crypt(p_new_password,u.encrypted_password)=u.encrypted_password;
 IF NOT FOUND THEN RAISE EXCEPTION 'NO_VERIFIED_COMPLETED_OWNER'; END IF;
 RETURN jsonb_build_object('ok',true,'owner_assigned',true,'store_id',found_owner.store_id,
  'already_completed',true,'store_opened',found_owner.onboarding_status='READY' AND found_owner.is_active);
END $completed$;
REVOKE ALL ON FUNCTION private.verified_completed_owner(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.service_store_owner_invitation_resend_preflight(
 p_store_id bigint,p_email text,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $resend$
DECLARE pending record;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=p_actor_id AND a.admin_role='HQ' AND u.email_confirmed_at IS NOT NULL
   AND u.deleted_at IS NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now()))
 THEN RAISE EXCEPTION 'HQ_ONLY'; END IF;
 SELECT c.user_id,c.expires_at,c.auto_open_after_accept,'RECOVERY'::text AS delivery INTO pending
 FROM public.store_owner_temp_first_logins c JOIN auth.users u ON u.id=c.user_id
 WHERE c.store_id=p_store_id AND lower(c.email)=lower(btrim(p_email))
  AND lower(u.email)=lower(c.email) AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now());
 IF NOT FOUND THEN
  SELECT i.user_id,i.expires_at,i.auto_open_after_accept,
   CASE WHEN u.email_confirmed_at IS NULL THEN 'INVITE' ELSE 'RECOVERY' END AS delivery INTO pending
  FROM public.store_primary_owner_invitation_intents i JOIN auth.users u ON u.id=i.user_id
  WHERE i.store_id=p_store_id
   AND lower(u.email)=lower(btrim(p_email)) AND u.deleted_at IS NULL AND NOT u.is_anonymous
   AND (u.banned_until IS NULL OR u.banned_until<now());
 END IF;
 IF NOT FOUND OR pending.expires_at<=now() OR NOT EXISTS(
  SELECT 1 FROM public.stores WHERE id=p_store_id AND onboarding_status='STAGED' AND is_active=false)
 THEN RAISE EXCEPTION 'NO_VALID_OWNER_INVITATION'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=pending.user_id
   AND (admin_role<>'STORE_MANAGER' OR store_id IS DISTINCT FROM p_store_id))
  OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id OR user_id=pending.user_id)
 THEN RAISE EXCEPTION 'OWNER_ALREADY_ASSIGNED'; END IF;
 IF pending.auto_open_after_accept THEN PERFORM private.owner_opening_rules(p_store_id,p_actor_id); END IF;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',pending.user_id,
  'delivery',pending.delivery,'auto_open_after_accept',pending.auto_open_after_accept);
END $resend$;
REVOKE ALL ON FUNCTION public.service_store_owner_invitation_resend_preflight(bigint,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_store_owner_invitation_resend_preflight(bigint,text,uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.store_owner_temp_preflight()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_claim record;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated' THEN
   RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
 END IF;
 SELECT c.store_id,c.expires_at,c.email,c.auto_open_after_accept INTO v_claim
   FROM public.store_owner_temp_first_logins c
   JOIN auth.users u ON u.id=c.user_id
   WHERE c.user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL AND NOT u.is_anonymous
     AND (u.banned_until IS NULL OR u.banned_until<now())
     AND lower(btrim(u.email))=c.email;
 IF NOT FOUND THEN RAISE EXCEPTION 'NO_TEMP_OWNER_INVITATION'; END IF;
 IF v_claim.expires_at<=now() THEN RAISE EXCEPTION 'TEMP_OWNER_CREDENTIAL_EXPIRED'; END IF;
 RETURN jsonb_build_object('ok',true,'store_id',v_claim.store_id,
                           'email',v_claim.email,'expires_at',v_claim.expires_at,
                           'password_change_required',true,'auto_open_after_accept',v_claim.auto_open_after_accept);
END;
$$;
REVOKE ALL ON FUNCTION public.store_owner_temp_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_owner_temp_preflight() TO authenticated;

CREATE OR REPLACE FUNCTION public.native_owner_invitation_preflight()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $native_check$
DECLARE v_uid uuid;v_intent record;v_auth record;
BEGIN
 v_uid:=auth.uid();
 IF v_uid IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated' THEN
  RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
 END IF;
 SELECT i.store_id,i.user_id,i.expires_at,i.auto_open_after_accept,s.onboarding_status,s.is_active
 INTO v_intent
 FROM public.store_primary_owner_invitation_intents i
 JOIN public.stores s ON s.id=i.store_id
 WHERE i.user_id=v_uid AND i.source='native_mail_v1';
 IF NOT FOUND OR v_intent.expires_at<=now()
  OR v_intent.onboarding_status<>'STAGED' OR v_intent.is_active IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'NO_VALID_NATIVE_OWNER_INVITATION'; END IF;
 SELECT lower(btrim(u.email)) AS email,u.email_confirmed_at,u.deleted_at,u.is_anonymous,u.banned_until
 INTO v_auth FROM auth.users u WHERE u.id=v_uid;
 IF NOT FOUND OR v_auth.email_confirmed_at IS NULL OR v_auth.deleted_at IS NOT NULL
  OR v_auth.is_anonymous OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now())
 THEN RAISE EXCEPTION 'AUTH_CONFIRMATION_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=v_uid)
  OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=v_intent.store_id OR user_id=v_uid)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 RETURN jsonb_build_object('ok',true,'store_id',v_intent.store_id,
  'intended_role','OWNER','password_change_required',true,'auto_open_after_accept',v_intent.auto_open_after_accept,'expires_at',v_intent.expires_at);
END;
$native_check$;
REVOKE ALL ON FUNCTION public.native_owner_invitation_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_owner_invitation_preflight() TO authenticated;

CREATE OR REPLACE FUNCTION public.store_owner_temp_complete(p_new_password text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_uid uuid; v_claim record; v_auth record; v_store record;
BEGIN
 v_uid:=auth.uid();
 IF v_uid IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated' THEN
   RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT * INTO v_claim FROM public.store_owner_temp_first_logins
 WHERE user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN private.verified_completed_owner(p_new_password); END IF;
 IF v_claim.expires_at<=now() THEN RAISE EXCEPTION 'TEMP_OWNER_CREDENTIAL_EXPIRED'; END IF;
 SELECT id,onboarding_status,is_active INTO v_store
 FROM public.stores WHERE id=v_claim.store_id FOR UPDATE;
 IF NOT FOUND OR v_store.onboarding_status<>'STAGED' OR v_store.is_active IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'STAGED_STORE_REQUIRED'; END IF;
 SELECT lower(btrim(u.email)) AS email,u.encrypted_password,
        u.email_confirmed_at,u.deleted_at,u.is_anonymous,u.banned_until
 INTO v_auth FROM auth.users u WHERE u.id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_auth.email IS DISTINCT FROM v_claim.email
    OR v_auth.email_confirmed_at IS NULL OR v_auth.deleted_at IS NOT NULL
    OR v_auth.is_anonymous OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now())
 THEN RAISE EXCEPTION 'AUTH_IDENTITY_CHANGED'; END IF;
 -- Independently prove the *new* password is at least 12 characters and is
 -- the current GoTrue password. Otherwise users could bypass the browser
 -- length check by calling /auth/v1/user directly with a weak password.
 -- The plaintext is used only for this check; it is never stored or returned.
 IF p_new_password IS NULL OR length(p_new_password)<12 OR length(p_new_password)>128
    OR v_auth.encrypted_password IS NULL
    OR v_auth.encrypted_password=v_claim.temporary_auth_hash
    OR extensions.crypt(p_new_password,v_auth.encrypted_password) IS DISTINCT FROM v_auth.encrypted_password
 THEN RAISE EXCEPTION 'PERSONAL_PASSWORD_NOT_VERIFIED'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=v_uid)
   OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=v_claim.store_id OR user_id=v_uid)
   OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id=v_claim.store_id OR user_id=v_uid)
 THEN RAISE EXCEPTION 'OWNER_ALREADY_ASSIGNED'; END IF;
 INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
 VALUES(v_uid,v_claim.email,'Representative activated after first password change',
        'STORE_MANAGER',v_claim.store_id);
 INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
 VALUES(v_claim.store_id,v_uid,v_claim.issued_by);
 IF v_claim.auto_open_after_accept THEN
  PERFORM private.finish_approved_owner_opening(v_claim.store_id,v_uid,v_claim.issued_by);
 END IF;
 DELETE FROM public.store_owner_temp_first_logins WHERE store_id=v_claim.store_id;
 RETURN jsonb_build_object('ok',true,'owner_assigned',true,'store_id',v_claim.store_id,'store_opened',(SELECT s.onboarding_status='READY' AND s.is_active FROM public.stores s WHERE s.id=v_claim.store_id));
END;
$$;
REVOKE ALL ON FUNCTION public.store_owner_temp_complete(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_owner_temp_complete(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.native_owner_invitation_complete(p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $native_complete$
DECLARE v_uid uuid;v_intent record;v_auth record;
BEGIN
 v_uid:=auth.uid();
 IF v_uid IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated' THEN
  RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT i.* INTO v_intent FROM public.store_primary_owner_invitation_intents i
 WHERE i.user_id=v_uid AND i.source='native_mail_v1' FOR UPDATE;
 IF NOT FOUND THEN RETURN private.verified_completed_owner(p_new_password); END IF;
 IF v_intent.expires_at<=now() THEN RAISE EXCEPTION 'NATIVE_OWNER_INVITATION_EXPIRED'; END IF;
 PERFORM 1 FROM public.stores s WHERE s.id=v_intent.store_id
  AND s.onboarding_status='STAGED' AND s.is_active=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STAGED_STORE_REQUIRED'; END IF;
 SELECT lower(btrim(u.email)) AS email,u.encrypted_password,u.email_confirmed_at,
        u.deleted_at,u.is_anonymous,u.banned_until
 INTO v_auth FROM auth.users u WHERE u.id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_auth.email_confirmed_at IS NULL OR v_auth.deleted_at IS NOT NULL
  OR v_auth.is_anonymous OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now())
 THEN RAISE EXCEPTION 'AUTH_CONFIRMATION_REQUIRED'; END IF;
 IF p_new_password IS NULL OR length(p_new_password)<12 OR length(p_new_password)>128
  OR v_auth.encrypted_password IS NULL
  OR extensions.crypt(p_new_password,v_auth.encrypted_password) IS DISTINCT FROM v_auth.encrypted_password
 THEN RAISE EXCEPTION 'PERSONAL_PASSWORD_NOT_VERIFIED'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=v_uid)
  OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=v_intent.store_id OR user_id=v_uid)
  OR EXISTS(SELECT 1 FROM public.store_owner_temp_first_logins WHERE store_id=v_intent.store_id OR user_id=v_uid)
 THEN RAISE EXCEPTION 'OWNER_ALREADY_ASSIGNED'; END IF;
 INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
 VALUES(v_uid,v_auth.email,'Native Auth invite accepted after verified password change',
        'STORE_MANAGER',v_intent.store_id);
 INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
 VALUES(v_intent.store_id,v_uid,v_intent.invited_by);
 IF v_intent.auto_open_after_accept THEN
  PERFORM private.finish_approved_owner_opening(v_intent.store_id,v_uid,v_intent.invited_by);
 END IF;
 DELETE FROM public.store_primary_owner_invitation_intents
 WHERE store_id=v_intent.store_id AND user_id=v_uid AND source='native_mail_v1';
 RETURN jsonb_build_object('ok',true,'owner_assigned',true,'store_id',v_intent.store_id,'store_opened',(SELECT s.onboarding_status='READY' AND s.is_active FROM public.stores s WHERE s.id=v_intent.store_id));
END;
$native_complete$;
REVOKE ALL ON FUNCTION public.native_owner_invitation_complete(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_owner_invitation_complete(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
