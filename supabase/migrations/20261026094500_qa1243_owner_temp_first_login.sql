-- QA1243: first-login temporary credentials for NEW representative owners.
-- This is a separate staged path. NO admin_users/primary-owner privileges are
-- granted until the recipient changes their temporary Auth password.
-- Existing HQ/owner accounts are not modified by this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.store_owner_temp_first_logins (
  store_id bigint PRIMARY KEY REFERENCES public.stores(id),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  issued_by uuid NOT NULL REFERENCES auth.users(id),
  temporary_auth_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT owner_temp_first_login_expiry CHECK (expires_at > issued_at)
);

ALTER TABLE public.store_owner_temp_first_logins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_owner_temp_first_logins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.store_owner_temp_first_logins TO service_role;

CREATE OR REPLACE FUNCTION public.service_store_owner_temp_issue(
 p_store_id bigint, p_user_id uuid, p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_auth record; v_store record;
BEGIN
 IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
   RAISE EXCEPTION 'SERVICE_ONLY';
 END IF;
 IF p_store_id IS NULL OR p_store_id<=0 OR p_user_id IS NULL OR p_actor_id IS NULL THEN
   RAISE EXCEPTION 'BAD_TEMP_OWNER_INPUT';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 IF NOT EXISTS (
   SELECT 1 FROM public.admin_users a JOIN auth.users u ON a.user_id=u.id
   WHERE a.user_id=p_actor_id AND a.admin_role='HQ'
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
 ) THEN RAISE EXCEPTION 'HQ_ONLY'; END IF;
 SELECT id,onboarding_status,is_active INTO v_store
   FROM public.stores WHERE id=p_store_id FOR UPDATE;
 IF NOT FOUND OR v_store.onboarding_status<>'STAGED' OR v_store.is_active IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'STAGED_STORE_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id)
    OR EXISTS (SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id=p_store_id)
    OR EXISTS (SELECT 1 FROM public.store_owner_temp_first_logins WHERE store_id=p_store_id)
 THEN RAISE EXCEPTION 'OWNER_OR_INVITATION_ALREADY_EXISTS'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.store_owner_temp_first_logins WHERE user_id=p_user_id)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 SELECT id,lower(btrim(email)) AS email,encrypted_password,
        email_confirmed_at,deleted_at,is_anonymous,banned_until
   INTO v_auth FROM auth.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR v_auth.email IS NULL OR v_auth.email_confirmed_at IS NULL
   OR coalesce(length(v_auth.encrypted_password),0)=0 OR v_auth.deleted_at IS NOT NULL
   OR v_auth.is_anonymous OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now())
 THEN RAISE EXCEPTION 'AUTH_USER_NOT_READY'; END IF;
 INSERT INTO public.store_owner_temp_first_logins(
  store_id,user_id,email,issued_by,temporary_auth_hash,expires_at
 ) VALUES (p_store_id,p_user_id,v_auth.email,p_actor_id,v_auth.encrypted_password,
           now()+interval '24 hours');
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id,
                           'email',v_auth.email,'expires_at',now()+interval '24 hours');
END;
$$;
REVOKE ALL ON FUNCTION public.service_store_owner_temp_issue(bigint,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_store_owner_temp_issue(bigint,uuid,uuid) TO service_role;

-- Preflight does not grant any privileged role. Only the matching signed-in
-- Auth user can see their own pending first-login state. No passphrase leaks.
CREATE OR REPLACE FUNCTION public.store_owner_temp_preflight()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_claim record;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated' THEN
   RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
 END IF;
 SELECT c.store_id,c.expires_at,c.email INTO v_claim
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
                           'password_change_required',true);
END;
$$;
REVOKE ALL ON FUNCTION public.store_owner_temp_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_owner_temp_preflight() TO authenticated;

-- The only elevation path for a temporary user. It requires the Auth password
-- hash to have CHANGED since issuance and refuses expired/canceled claims.
-- NOTE: GoTrue rejects same-password update; the page checks that response.
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
 IF NOT FOUND THEN RAISE EXCEPTION 'NO_TEMP_OWNER_INVITATION'; END IF;
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
 DELETE FROM public.store_owner_temp_first_logins WHERE store_id=v_claim.store_id;
 RETURN jsonb_build_object('ok',true,'owner_assigned',true,'store_id',v_claim.store_id);
END;
$$;
REVOKE ALL ON FUNCTION public.store_owner_temp_complete(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_owner_temp_complete(text) TO authenticated;


-- HQ-only pending list for one-time-credential issuance visibility.
-- Neither the initial password nor its stored Auth hash is returned.
CREATE OR REPLACE FUNCTION public.hq_store_owner_temp_pending_list()
 RETURNS TABLE(store_id bigint,email text,expires_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $
 SELECT c.store_id,c.email,c.expires_at
 FROM public.store_owner_temp_first_logins c
 WHERE EXISTS (
  SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=auth.uid() AND a.admin_role='HQ'
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
 )
 ORDER BY c.store_id;
$;
REVOKE ALL ON FUNCTION public.hq_store_owner_temp_pending_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_owner_temp_pending_list() TO authenticated;

COMMIT;
