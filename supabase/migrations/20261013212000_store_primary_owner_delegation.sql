-- Delegated managers: separate ownership from day-to-day STORE_MANAGER privileges.
-- No existing account is automatically promoted.
CREATE TABLE IF NOT EXISTS public.store_primary_owners(
 store_id bigint PRIMARY KEY REFERENCES public.stores(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 appointed_at timestamptz NOT NULL DEFAULT now(),
 appointed_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.store_primary_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_primary_owners FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hq_store_primary_owner_set(p_store_id bigint,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
   WHERE a.user_id=p_user_id AND a.store_id=p_store_id AND a.admin_role='STORE_MANAGER'
   AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
   AND (u.banned_until IS NULL OR u.banned_until<now()))
 THEN RAISE EXCEPTION 'CONFIRMED_STORE_MANAGER_REQUIRED'; END IF;
 INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
 VALUES(p_store_id,p_user_id,auth.uid())
 ON CONFLICT(store_id) DO UPDATE SET user_id=excluded.user_id,
 appointed_at=now(),appointed_by=excluded.appointed_by;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.store_delegated_manager_list(p_store_id bigint)
RETURNS TABLE(user_id uuid,email text,manager_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT a.user_id,a.email,
 CASE WHEN o.user_id=a.user_id THEN 'OWNER' ELSE 'MANAGER' END
 FROM public.admin_users a LEFT JOIN public.store_primary_owners o ON o.store_id=a.store_id
 WHERE a.store_id=p_store_id AND a.admin_role='STORE_MANAGER' ORDER BY 3 DESC,2;
END $$;

CREATE OR REPLACE FUNCTION public.store_delegated_manager_change(
 p_store_id bigint,p_email text,p_user_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_target uuid;v_email text;
BEGIN
 IF NOT (public.is_hq_admin() OR EXISTS(
 SELECT 1 FROM public.store_primary_owners o
 JOIN public.stores s ON s.id=o.store_id
 WHERE o.store_id=p_store_id AND o.user_id=auth.uid()
 AND s.is_active AND s.onboarding_status='READY'))
 THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 IF p_action NOT IN ('ADD','REVOKE') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 IF p_action='ADD' THEN
  v_email:=lower(btrim(coalesce(p_email,'')));
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
  SELECT id INTO v_target FROM auth.users WHERE lower(btrim(email))=v_email
   AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND NOT is_anonymous
   AND (banned_until IS NULL OR banned_until<now());
  IF v_target IS NULL THEN RAISE EXCEPTION 'CONFIRMED_ACCOUNT_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=v_target
    AND (admin_role<>'STORE_MANAGER' OR store_id IS DISTINCT FROM p_store_id))
  THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
  INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
  VALUES(v_target,v_email,'Delegated by store primary owner','STORE_MANAGER',p_store_id)
  ON CONFLICT(user_id) DO NOTHING;
 ELSE
  v_target:=p_user_id;
  IF v_target IS NULL OR v_target=auth.uid() OR EXISTS(
   SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id AND user_id=v_target)
  THEN RAISE EXCEPTION 'CANNOT_REVOKE_OWNER_OR_SELF'; END IF;
  DELETE FROM public.store_admin_memberships WHERE user_id=v_target AND store_id=p_store_id;
  DELETE FROM public.admin_users WHERE user_id=v_target
    AND store_id=p_store_id AND admin_role='STORE_MANAGER';
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGER_NOT_FOUND'; END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',v_target,'action',p_action);
END $$;
REVOKE ALL ON FUNCTION public.hq_store_primary_owner_set(bigint,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_delegated_manager_list(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_delegated_manager_change(bigint,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_primary_owner_set(bigint,uuid),
 public.store_delegated_manager_list(bigint),
 public.store_delegated_manager_change(bigint,text,uuid,text) TO authenticated;
