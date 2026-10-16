-- #921: HQ owner invitation intent -> verified acceptance -> atomic primary-owner appointment.
-- Invite registration stays service-role-only; acceptance is bound to auth.uid().
CREATE TABLE IF NOT EXISTS public.store_primary_owner_invitation_intents (
  store_id bigint PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  source text NOT NULL DEFAULT 'hq_invite',
  CONSTRAINT owner_invitation_intent_expiry CHECK (expires_at > created_at)
);
ALTER TABLE public.store_primary_owner_invitation_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_primary_owner_invitation_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_primary_owner_invitation_intents TO service_role;

-- If an HQ or store owner revokes a manager, cancel the unused owner invitation automatically.
CREATE OR REPLACE FUNCTION public.cancel_revoked_owner_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
BEGIN
  DELETE FROM public.store_primary_owner_invitation_intents
  WHERE user_id=OLD.user_id AND store_id=OLD.store_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS cancel_revoked_owner_invitation ON public.admin_users;
CREATE TRIGGER cancel_revoked_owner_invitation
AFTER DELETE ON public.admin_users FOR EACH ROW
EXECUTE FUNCTION public.cancel_revoked_owner_invitation();

-- Only the HQ-specific invite flow uses this RPC; the delegated-manager flow uses another RPC.
CREATE OR REPLACE FUNCTION public.service_store_manager_attach_invited_user(
  p_store_id bigint, p_user_id uuid, p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE v_email text; v_role text; v_store bigint; v_pending_user uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ONLY';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=p_actor_id AND a.admin_role='HQ'
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
  ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  PERFORM 1 FROM public.stores s
    WHERE s.id=p_store_id AND s.onboarding_status<>'SUSPENDED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id)
  THEN RAISE EXCEPTION 'PRIMARY_OWNER_ALREADY_ASSIGNED'; END IF;
  SELECT user_id INTO v_pending_user FROM public.store_primary_owner_invitation_intents
    WHERE store_id=p_store_id FOR UPDATE;
  IF v_pending_user IS NOT NULL AND v_pending_user<>p_user_id
  THEN RAISE EXCEPTION 'PENDING_OWNER_INVITE_EXISTS'; END IF;
  SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u
    WHERE u.id=p_user_id AND u.deleted_at IS NULL AND NOT u.is_anonymous;
  IF v_email IS NULL THEN RAISE EXCEPTION 'AUTH_USER_NOT_FOUND'; END IF;
  SELECT a.admin_role,a.store_id INTO v_role,v_store
    FROM public.admin_users a WHERE a.user_id=p_user_id;
  IF v_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
  IF v_role IS NOT NULL AND (v_role<>'STORE_MANAGER' OR v_store IS DISTINCT FROM p_store_id)
  THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
  IF v_role IS NULL THEN
    INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
    VALUES(p_user_id,v_email,'Invited by HQ for store operation','STORE_MANAGER',p_store_id);
  END IF;
  INSERT INTO public.store_primary_owner_invitation_intents(store_id,user_id,invited_by)
  VALUES(p_store_id,p_user_id,p_actor_id)
  ON CONFLICT(store_id) DO UPDATE SET
    created_at=now(),expires_at=now()+interval '14 days',
    invited_by=excluded.invited_by,source='hq_invite'
  WHERE store_primary_owner_invitation_intents.user_id=excluded.user_id;
  RETURN jsonb_build_object('ok',true,'user_id',p_user_id,'store_id',p_store_id,
    'role','STORE_MANAGER','owner_invitation','PENDING_ACTIVATION',
    'already_assigned',v_role='STORE_MANAGER');
END $$;
REVOKE ALL ON FUNCTION public.service_store_manager_attach_invited_user(bigint,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_store_manager_attach_invited_user(bigint,uuid,uuid) TO service_role;

-- Called only AFTER password setup by an authenticated invitation recipient.
-- HQ's signed intent, validated auth identity and a free owner slot are all required.
CREATE OR REPLACE FUNCTION public.store_primary_owner_accept_invitation()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE v_uid uuid; v_store bigint; v_role text; v_intent record; v_owner uuid; v_confirmed boolean;
BEGIN
  v_uid:=auth.uid();
  IF v_uid IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated'
  THEN RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  SELECT a.store_id,a.admin_role INTO v_store,v_role
    FROM public.admin_users a WHERE a.user_id=v_uid;
  IF v_role<>'STORE_MANAGER' OR v_store IS NULL
  THEN RAISE EXCEPTION 'STORE_MANAGER_REQUIRED'; END IF;
  SELECT (u.email_confirmed_at IS NOT NULL AND coalesce(length(u.encrypted_password),0)>0
    AND u.deleted_at IS NULL AND NOT u.is_anonymous
    AND (u.banned_until IS NULL OR u.banned_until<now()))
    INTO v_confirmed FROM auth.users u WHERE u.id=v_uid;
  IF v_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'EMAIL_CONFIRMATION_REQUIRED'; END IF;
  PERFORM 1 FROM public.stores s
    WHERE s.id=v_store AND s.onboarding_status<>'SUSPENDED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
  SELECT user_id INTO v_owner FROM public.store_primary_owners WHERE store_id=v_store FOR UPDATE;
  IF v_owner=v_uid THEN
    DELETE FROM public.store_primary_owner_invitation_intents
      WHERE store_id=v_store AND user_id=v_uid;
    RETURN jsonb_build_object('ok',true,'store_id',v_store,'owner_assigned',true,'already_owner',true);
  END IF;
  SELECT i.* INTO v_intent FROM public.store_primary_owner_invitation_intents i
    WHERE i.user_id=v_uid AND i.store_id=v_store FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',true,'store_id',v_store,
      'owner_assigned',false,'reason','NO_PENDING_OWNER_INVITATION');
  END IF;
  IF v_intent.expires_at<=now() THEN RAISE EXCEPTION 'OWNER_INVITATION_EXPIRED'; END IF;
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'PRIMARY_OWNER_ALREADY_ASSIGNED'; END IF;
  INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
  VALUES(v_store,v_uid,v_intent.invited_by);
  DELETE FROM public.store_primary_owner_invitation_intents
    WHERE store_id=v_store AND user_id=v_uid;
  RETURN jsonb_build_object('ok',true,'store_id',v_store,'owner_assigned',true);
END $$;
REVOKE ALL ON FUNCTION public.store_primary_owner_accept_invitation() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_primary_owner_accept_invitation() TO authenticated;

CREATE OR REPLACE FUNCTION public.hq_store_primary_owner_invitation_list()
RETURNS TABLE(store_id bigint,user_id uuid,expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  RETURN QUERY SELECT i.store_id,i.user_id,i.expires_at
    FROM public.store_primary_owner_invitation_intents i WHERE i.expires_at>now();
END $$;
REVOKE ALL ON FUNCTION public.hq_store_primary_owner_invitation_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_primary_owner_invitation_list() TO authenticated;

-- Old-style manual HQ representative appointment must cancel pending auto-accept.
CREATE OR REPLACE FUNCTION public.hq_store_primary_owner_set(p_store_id bigint,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_outgoing_owner uuid;
BEGIN
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  IF NOT EXISTS(
    SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=p_user_id AND a.store_id=p_store_id AND a.admin_role='STORE_MANAGER'
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
    AND (u.banned_until IS NULL OR u.banned_until<now())
  ) THEN RAISE EXCEPTION 'CONFIRMED_STORE_MANAGER_REQUIRED'; END IF;
  SELECT o.user_id INTO v_outgoing_owner FROM public.store_primary_owners o
    WHERE o.store_id=p_store_id FOR UPDATE;
  INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
  VALUES(p_store_id,p_user_id,auth.uid())
  ON CONFLICT(store_id) DO UPDATE SET user_id=excluded.user_id,
    appointed_at=now(),appointed_by=excluded.appointed_by;
  DELETE FROM public.store_primary_owner_invitation_intents WHERE store_id=p_store_id;
  IF v_outgoing_owner IS NOT NULL AND v_outgoing_owner IS DISTINCT FROM p_user_id THEN
    DELETE FROM public.store_admin_memberships
      WHERE store_id=p_store_id AND user_id=v_outgoing_owner;
    DELETE FROM public.admin_users
      WHERE user_id=v_outgoing_owner AND store_id=p_store_id AND admin_role='STORE_MANAGER';
    IF NOT FOUND THEN RAISE EXCEPTION 'OUTGOING_OWNER_NOT_FOUND'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id);
END $$;

-- Existing HQ invite for the real Inha University store (2026-10-14):
-- only record the owner's original HQ invitation intent; no role/confirmation changes.
-- Identify by actual store code/email rather than assuming generated user IDs.
INSERT INTO public.store_primary_owner_invitation_intents(store_id,user_id,invited_by,source)
SELECT s.id,a.user_id,NULL,'legacy_hq_invite_20261014'
FROM public.stores s
JOIN public.admin_users a ON a.store_id=s.id AND a.admin_role='STORE_MANAGER'
JOIN auth.users u ON u.id=a.user_id
WHERE s.code='INHA' AND lower(a.email)='dokodemoitsh@naver.com'
  AND a.note='Invited by HQ for store operation'
  AND u.invited_at IS NOT NULL AND u.email_confirmed_at IS NULL
  AND u.deleted_at IS NULL AND NOT u.is_anonymous
  AND NOT EXISTS(SELECT 1 FROM public.store_primary_owners o WHERE o.store_id=s.id)
  AND NOT EXISTS(SELECT 1 FROM public.store_admin_memberships m WHERE m.user_id=a.user_id)
ON CONFLICT(store_id) DO NOTHING;
