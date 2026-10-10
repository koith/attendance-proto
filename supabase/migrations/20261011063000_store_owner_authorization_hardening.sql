-- Hardening for Baekeok store owners: one authoritative admin_users mapping.
-- No production employee/payroll data is modified by this migration.
-- Legacy store_admin_memberships previously bypassed owner revocation.
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id=(SELECT auth.uid())
      AND (a.admin_role='HQ'
           OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
             AND EXISTS(SELECT 1 FROM public.stores s
                        WHERE s.id=p_store_id AND s.is_active
                          AND s.onboarding_status='READY')))
  );
$function$;

-- Keep the old entrypoint, but never mint parallel authorizations.
CREATE OR REPLACE FUNCTION public.hq_assign_store_manager(p_store_id bigint,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN public.hq_store_manager_assign(p_email,p_store_id);
END $function$;

-- All revocations remove legacy grants as defense in depth, atomically.
CREATE OR REPLACE FUNCTION public.hq_store_manager_revoke(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id bigint; v_status text; v_count int;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT a.store_id INTO v_id FROM public.admin_users a
 WHERE a.user_id=p_user_id AND a.admin_role='STORE_MANAGER';
 IF v_id IS NULL THEN RAISE EXCEPTION 'STORE_MANAGER_NOT_FOUND'; END IF;
 SELECT onboarding_status INTO v_status FROM public.stores WHERE id=v_id FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.admin_users
 WHERE admin_role='STORE_MANAGER' AND store_id=v_id;
 IF v_status='READY' AND v_count<=1 THEN
   RAISE EXCEPTION 'CANNOT_REVOKE_LAST_READY_MANAGER';
 END IF;
 DELETE FROM public.store_admin_memberships WHERE user_id=p_user_id;
 DELETE FROM public.admin_users
 WHERE user_id=p_user_id AND admin_role='STORE_MANAGER' AND store_id=v_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_MANAGER_REVOKE_FAILED'; END IF;
 RETURN jsonb_build_object('ok',true,'store_id',v_id);
END $function$;

-- READY is restricted to real, reviewed stores with an owner.
-- Imported demo records must not be made live via either legacy or modern APIs.
CREATE OR REPLACE FUNCTION public.hq_store_onboarding_set(p_store_id bigint,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_name text; v_count bigint; v_source text;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_status NOT IN ('STAGED','READY','SUSPENDED') OR p_store_id IS NULL
 THEN RAISE EXCEPTION 'BAD_ONBOARDING_STATUS'; END IF;
 IF p_store_id=1 AND p_status<>'READY' THEN RAISE EXCEPTION 'INHA_PRODUCTION_LOCK'; END IF;
 SELECT s.name,s.source_store_key INTO v_name,v_source
 FROM public.stores s WHERE s.id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
 SELECT count(*) INTO v_count FROM public.admin_users
 WHERE admin_role='STORE_MANAGER' AND store_id=p_store_id;
 IF p_status='READY' AND p_store_id<>1 THEN
   IF lower(coalesce(v_source,'')) LIKE 'demo_%'
      OR lower(coalesce(v_source,''))='official_demo' THEN
      RAISE EXCEPTION 'DEMO_SOURCE_REQUIRES_REVIEW';
   END IF;
   IF EXISTS(SELECT 1 FROM public.employees e WHERE e.store_id=p_store_id
             AND (coalesce(e.memo,'') ILIKE '%데모%' OR e.name ILIKE '%테스트%'))
   THEN RAISE EXCEPTION 'DEMO_EMPLOYEES_REQUIRE_REVIEW'; END IF;
   IF v_count<1 THEN RAISE EXCEPTION 'STORE_MANAGER_REQUIRED'; END IF;
 END IF;
 UPDATE public.stores SET onboarding_status=p_status,
   is_active=(p_status='READY') WHERE id=p_store_id;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'name',v_name,
    'status',p_status,'manager_count',v_count);
END $function$;

-- The deprecated activation shortcut now uses the identical READY gate.
CREATE OR REPLACE FUNCTION public.hq_store_activate(p_store_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores
     WHERE id=p_store_id AND onboarding_status='STAGED')
 THEN RAISE EXCEPTION 'STORE_NOT_READY_FOR_ACTIVATION'; END IF;
 RETURN public.hq_store_onboarding_set(p_store_id,'READY');
END $function$;

-- Consistent owner counts with the authoritative account table.
CREATE OR REPLACE FUNCTION public.hq_store_catalog()
RETURNS TABLE(id bigint,name text,code text,region_group text,
              onboarding_status text,is_active boolean,owners bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT s.id,s.name,s.code,s.region_group,s.onboarding_status,
   s.is_active,(SELECT count(*) FROM public.admin_users a
                WHERE a.store_id=s.id AND a.admin_role='STORE_MANAGER')
 FROM public.stores s ORDER BY s.region_group,s.name;
END $function$;

REVOKE ALL ON FUNCTION public.can_manage_store(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_assign_store_manager(bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_manager_revoke(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_onboarding_set(bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_activate(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_assign_store_manager(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_store_manager_revoke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_store_onboarding_set(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_store_activate(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_store_catalog() TO authenticated;
