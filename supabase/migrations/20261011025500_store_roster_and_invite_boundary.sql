-- Headquarters-only complete roster (including staged stores) and an invited-user binding boundary.
CREATE OR REPLACE FUNCTION public.hq_stores_onboarding_list()
RETURNS TABLE(id bigint,name text,code text,region_group text,is_active boolean,onboarding_status text,manager_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT s.id,s.name,s.code,s.region_group,s.is_active,s.onboarding_status,
 (SELECT count(*) FROM public.admin_users a WHERE a.store_id=s.id AND a.admin_role='STORE_MANAGER')
 FROM public.stores s ORDER BY s.name,s.id;
END $fn$;
REVOKE ALL ON FUNCTION public.hq_stores_onboarding_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_stores_onboarding_list() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.service_store_manager_attach_invited_user(
 p_store_id bigint,p_user_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_email text;v_role text;v_store bigint;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a
 WHERE a.user_id=p_actor_id AND a.admin_role='HQ') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores s
 WHERE s.id=p_store_id AND s.onboarding_status<>'SUSPENDED')
 THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
 SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u WHERE u.id=p_user_id;
 IF v_email IS NULL THEN RAISE EXCEPTION 'AUTH_USER_NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT a.admin_role,a.store_id INTO v_role,v_store
 FROM public.admin_users a WHERE a.user_id=p_user_id;
 IF v_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
 IF v_role IS NOT NULL AND (v_role<>'STORE_MANAGER' OR v_store IS DISTINCT FROM p_store_id)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 IF v_role IS NULL THEN
  INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
  VALUES(p_user_id,v_email,'Invited by HQ for store operation','STORE_MANAGER',p_store_id);
 END IF;
 RETURN jsonb_build_object('ok',true,'user_id',p_user_id,'store_id',p_store_id,'role','STORE_MANAGER',
 'already_assigned',v_role='STORE_MANAGER');
END $fn$;
REVOKE ALL ON FUNCTION public.service_store_manager_attach_invited_user(bigint,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_store_manager_attach_invited_user(bigint,uuid,uuid) TO service_role;
