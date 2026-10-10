-- Headquarters controls store onboarding and the assignment of existing Auth users.
-- A store cannot become READY without at least one scoped owner account.
CREATE OR REPLACE FUNCTION public.hq_store_register(p_name text,p_code text,p_region_group text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id bigint;v_name text;v_code text;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 v_name:=btrim(coalesce(p_name,''));v_code:=upper(btrim(coalesce(p_code,'')));
 IF length(v_name) NOT BETWEEN 2 AND 80 OR v_code !~ '^[A-Z0-9_]{3,32}$' OR length(coalesce(p_region_group,''))>80
 THEN RAISE EXCEPTION 'INVALID_STORE_DETAILS'; END IF;
 IF EXISTS(SELECT 1 FROM public.stores WHERE name=v_name OR code=v_code)
 THEN RAISE EXCEPTION 'STORE_ALREADY_EXISTS'; END IF;
 INSERT INTO public.stores(name,code,region_group,is_active,onboarding_status)
 VALUES(v_name,v_code,NULLIF(btrim(p_region_group),''),false,'STAGED')
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'store_id',v_id,'code',v_code,'status','STAGED');
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_store_manager_assign(p_email text,p_store_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_uid uuid;v_existing_role text;v_existing_store bigint;v_email text;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 v_email:=lower(btrim(coalesce(p_email,'')));
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR length(v_email)>254
 THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND onboarding_status<>'SUSPENDED')
 THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT u.id INTO v_uid FROM auth.users u WHERE lower(btrim(u.email))=v_email;
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','AUTH_USER_NOT_FOUND'); END IF;
 SELECT a.admin_role,a.store_id INTO v_existing_role,v_existing_store
 FROM public.admin_users a WHERE a.user_id=v_uid;
 IF v_existing_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
 IF v_existing_role IS NOT NULL AND
    (v_existing_role<>'STORE_MANAGER' OR v_existing_store IS DISTINCT FROM p_store_id)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 IF v_existing_role IS NULL THEN
  INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
  VALUES(v_uid,v_email,'Store manager assigned by HQ','STORE_MANAGER',p_store_id);
 END IF;
 RETURN jsonb_build_object('ok',true,'user_id',v_uid,'store_id',p_store_id,'role','STORE_MANAGER',
                           'already_assigned',v_existing_role='STORE_MANAGER');
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_store_onboarding_set(p_store_id bigint,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_name text;v_count bigint;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_status NOT IN ('STAGED','READY','SUSPENDED') OR p_store_id IS NULL
 THEN RAISE EXCEPTION 'BAD_ONBOARDING_STATUS'; END IF;
 IF p_store_id=1 AND p_status<>'READY' THEN RAISE EXCEPTION 'INHA_PRODUCTION_LOCK'; END IF;
 PERFORM 1 FROM public.stores WHERE id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
 SELECT count(*) INTO v_count FROM public.admin_users
  WHERE admin_role='STORE_MANAGER' AND store_id=p_store_id;
 IF p_status='READY' AND p_store_id<>1 AND v_count<1
 THEN RAISE EXCEPTION 'STORE_MANAGER_REQUIRED'; END IF;
 UPDATE public.stores
 SET onboarding_status=p_status,is_active=(p_status='READY')
 WHERE id=p_store_id RETURNING name INTO v_name;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'name',v_name,'status',p_status,
  'manager_count',v_count);
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_store_manager_list()
RETURNS TABLE(user_id uuid,email text,store_id bigint,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT a.user_id,a.email,a.store_id,s.name
 FROM public.admin_users a JOIN public.stores s ON s.id=a.store_id
 WHERE a.admin_role='STORE_MANAGER' ORDER BY s.name,a.email;
END $fn$;

CREATE OR REPLACE FUNCTION public.hq_store_manager_revoke(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id bigint;v_status text;v_count int;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT a.store_id INTO v_id FROM public.admin_users a
 WHERE a.user_id=p_user_id AND a.admin_role='STORE_MANAGER';
 IF v_id IS NULL THEN RAISE EXCEPTION 'STORE_MANAGER_NOT_FOUND'; END IF;
 SELECT onboarding_status INTO v_status FROM public.stores WHERE id=v_id FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.admin_users WHERE admin_role='STORE_MANAGER' AND store_id=v_id;
 IF v_status='READY' AND v_count<=1 THEN RAISE EXCEPTION 'CANNOT_REVOKE_LAST_READY_MANAGER'; END IF;
 DELETE FROM public.admin_users WHERE user_id=p_user_id AND admin_role='STORE_MANAGER';
 RETURN jsonb_build_object('ok',true,'store_id',v_id);
END $fn$;

REVOKE ALL ON FUNCTION public.hq_store_register(text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_manager_assign(text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_onboarding_set(bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_manager_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_manager_revoke(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_register(text,text,text),
 public.hq_store_manager_assign(text,bigint),public.hq_store_onboarding_set(bigint,text),
 public.hq_store_manager_list(),public.hq_store_manager_revoke(uuid) TO authenticated,service_role;
