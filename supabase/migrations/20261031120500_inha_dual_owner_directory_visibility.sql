-- #1435: Surface the confirmed HQ+Inha OWNER in both headquarters and store manager UIs.
-- Existing STORE_MANAGER rows and invitations stay unchanged.
CREATE OR REPLACE FUNCTION public.hq_store_manager_directory()
RETURNS TABLE(store_id bigint,user_id uuid,email text,intended_role text,account_state text,registered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT a.store_id,a.user_id,a.email,
 CASE WHEN o.user_id IS NOT NULL OR i.user_id IS NOT NULL THEN 'OWNER'::text
      WHEN d.user_id IS NOT NULL OR a.note IN
       ('Invited by store primary owner','Invited by HQ as assistant','Delegated store administrator')
      THEN 'ASSISTANT'::text ELSE 'UNCLASSIFIED'::text END,
 CASE WHEN o.user_id IS NOT NULL THEN 'ACTIVE'::text
      WHEN i.user_id IS NOT NULL AND i.expires_at<=now() THEN 'EXPIRED'::text
      WHEN i.user_id IS NOT NULL THEN 'PENDING'::text
      WHEN u.email_confirmed_at IS NULL OR coalesce(length(u.encrypted_password),0)=0
       OR u.deleted_at IS NOT NULL OR u.is_anonymous
       OR (u.banned_until IS NOT NULL AND u.banned_until>now())
      THEN 'PENDING'::text ELSE 'ACTIVE'::text END,
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
 UNION ALL
 SELECT o.store_id,a.user_id,u.email,'OWNER'::text,'ACTIVE'::text,a.created_at
 FROM public.store_primary_owners o
 JOIN public.store_admin_memberships m
   ON m.store_id=o.store_id AND m.user_id=o.user_id AND m.role='OWNER'
 JOIN public.admin_users a ON a.user_id=o.user_id AND a.admin_role='HQ' AND a.store_id IS NULL
 JOIN auth.users u ON u.id=a.user_id
 WHERE o.store_id=1 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
 AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<now());
END $fn$;

CREATE OR REPLACE FUNCTION public.store_manager_invitation_states(p_store_id bigint)
RETURNS TABLE(user_id uuid,email text,intended_role text,account_state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT (public.is_hq_admin() OR public.can_manage_store(p_store_id))
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT a.user_id,a.email,
 CASE WHEN o.user_id IS NOT NULL OR i.user_id IS NOT NULL THEN 'OWNER'::text
      WHEN d.user_id IS NOT NULL OR a.note IN
      ('Invited by store primary owner','Invited by HQ as assistant','Delegated store administrator')
      THEN 'ASSISTANT'::text ELSE 'UNCLASSIFIED'::text END,
 CASE WHEN o.user_id IS NOT NULL THEN 'ACTIVE'::text
      WHEN i.user_id IS NOT NULL AND i.expires_at<=now() THEN 'EXPIRED'::text
      WHEN i.user_id IS NOT NULL THEN 'PENDING'::text
      WHEN u.email_confirmed_at IS NULL OR coalesce(length(u.encrypted_password),0)=0
      OR u.deleted_at IS NOT NULL OR u.is_anonymous
      OR (u.banned_until IS NOT NULL AND u.banned_until>now())
      THEN 'PENDING'::text ELSE 'ACTIVE'::text END
 FROM public.admin_users a
 JOIN auth.users u ON u.id=a.user_id
 LEFT JOIN public.store_primary_owners o ON o.store_id=a.store_id AND o.user_id=a.user_id
 LEFT JOIN public.store_primary_owner_invitation_intents i ON i.store_id=a.store_id AND i.user_id=a.user_id
 LEFT JOIN public.store_delegated_permissions d ON d.store_id=a.store_id AND d.user_id=a.user_id
 WHERE a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
 UNION ALL
 SELECT a.user_id,u.email,'OWNER'::text,'ACTIVE'::text
 FROM public.store_primary_owners o
 JOIN public.store_admin_memberships m ON m.store_id=o.store_id
  AND m.user_id=o.user_id AND m.role='OWNER'
 JOIN public.admin_users a ON a.user_id=o.user_id AND a.admin_role='HQ' AND a.store_id IS NULL
 JOIN auth.users u ON u.id=a.user_id
 WHERE p_store_id=1 AND o.store_id=1 AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL AND NOT u.is_anonymous
  AND (u.banned_until IS NULL OR u.banned_until<now());
END $fn$;