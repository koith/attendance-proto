-- Franchise store onboarding is opt-in. Only INHA is currently READY.
CREATE TABLE IF NOT EXISTS public.store_admin_memberships(
 store_id bigint NOT NULL REFERENCES public.stores(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('OWNER','MANAGER')),
 assigned_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,user_id)
);
ALTER TABLE public.store_admin_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_admin_memberships FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.store_admin_memberships TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.admin_users a
     WHERE a.user_id=(SELECT auth.uid()) AND
      (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id)))
 OR EXISTS(SELECT 1 FROM public.store_admin_memberships m
     JOIN public.stores s ON s.id=m.store_id
     WHERE m.user_id=(SELECT auth.uid()) AND m.store_id=p_store_id
       AND s.onboarding_status<>'SUSPENDED');
$fn$;

CREATE OR REPLACE FUNCTION public.hq_store_register(
 p_name text,p_code text,p_region_group text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id bigint;v_code text:=upper(btrim(coalesce(p_code,'')));
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 80 OR v_code !~ '^[A-Z0-9_]{3,32}$'
 THEN RAISE EXCEPTION 'INVALID_STORE_PROFILE'; END IF;
 IF EXISTS(SELECT 1 FROM public.stores WHERE code=v_code OR name=btrim(p_name))
 THEN RAISE EXCEPTION 'STORE_ALREADY_REGISTERED'; END IF;
 INSERT INTO public.stores(name,code,source_store_key,region_group,is_active,onboarding_status)
 VALUES(btrim(p_name),v_code,NULL,NULLIF(btrim(p_region_group),''),false,'STAGED')
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'store_id',v_id,'store_code',v_code,'status','STAGED');
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_assign_store_manager(
 p_store_id bigint,p_email text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_uid uuid;v_email text:=lower(btrim(coalesce(p_email,'')));v_existing record;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND onboarding_status<>'SUSPENDED')
 THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 THEN RAISE EXCEPTION 'INVALID_OWNER_EMAIL'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('store-manager:'||v_email,0));
 SELECT id INTO v_uid FROM auth.users WHERE lower(email)=v_email AND email_confirmed_at IS NOT NULL;
 IF v_uid IS NULL THEN RAISE EXCEPTION 'VERIFIED_AUTH_USER_NOT_FOUND'; END IF;
 SELECT * INTO v_existing FROM public.admin_users WHERE user_id=v_uid;
 IF v_existing.admin_role='HQ' THEN RAISE EXCEPTION 'HQ_ROLE_IMMUTABLE'; END IF;
 IF NOT FOUND OR v_existing.user_id IS NULL THEN
  INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
  VALUES(v_uid,v_email,'registered franchise manager','STORE_MANAGER',p_store_id);
 END IF;
 INSERT INTO public.store_admin_memberships(store_id,user_id,role,assigned_by)
 VALUES(p_store_id,v_uid,'OWNER',auth.uid())
 ON CONFLICT(store_id,user_id) DO UPDATE SET role='OWNER';
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'assigned',true);
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_store_activate(p_store_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.onboarding_status='STAGED'
   AND (s.source_store_key IS NULL OR (s.source_store_key NOT LIKE 'demo_%' AND s.source_store_key<>'official_demo'))
 ) THEN RAISE EXCEPTION 'STORE_NOT_READY_FOR_ACTIVATION'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_admin_memberships
  WHERE store_id=p_store_id AND role='OWNER') THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
 UPDATE public.stores SET is_active=true,onboarding_status='READY' WHERE id=p_store_id;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'status','READY');
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_store_suspend(p_store_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_store_id=1 THEN RAISE EXCEPTION 'PILOT_STORE_PROTECTED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND onboarding_status='READY')
 THEN RAISE EXCEPTION 'STORE_NOT_ACTIVE'; END IF;
 UPDATE public.stores SET is_active=false,onboarding_status='SUSPENDED' WHERE id=p_store_id;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'status','SUSPENDED');
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_store_catalog()
RETURNS TABLE(id bigint,name text,code text,region_group text,onboarding_status text,
 is_active boolean,owners bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT s.id,s.name,s.code,s.region_group,s.onboarding_status,s.is_active,
 (SELECT count(*) FROM public.store_admin_memberships m WHERE m.store_id=s.id AND m.role='OWNER')
 FROM public.stores s ORDER BY s.region_group,s.name;
END $fn$;

REVOKE ALL ON FUNCTION public.hq_store_register(text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_assign_store_manager(bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_activate(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_suspend(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_register(text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hq_assign_store_manager(bigint,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hq_store_activate(bigint) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hq_store_suspend(bigint) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hq_store_catalog() TO authenticated,service_role;
