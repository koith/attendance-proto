-- #1435 2026-10-31: dual HQ + store-1 primary owner, preserving HQ authorization.
-- User-approved store account: sso0ng0612@gmail.com.
-- No auth password, employee, payroll, recipe or other store rows are modified.
BEGIN;
DO $$
DECLARE v_owner uuid; v_old uuid; v_role text; v_store bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT u.id INTO STRICT v_owner FROM auth.users u
 WHERE lower(btrim(u.email))='sso0ng0612@gmail.com'
   AND u.email_confirmed_at IS NOT NULL
   AND coalesce(length(u.encrypted_password),0)>0
   AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
   AND (u.banned_until IS NULL OR u.banned_until<now());
 SELECT a.admin_role,a.store_id INTO STRICT v_role,v_store FROM public.admin_users a
 WHERE a.user_id=v_owner FOR UPDATE;
 IF v_role<>'HQ' OR v_store IS NOT NULL THEN
   RAISE EXCEPTION 'EXISTING_HQ_ROLE_CHANGED_ABORT';
 END IF;
 PERFORM 1 FROM public.stores s WHERE s.id=1 AND s.onboarding_status='READY'
 AND s.is_active IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INHA_STORE_NOT_READY'; END IF;
 SELECT o.user_id INTO v_old FROM public.store_primary_owners o
 WHERE o.store_id=1 FOR UPDATE;
 IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_owner THEN
   RAISE EXCEPTION 'INHA_HAS_DIFFERENT_PRIMARY_OWNER';
 END IF;
 IF EXISTS(SELECT 1 FROM public.store_admin_memberships m
           WHERE m.store_id=1 AND m.role='OWNER' AND m.user_id<>v_owner) THEN
   RAISE EXCEPTION 'INHA_HAS_DIFFERENT_OWNER_MEMBERSHIP';
 END IF;
 INSERT INTO public.store_admin_memberships(store_id,user_id,role,assigned_by)
 VALUES(1,v_owner,'OWNER',v_owner)
 ON CONFLICT(store_id,user_id) DO UPDATE SET role='OWNER';
 INSERT INTO public.store_primary_owners(store_id,user_id)
 VALUES(1,v_owner)
 ON CONFLICT(store_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=1 AND user_id=v_owner)
 THEN RAISE EXCEPTION 'INHA_OWNER_LINK_NOT_VERIFIED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=v_owner AND admin_role='HQ' AND store_id IS NULL)
 THEN RAISE EXCEPTION 'HQ_ROLE_MUST_REMAIN'; END IF;
END $$;

-- OWNER is an additional explicit store role, not a replacement for the HQ role.
CREATE OR REPLACE FUNCTION public.store_primary_owner_can_delegate(p_store_id bigint,p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
 SELECT EXISTS (
   SELECT 1 FROM public.store_primary_owners o
   JOIN public.admin_users a ON a.user_id=o.user_id
   JOIN auth.users u ON u.id=a.user_id
   JOIN public.stores s ON s.id=o.store_id
   WHERE o.store_id=p_store_id AND o.user_id=p_actor_id
     AND ( (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id)
        OR (p_store_id=1 AND a.admin_role='HQ' AND a.store_id IS NULL
            AND EXISTS (SELECT 1 FROM public.store_admin_memberships m
                         WHERE m.store_id=1 AND m.user_id=a.user_id AND m.role='OWNER')) )
     AND s.onboarding_status='READY' AND s.is_active
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now())
 );
$function$;

