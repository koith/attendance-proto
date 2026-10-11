-- Owner invitations alone cannot activate stores; the email must be confirmed.
-- Disabled/banned/deleted accounts do not retain manager or HQ permissions.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
 SELECT EXISTS(
   SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
   WHERE a.user_id=(SELECT auth.uid()) AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL AND NOT u.is_anonymous
     AND (u.banned_until IS NULL OR u.banned_until<now())
 );
$function$;

CREATE OR REPLACE FUNCTION public.is_hq_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
 SELECT EXISTS(
   SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
   WHERE a.user_id=(SELECT auth.uid()) AND a.admin_role='HQ'
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
 );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
 SELECT EXISTS(
   SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
   WHERE a.user_id=(SELECT auth.uid())
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
     AND (a.admin_role='HQ' OR
       (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id AND
         EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id
                AND s.is_active AND s.onboarding_status='READY')))
 );
$function$;

CREATE OR REPLACE FUNCTION public.hq_store_manager_revoke(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_id bigint; v_status text; v_confirmed_remaining int;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT a.store_id INTO v_id FROM public.admin_users a
 WHERE a.user_id=p_user_id AND a.admin_role='STORE_MANAGER';
 IF v_id IS NULL THEN RAISE EXCEPTION 'STORE_MANAGER_NOT_FOUND'; END IF;
 SELECT onboarding_status INTO v_status FROM public.stores WHERE id=v_id FOR UPDATE;
 SELECT count(*) INTO v_confirmed_remaining FROM public.admin_users a
 JOIN auth.users u ON u.id=a.user_id
 WHERE a.admin_role='STORE_MANAGER' AND a.store_id=v_id AND a.user_id<>p_user_id
   AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
   AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now());
 IF v_status='READY' AND v_confirmed_remaining<1 THEN
   RAISE EXCEPTION 'CANNOT_REVOKE_LAST_READY_MANAGER';
 END IF;
 DELETE FROM public.store_admin_memberships WHERE user_id=p_user_id;
 DELETE FROM public.admin_users
 WHERE user_id=p_user_id AND admin_role='STORE_MANAGER' AND store_id=v_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_MANAGER_REVOKE_FAILED'; END IF;
 RETURN jsonb_build_object('ok',true,'store_id',v_id);
END $function$;

CREATE OR REPLACE FUNCTION public.hq_stores_onboarding_list()
RETURNS TABLE(id bigint,name text,code text,region_group text,
              is_active boolean,onboarding_status text,manager_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT s.id,s.name,s.code,s.region_group,s.is_active,s.onboarding_status,
   (SELECT count(*) FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
    WHERE a.store_id=s.id AND a.admin_role='STORE_MANAGER'
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now()))
 FROM public.stores s ORDER BY s.name,s.id;
END $function$;

CREATE OR REPLACE FUNCTION public.hq_store_onboarding_set(p_store_id bigint,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
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
             AND (coalesce(e.memo,'') ILIKE '%데모%' OR e.name ILIKE '%테스트%'))
   THEN RAISE EXCEPTION 'DEMO_EMPLOYEES_REQUIRE_REVIEW'; END IF;
   IF v_count<1 THEN RAISE EXCEPTION 'CONFIRMED_STORE_MANAGER_REQUIRED'; END IF;
 END IF;
 UPDATE public.stores SET onboarding_status=p_status,
   is_active=(p_status='READY') WHERE id=p_store_id;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'name',v_name,
                           'status',p_status,'manager_count',v_count,
                           'provenance_verified',p_store_id=1 OR v_review='VERIFIED');
END $function$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.is_hq_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.can_manage_store(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_store_manager_revoke(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hq_stores_onboarding_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hq_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_store(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_store_manager_revoke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_stores_onboarding_list() TO authenticated;
