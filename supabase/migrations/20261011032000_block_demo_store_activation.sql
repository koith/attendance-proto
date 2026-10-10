CREATE OR REPLACE FUNCTION public.hq_store_onboarding_set(p_store_id bigint, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 IF p_status='READY' AND p_store_id<>1 AND EXISTS(
   SELECT 1 FROM public.employees e WHERE e.store_id=p_store_id
   AND (coalesce(e.memo,'') ILIKE '%데모%' OR e.name ILIKE '%테스트%')
 ) THEN RAISE EXCEPTION 'DEMO_EMPLOYEES_REQUIRE_REVIEW'; END IF;
 IF p_status='READY' AND p_store_id<>1 AND v_count<1
 THEN RAISE EXCEPTION 'STORE_MANAGER_REQUIRED'; END IF;
 UPDATE public.stores
 SET onboarding_status=p_status,is_active=(p_status='READY')
 WHERE id=p_store_id RETURNING name INTO v_name;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'name',v_name,'status',p_status,
  'manager_count',v_count);
END $function$;