-- Manager list must display the dual-role owner even though their HQ admin_users.store_id is NULL.
CREATE OR REPLACE FUNCTION public.store_delegated_manager_list(p_store_id bigint)
RETURNS TABLE(user_id uuid,email text,manager_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT a.user_id,a.email,
   CASE WHEN o.user_id=a.user_id THEN 'OWNER'::text ELSE 'MANAGER'::text END
 FROM public.admin_users a
 LEFT JOIN public.store_primary_owners o ON o.store_id=a.store_id
 WHERE a.store_id=p_store_id AND a.admin_role='STORE_MANAGER'
 UNION ALL
 SELECT a.user_id,u.email,'OWNER'::text
 FROM public.store_primary_owners o
 JOIN public.store_admin_memberships m ON m.store_id=o.store_id
  AND m.user_id=o.user_id AND m.role='OWNER'
 JOIN public.admin_users a ON a.user_id=o.user_id AND a.admin_role='HQ' AND a.store_id IS NULL
 JOIN auth.users u ON u.id=a.user_id
 WHERE p_store_id=1 AND o.store_id=1 AND u.email_confirmed_at IS NOT NULL
 AND u.deleted_at IS NULL AND NOT u.is_anonymous
 AND (u.banned_until IS NULL OR u.banned_until<now());
END $function$;

-- HQ global manager directory adds only the explicitly mapped store-1 dual owner.
CREATE OR REPLACE FUNCTION public.hq_store_manager_list()
RETURNS TABLE(user_id uuid,email text,store_id bigint,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT a.user_id,a.email,a.store_id,s.name
 FROM public.admin_users a JOIN public.stores s ON s.id=a.store_id
 WHERE a.admin_role='STORE_MANAGER'
 UNION ALL
 SELECT a.user_id,u.email,o.store_id,s.name
 FROM public.store_primary_owners o
 JOIN public.store_admin_memberships m ON m.store_id=o.store_id
   AND m.user_id=o.user_id AND m.role='OWNER'
 JOIN public.admin_users a ON a.user_id=o.user_id AND a.admin_role='HQ'
   AND a.store_id IS NULL
 JOIN auth.users u ON u.id=a.user_id
 JOIN public.stores s ON s.id=o.store_id
 WHERE o.store_id=1 AND u.email_confirmed_at IS NOT NULL
 AND u.deleted_at IS NULL AND NOT u.is_anonymous
 ORDER BY store_name,email;
END $function$;

-- Future HQ owner switching must never delete a global HQ account.
CREATE OR REPLACE FUNCTION public.hq_store_primary_owner_set(p_store_id bigint,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_outgoing uuid;v_role text;v_store bigint;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT a.admin_role,a.store_id INTO v_role,v_store
 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
 WHERE a.user_id=p_user_id AND u.email_confirmed_at IS NOT NULL AND
   u.deleted_at IS NULL AND NOT u.is_anonymous AND
   (u.banned_until IS NULL OR u.banned_until<now());
 IF NOT FOUND OR NOT (
   (v_role='STORE_MANAGER' AND v_store=p_store_id)
   OR (p_store_id=1 AND v_role='HQ' AND v_store IS NULL)
 ) THEN RAISE EXCEPTION 'CONFIRMED_STORE_MANAGER_REQUIRED'; END IF;
 SELECT o.user_id INTO v_outgoing FROM public.store_primary_owners o
 WHERE o.store_id=p_store_id FOR UPDATE;
 IF v_role='HQ' THEN
   INSERT INTO public.store_admin_memberships(store_id,user_id,role,assigned_by)
   VALUES(p_store_id,p_user_id,'OWNER',auth.uid())
   ON CONFLICT(store_id,user_id) DO UPDATE SET role='OWNER';
 END IF;
 INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by)
 VALUES(p_store_id,p_user_id,auth.uid())
 ON CONFLICT(store_id) DO UPDATE SET user_id=excluded.user_id,
   appointed_at=now(),appointed_by=excluded.appointed_by;
 DELETE FROM public.store_primary_owner_invitation_intents WHERE store_id=p_store_id;
 IF v_outgoing IS NOT NULL AND v_outgoing IS DISTINCT FROM p_user_id THEN
   DELETE FROM public.store_admin_memberships
   WHERE store_id=p_store_id AND user_id=v_outgoing;
   -- Existing STORE_MANAGER demotion behavior; no HQ deletion.
   DELETE FROM public.admin_users WHERE user_id=v_outgoing
   AND store_id=p_store_id AND admin_role='STORE_MANAGER';
 END IF;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id);
END $function$;
COMMIT;
