-- STORE-01: separate authority strictly by actor and revoke a replaced primary owner's access.
-- Reuses existing primary-owner FK and store-scoped authorization. No store data is changed.
-- This migration is inert for production stores with no appointed primary owners.
CREATE OR REPLACE FUNCTION public.hq_store_primary_owner_set(p_store_id bigint, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_outgoing_owner uuid;
BEGIN
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    JOIN public.stores s ON s.id=a.store_id
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
  -- Replacement revokes the previous owner's administrator access by default.
  -- Keeping the former owner requires a separate new appointment by the HQ.
  IF v_outgoing_owner IS NOT NULL AND v_outgoing_owner IS DISTINCT FROM p_user_id THEN
    DELETE FROM public.store_admin_memberships
    WHERE store_id=p_store_id AND user_id=v_outgoing_owner;
    DELETE FROM public.admin_users
    WHERE user_id=v_outgoing_owner AND store_id=p_store_id
      AND admin_role='STORE_MANAGER';
    IF NOT FOUND THEN RAISE EXCEPTION 'OUTGOING_OWNER_NOT_FOUND'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id);
END $function$;


CREATE OR REPLACE FUNCTION public.store_delegated_manager_change(
  p_store_id bigint,p_email text,p_user_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_target uuid;v_email text;v_status text;v_active boolean;v_count int;
BEGIN
  IF NOT public.store_primary_owner_can_delegate(p_store_id,auth.uid())
  THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
  IF p_action NOT IN ('ADD','REVOKE') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  SELECT onboarding_status,is_active INTO v_status,v_active
  FROM public.stores WHERE id=p_store_id FOR UPDATE;
  IF NOT FOUND OR v_status='SUSPENDED' THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
  IF v_status<>'READY' OR NOT v_active
  THEN RAISE EXCEPTION 'STORE_NOT_READY'; END IF;

  IF p_action='ADD' THEN
    v_email:=lower(btrim(coalesce(p_email,'')));
    IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR length(v_email)>254
    THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
    SELECT u.id INTO v_target FROM auth.users u
    WHERE lower(btrim(u.email))=v_email
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
      AND (u.banned_until IS NULL OR u.banned_until<now());
    IF v_target IS NULL THEN RAISE EXCEPTION 'CONFIRMED_ACCOUNT_REQUIRED'; END IF;
    IF EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=v_target
      AND (a.admin_role<>'STORE_MANAGER' OR a.store_id IS DISTINCT FROM p_store_id))
    THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
    INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
    VALUES(v_target,v_email,'Delegated store administrator','STORE_MANAGER',p_store_id)
    ON CONFLICT(user_id) DO NOTHING;
  ELSE
    v_target:=p_user_id;
    IF v_target IS NULL OR v_target=auth.uid() OR EXISTS(
      SELECT 1 FROM public.store_primary_owners o
      WHERE o.store_id=p_store_id AND o.user_id=v_target)
    THEN RAISE EXCEPTION 'CANNOT_REVOKE_OWNER_OR_SELF'; END IF;
    IF v_status='READY' THEN
      SELECT count(*) INTO v_count FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
      WHERE a.store_id=p_store_id AND a.admin_role='STORE_MANAGER' AND a.user_id<>v_target
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
      AND (u.banned_until IS NULL OR u.banned_until<now());
      IF v_count<1 THEN RAISE EXCEPTION 'CANNOT_REVOKE_LAST_READY_MANAGER'; END IF;
    END IF;
    DELETE FROM public.store_admin_memberships
    WHERE user_id=v_target AND store_id=p_store_id;
    DELETE FROM public.admin_users
    WHERE user_id=v_target AND store_id=p_store_id AND admin_role='STORE_MANAGER';
    IF NOT FOUND THEN RAISE EXCEPTION 'MANAGER_NOT_FOUND'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'store_id',p_store_id,
    'user_id',v_target,'action',p_action);
END $function$;

