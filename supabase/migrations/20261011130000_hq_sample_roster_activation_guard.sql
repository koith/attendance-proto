-- User data safety: seeded samples are never automatically promoted to live branch rosters.
-- 2026-10-11 snapshot: 893 seed employees across 282 STAGED stores,
-- 719 of them marked '샘플' rather than '데모'; old gate missed these.
-- Only add a guard; never delete, rewrite, or activate any employee/store.
CREATE OR REPLACE FUNCTION public.hq_store_onboarding_set(p_store_id bigint, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_name text;v_count bigint;v_review text;v_source text;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_status NOT IN ('STAGED','READY','SUSPENDED') OR p_store_id IS NULL
 THEN RAISE EXCEPTION 'BAD_ONBOARDING_STATUS'; END IF;
 IF p_store_id=1 AND p_status<>'READY' THEN RAISE EXCEPTION 'INHA_PRODUCTION_LOCK'; END IF;
 SELECT s.name,s.source_store_key INTO v_name,v_source
   FROM public.stores s WHERE s.id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
 SELECT count(*) INTO v_count FROM public.admin_users a
   JOIN auth.users u ON u.id=a.user_id
   WHERE a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now());
 IF p_status='READY' AND p_store_id<>1 THEN
   SELECT r.decision INTO v_review FROM public.store_provenance_reviews r
     WHERE r.store_id=p_store_id ORDER BY r.id DESC LIMIT 1;
   IF v_review IS DISTINCT FROM 'VERIFIED' THEN
     RAISE EXCEPTION 'PROVENANCE_VERIFICATION_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM public.employees e WHERE e.store_id=p_store_id
             AND (coalesce(e.memo,'') ILIKE '%데모%' OR coalesce(e.memo,'') ILIKE '%샘플%' OR e.name ILIKE '%테스트%'))
   THEN RAISE EXCEPTION 'DEMO_EMPLOYEES_REQUIRE_REVIEW'; END IF;
   IF v_count<1 THEN RAISE EXCEPTION 'CONFIRMED_STORE_MANAGER_REQUIRED'; END IF;
 END IF;
 UPDATE public.stores SET onboarding_status=p_status,
   is_active=(p_status='READY') WHERE id=p_store_id;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'name',v_name,
                           'status',p_status,'manager_count',v_count,
                           'provenance_verified',p_store_id=1 OR v_review='VERIFIED');
END $function$;

-- HQ-only read-only rollout blocker counts to help verify branches before activation.
CREATE OR REPLACE FUNCTION public.hq_store_sample_roster_counts()
RETURNS TABLE(store_id bigint,sample_employee_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT e.store_id,count(*)::bigint
 FROM public.employees e
 WHERE e.store_id<>1 AND (
   coalesce(e.memo,'') ILIKE '%데모%' OR
   coalesce(e.memo,'') ILIKE '%샘플%' OR
   e.name ILIKE '%테스트%'
 )
 GROUP BY e.store_id;
END $function$;
REVOKE ALL ON FUNCTION public.hq_store_sample_roster_counts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_sample_roster_counts() TO authenticated;
