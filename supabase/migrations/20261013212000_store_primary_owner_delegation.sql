-- Store-level delegated administrator management.
-- Additive schema: no employee, attendance, payroll or existing administrator row changed.
-- A store may have ONE HQ-appointed primary owner and optional delegated administrators.
CREATE TABLE IF NOT EXISTS public.store_primary_owners (
  store_id bigint PRIMARY KEY REFERENCES public.stores(id),
  user_id uuid NOT NULL REFERENCES public.admin_users(user_id) ON DELETE RESTRICT,
  appointed_at timestamptz NOT NULL DEFAULT now(),
  appointed_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.store_primary_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_primary_owners FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hq_store_primary_owner_set(p_store_id bigint, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
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
  INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
  VALUES(p_store_id,p_user_id,auth.uid())
  ON CONFLICT(store_id) DO UPDATE SET user_id=excluded.user_id,
    appointed_at=now(),appointed_by=excluded.appointed_by;
  RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id);
END $function$;

CREATE OR REPLACE FUNCTION public.hq_store_primary_owner_list()
RETURNS TABLE(store_id bigint,user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
BEGIN
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  RETURN QUERY SELECT o.store_id,o.user_id FROM public.store_primary_owners o;
END $function$;

-- Never accept the owner mapping alone as authorization. Re-evaluate the live
-- confirmed Auth account, authoritative admin role and active store every time.
CREATE OR REPLACE FUNCTION public.store_primary_owner_can_delegate(p_store_id bigint,p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
 SELECT EXISTS (
   SELECT 1 FROM public.store_primary_owners o
   JOIN public.admin_users a ON a.user_id=o.user_id
   JOIN auth.users u ON u.id=a.user_id
   JOIN public.stores s ON s.id=o.store_id
   WHERE o.store_id=p_store_id AND o.user_id=p_actor_id
     AND a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
     AND s.onboarding_status='READY' AND s.is_active
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
     AND (u.banned_until IS NULL OR u.banned_until<now())
 );
$function$;

CREATE OR REPLACE FUNCTION public.store_delegated_manager_list(p_store_id bigint)
RETURNS TABLE(user_id uuid,email text,manager_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
BEGIN
  IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  RETURN QUERY SELECT a.user_id,a.email,
    CASE WHEN o.user_id=a.user_id THEN 'OWNER'::text ELSE 'MANAGER'::text END
  FROM public.admin_users a
  LEFT JOIN public.store_primary_owners o ON o.store_id=a.store_id
  WHERE a.store_id=p_store_id AND a.admin_role='STORE_MANAGER'
  ORDER BY 3 DESC,2;
END $function$;

CREATE OR REPLACE FUNCTION public.store_delegated_manager_change(
  p_store_id bigint,p_email text,p_user_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_target uuid;v_email text;v_status text;v_active boolean;v_count int;
BEGIN
  IF NOT (public.is_hq_admin() OR
          public.store_primary_owner_can_delegate(p_store_id,auth.uid()))
  THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
  IF p_action NOT IN ('ADD','REVOKE') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  SELECT onboarding_status,is_active INTO v_status,v_active
  FROM public.stores WHERE id=p_store_id FOR UPDATE;
  IF NOT FOUND OR v_status='SUSPENDED' THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
  IF NOT public.is_hq_admin() AND (v_status<>'READY' OR NOT v_active)
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

-- Separate invitation binding for store owners; existing HQ-only invitation
-- remains unchanged. Only trusted Edge server service_role may call this.
CREATE OR REPLACE FUNCTION public.service_store_delegated_manager_attach_invited_user(
  p_store_id bigint,p_user_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_email text;v_role text;v_store bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','')<>'service_role'
  THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
  IF NOT public.store_primary_owner_can_delegate(p_store_id,p_actor_id)
  THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u WHERE u.id=p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'AUTH_USER_NOT_FOUND'; END IF;
  SELECT a.admin_role,a.store_id INTO v_role,v_store FROM public.admin_users a
  WHERE a.user_id=p_user_id;
  IF v_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
  IF v_role IS NOT NULL AND (v_role<>'STORE_MANAGER' OR v_store IS DISTINCT FROM p_store_id)
  THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
  IF v_role IS NULL THEN
    INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
    VALUES(p_user_id,v_email,'Invited by store primary owner','STORE_MANAGER',p_store_id);
  END IF;
  RETURN jsonb_build_object('ok',true,'user_id',p_user_id,
    'store_id',p_store_id,'role','STORE_MANAGER','already_assigned',v_role='STORE_MANAGER');
END $function$;

REVOKE ALL ON FUNCTION public.hq_store_primary_owner_set(bigint,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_primary_owner_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_primary_owner_can_delegate(bigint,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.store_delegated_manager_list(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_delegated_manager_change(bigint,text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.service_store_delegated_manager_attach_invited_user(bigint,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hq_store_primary_owner_set(bigint,uuid),
  public.hq_store_primary_owner_list(),
  public.store_delegated_manager_list(bigint),
  public.store_delegated_manager_change(bigint,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_primary_owner_can_delegate(bigint,uuid),
  public.service_store_delegated_manager_attach_invited_user(bigint,uuid,uuid) TO service_role;
