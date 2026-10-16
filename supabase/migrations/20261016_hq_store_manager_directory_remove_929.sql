-- #929: HQ directory and atomic scoped manager revocation.
-- Retains auth.users and all business records; revocation is store authorization only.
CREATE OR REPLACE FUNCTION public.hq_store_manager_directory()
RETURNS TABLE(store_id bigint,user_id uuid,email text,intended_role text,account_state text,registered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT a.store_id,a.user_id,a.email,
 CASE WHEN o.user_id IS NOT NULL OR i.user_id IS NOT NULL THEN 'OWNER'::text
      WHEN d.user_id IS NOT NULL OR a.note IN
       ('Invited by store primary owner','Invited by HQ as assistant','Delegated store administrator')
      THEN 'ASSISTANT'::text ELSE 'UNCLASSIFIED'::text END AS intended_role,
 CASE WHEN o.user_id IS NOT NULL THEN 'ACTIVE'::text
      WHEN i.user_id IS NOT NULL AND i.expires_at <= now() THEN 'EXPIRED'::text
      WHEN i.user_id IS NOT NULL THEN 'PENDING'::text
      WHEN u.email_confirmed_at IS NULL OR coalesce(length(u.encrypted_password),0)=0
       OR u.deleted_at IS NOT NULL OR u.is_anonymous
       OR (u.banned_until IS NOT NULL AND u.banned_until>now())
      THEN 'PENDING'::text ELSE 'ACTIVE'::text END AS account_state,
 a.created_at
 FROM public.admin_users a
 JOIN auth.users u ON u.id=a.user_id
 LEFT JOIN public.store_primary_owners o
   ON o.store_id=a.store_id AND o.user_id=a.user_id
 LEFT JOIN public.store_primary_owner_invitation_intents i
   ON i.store_id=a.store_id AND i.user_id=a.user_id
 LEFT JOIN public.store_delegated_permissions d
   ON d.store_id=a.store_id AND d.user_id=a.user_id
 WHERE a.admin_role='STORE_MANAGER' AND a.store_id IS NOT NULL
 ORDER BY a.store_id,(o.user_id IS NULL),a.created_at,a.user_id;
END $fn$;
REVOKE ALL ON FUNCTION public.hq_store_manager_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_manager_directory() TO authenticated;

CREATE TABLE IF NOT EXISTS public.hq_store_manager_revocation_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store_id bigint NOT NULL REFERENCES public.stores(id),
 user_id uuid NOT NULL,
 email text,
 revoked_role text NOT NULL CHECK (revoked_role IN ('OWNER','ASSISTANT','UNCLASSIFIED')),
 revoked_by uuid NOT NULL REFERENCES auth.users(id),
 revoked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hq_store_manager_revocation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hq_store_manager_revocation_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.hq_store_manager_revocation_audit TO service_role;

CREATE OR REPLACE FUNCTION public.hq_store_manager_remove(p_store_id bigint,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_email text;v_role text;v_is_owner boolean;v_is_pending_owner boolean;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_store_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 PERFORM 1 FROM public.stores WHERE id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
 SELECT a.email INTO v_email FROM public.admin_users a
 WHERE a.store_id=p_store_id AND a.user_id=p_user_id AND a.admin_role='STORE_MANAGER' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_MANAGER_NOT_FOUND'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.store_primary_owners o
   WHERE o.store_id=p_store_id AND o.user_id=p_user_id) INTO v_is_owner;
 SELECT EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents i
   WHERE i.store_id=p_store_id AND i.user_id=p_user_id) INTO v_is_pending_owner;
 v_role:=CASE WHEN v_is_owner OR v_is_pending_owner THEN 'OWNER'
             WHEN EXISTS(SELECT 1 FROM public.store_delegated_permissions d
                          WHERE d.store_id=p_store_id AND d.user_id=p_user_id)
                  OR EXISTS(SELECT 1 FROM public.admin_users a
                            WHERE a.user_id=p_user_id AND a.note IN
                            ('Invited by store primary owner','Invited by HQ as assistant','Delegated store administrator'))
               THEN 'ASSISTANT'
             ELSE 'UNCLASSIFIED' END;
 -- Delete representation and invite state before the authorization row. In one transaction.
 DELETE FROM public.store_primary_owner_invitation_intents
   WHERE store_id=p_store_id AND user_id=p_user_id;
 DELETE FROM public.store_primary_owners WHERE store_id=p_store_id AND user_id=p_user_id;
 DELETE FROM public.store_admin_memberships WHERE store_id=p_store_id AND user_id=p_user_id;
 DELETE FROM public.store_delegated_permissions WHERE store_id=p_store_id AND user_id=p_user_id;
 DELETE FROM public.admin_users WHERE store_id=p_store_id AND user_id=p_user_id
   AND admin_role='STORE_MANAGER';
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_MANAGER_REVOKE_FAILED'; END IF;
 INSERT INTO public.hq_store_manager_revocation_audit(store_id,user_id,email,revoked_role,revoked_by)
 VALUES(p_store_id,p_user_id,v_email,v_role,auth.uid());
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id,
  'revoked_role',v_role,'was_owner',v_is_owner,'invitation_cancelled',v_is_pending_owner);
END $fn$;
REVOKE ALL ON FUNCTION public.hq_store_manager_remove(bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_store_manager_remove(bigint,uuid) TO authenticated;
