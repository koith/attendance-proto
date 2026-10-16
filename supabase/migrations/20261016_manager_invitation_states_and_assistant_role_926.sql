-- #926: Keep invitations out of the actual representative / assistant roster.
-- Existing grants are preserved; all labels are computed from secure server facts.
CREATE OR REPLACE FUNCTION public.store_manager_invitation_states(p_store_id bigint)
RETURNS TABLE(user_id uuid, email text, intended_role text, account_state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
  IF NOT(public.is_hq_admin() OR public.can_manage_store(p_store_id))
  THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  RETURN QUERY
    SELECT a.user_id, a.email,
      CASE WHEN o.user_id IS NOT NULL OR i.user_id IS NOT NULL THEN 'OWNER'::text
           WHEN d.user_id IS NOT NULL
             OR a.note IN ('Invited by store primary owner','Invited by HQ as assistant','Delegated store administrator')
           THEN 'ASSISTANT'::text
           ELSE 'UNCLASSIFIED'::text END AS intended_role,
      CASE WHEN o.user_id IS NOT NULL THEN 'ACTIVE'::text
           WHEN i.user_id IS NOT NULL AND i.expires_at<=now() THEN 'EXPIRED'::text
           WHEN i.user_id IS NOT NULL THEN 'PENDING'::text
           WHEN u.email_confirmed_at IS NULL OR coalesce(length(u.encrypted_password),0)=0
             OR u.deleted_at IS NOT NULL OR u.is_anonymous
             OR (u.banned_until IS NOT NULL AND u.banned_until>now())
           THEN 'PENDING'::text
           ELSE 'ACTIVE'::text END AS account_state
    FROM public.admin_users a
    JOIN auth.users u ON u.id=a.user_id
    LEFT JOIN public.store_primary_owners o
      ON o.store_id=a.store_id AND o.user_id=a.user_id
    LEFT JOIN public.store_primary_owner_invitation_intents i
      ON i.store_id=a.store_id AND i.user_id=a.user_id
    LEFT JOIN public.store_delegated_permissions d
      ON d.store_id=a.store_id AND d.user_id=a.user_id
    WHERE a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
    ORDER BY (o.user_id IS NOT NULL) DESC, a.email;
END $fn$;
REVOKE ALL ON FUNCTION public.store_manager_invitation_states(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_manager_invitation_states(bigint) TO authenticated;

-- New assistant invitations are separate from HQ representative invitations.
-- HQ may invite assistants only when the store has a real confirmed representative.
-- Attach permissions fail closed (false, false, false) BEFORE activation.
CREATE OR REPLACE FUNCTION public.service_hq_store_assistant_attach_invited_user(
  p_store_id bigint,p_user_id uuid,p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_email text; v_role text; v_store bigint;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=p_actor_id AND a.admin_role='HQ' AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL AND NOT u.is_anonymous
  AND (u.banned_until IS NULL OR u.banned_until<now()))
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 PERFORM 1 FROM public.stores s
  WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_READY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_primary_owners o
  JOIN auth.users u ON u.id=o.user_id
  WHERE o.store_id=p_store_id AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL AND NOT u.is_anonymous
  AND (u.banned_until IS NULL OR u.banned_until<now()))
 THEN RAISE EXCEPTION 'ACTIVE_PRIMARY_OWNER_REQUIRED'; END IF;
 SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u
 WHERE u.id=p_user_id AND u.deleted_at IS NULL AND NOT u.is_anonymous;
 IF v_email IS NULL THEN RAISE EXCEPTION 'AUTH_USER_NOT_FOUND'; END IF;
 SELECT a.admin_role,a.store_id INTO v_role,v_store FROM public.admin_users a
 WHERE a.user_id=p_user_id;
 IF v_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
 IF v_role IS NOT NULL AND (v_role<>'STORE_MANAGER' OR v_store IS DISTINCT FROM p_store_id)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 IF EXISTS(SELECT 1 FROM public.store_primary_owners WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE user_id=p_user_id)
 THEN RAISE EXCEPTION 'CANNOT_DEMOTE_OWNER_INVITE'; END IF;
 IF v_role IS NULL THEN
  INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
  VALUES(p_user_id,v_email,'Invited by HQ as assistant','STORE_MANAGER',p_store_id);
 END IF;
 INSERT INTO public.store_delegated_permissions
  (store_id,user_id,staff_edit,attendance_approve,payroll_view,granted_by)
 VALUES (p_store_id,p_user_id,false,false,false,p_actor_id)
 ON CONFLICT(store_id,user_id) DO NOTHING;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id,
   'intended_role','ASSISTANT','activation','PENDING');
END $fn$;
REVOKE ALL ON FUNCTION public.service_hq_store_assistant_attach_invited_user(bigint,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_hq_store_assistant_attach_invited_user(bigint,uuid,uuid) TO service_role;

-- Store-owner invitations must also have a fail-closed delegated-permission row.
-- Do not rewrite existing data or previously granted permissions.
CREATE OR REPLACE FUNCTION public.store_assistant_invitation_default_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NEW.admin_role='STORE_MANAGER' AND NEW.note='Invited by store primary owner' THEN
   INSERT INTO public.store_delegated_permissions
    (store_id,user_id,staff_edit,attendance_approve,payroll_view)
   VALUES(NEW.store_id,NEW.user_id,false,false,false)
   ON CONFLICT(store_id,user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS store_assistant_invitation_default_permissions ON public.admin_users;
CREATE TRIGGER store_assistant_invitation_default_permissions
AFTER INSERT ON public.admin_users FOR EACH ROW
EXECUTE FUNCTION public.store_assistant_invitation_default_permissions();
