-- QA1243: native Supabase Auth invitation may create an Auth identity with NO
-- password, but NEVER grants STORE_MANAGER before verified password change.
BEGIN;
CREATE OR REPLACE FUNCTION public.service_native_owner_invitation_issue(
 p_store_id bigint,p_user_id uuid,p_actor_id uuid,p_email text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $native_issue$
DECLARE v_email text;
BEGIN
 IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
  RAISE EXCEPTION 'SERVICE_ONLY';
 END IF;
 IF p_store_id IS NULL OR p_store_id<=0 OR p_user_id IS NULL OR
    p_actor_id IS NULL OR p_email IS NULL THEN RAISE EXCEPTION 'INVALID_INVITATION_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 IF NOT EXISTS (
  SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=p_actor_id AND a.admin_role='HQ'
   AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
   AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
 ) THEN RAISE EXCEPTION 'HQ_ONLY'; END IF;
 PERFORM 1 FROM public.stores s WHERE s.id=p_store_id
  AND s.onboarding_status='STAGED' AND s.is_active=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STAGED_STORE_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id)
  OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id=p_store_id)
  OR EXISTS(SELECT 1 FROM public.store_owner_temp_first_logins WHERE store_id=p_store_id)
 THEN RAISE EXCEPTION 'OWNER_ALREADY_PENDING'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=p_user_id)
  OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE user_id=p_user_id)
  OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE user_id=p_user_id)
  OR EXISTS(SELECT 1 FROM public.store_owner_temp_first_logins WHERE user_id=p_user_id)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u
 WHERE u.id=p_user_id AND u.deleted_at IS NULL AND NOT u.is_anonymous
  AND (u.banned_until IS NULL OR u.banned_until<now()) FOR UPDATE;
 IF v_email IS NULL OR v_email IS DISTINCT FROM lower(btrim(p_email))
 THEN RAISE EXCEPTION 'AUTH_EMAIL_MISMATCH'; END IF;
 INSERT INTO public.store_primary_owner_invitation_intents(
  store_id,user_id,invited_by,source,created_at,expires_at
 ) VALUES(
  p_store_id,p_user_id,p_actor_id,'native_mail_v1',now(),now()+interval '24 hours'
 );
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id,
                           'email',v_email,'owner_invitation','PENDING_ACTIVATION');
END;
$native_issue$;
REVOKE ALL ON FUNCTION public.service_native_owner_invitation_issue(bigint,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_native_owner_invitation_issue(bigint,uuid,uuid,text) TO service_role;

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
 SELECT i.store_id,i.user_id,i.expires_at,s.onboarding_status,s.is_active
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
  'intended_role','OWNER','password_change_required',true,'expires_at',v_intent.expires_at);
END;
$native_check$;
REVOKE ALL ON FUNCTION public.native_owner_invitation_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_owner_invitation_preflight() TO authenticated;

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
 IF NOT FOUND OR v_intent.expires_at<=now() THEN RAISE EXCEPTION 'NATIVE_OWNER_INVITATION_EXPIRED'; END IF;
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
 DELETE FROM public.store_primary_owner_invitation_intents
 WHERE store_id=v_intent.store_id AND user_id=v_uid AND source='native_mail_v1';
 RETURN jsonb_build_object('ok',true,'owner_assigned',true,'store_id',v_intent.store_id);
END;
$native_complete$;
REVOKE ALL ON FUNCTION public.native_owner_invitation_complete(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_owner_invitation_complete(text) TO authenticated;
COMMIT;
