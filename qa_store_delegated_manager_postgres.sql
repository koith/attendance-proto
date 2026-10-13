-- Synthetic-only, disposable PostgreSQL 16 QA for nationwide delegated managers.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,email text UNIQUE,email_confirmed_at timestamptz,
 deleted_at timestamptz,is_anonymous boolean DEFAULT false,banned_until timestamptz
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('fixture.uid',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('role',current_setting('fixture.role',true))
$$;
CREATE TABLE public.stores(
 id bigint PRIMARY KEY,name text,onboarding_status text,is_active boolean
);
CREATE TABLE public.admin_users(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 email text,note text,admin_role text CHECK(admin_role IN('HQ','STORE_MANAGER')),
 store_id bigint REFERENCES public.stores(id)
);
CREATE TABLE public.store_admin_memberships(
 store_id bigint REFERENCES public.stores(id), user_id uuid REFERENCES auth.users(id),
 role text,assigned_by uuid,created_at timestamptz DEFAULT now(),PRIMARY KEY(store_id,user_id)
);
CREATE OR REPLACE FUNCTION public.is_hq_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
 WHERE a.user_id=auth.uid() AND a.admin_role='HQ'
 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
 AND (u.banned_until IS NULL OR u.banned_until<now()))
$$;
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
 WHERE a.user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL
 AND u.deleted_at IS NULL AND NOT u.is_anonymous
 AND (u.banned_until IS NULL OR u.banned_until<now())
 AND (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
 AND EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id
 AND s.is_active AND s.onboarding_status='READY'))))
$$;
INSERT INTO public.stores(id,name,onboarding_status,is_active)
SELECT i,'Synthetic '||i,CASE WHEN i IN(1,2,4) THEN 'READY' ELSE 'STAGED' END,
 i IN(1,2,4) FROM generate_series(1,283)i;
INSERT INTO auth.users(id,email,email_confirmed_at)
SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'test'||i||'@synthetic.invalid',
 CASE WHEN i IN(7,8) THEN NULL ELSE now() END
FROM generate_series(1,11)i;
INSERT INTO public.admin_users(user_id,email,admin_role,store_id)
VALUES
 ('00000000-0000-4000-8000-000000000001','test1@synthetic.invalid','HQ',NULL),
 ('00000000-0000-4000-8000-000000000002','test2@synthetic.invalid','STORE_MANAGER',2),
 ('00000000-0000-4000-8000-000000000003','test3@synthetic.invalid','STORE_MANAGER',2),
 ('00000000-0000-4000-8000-000000000005','test5@synthetic.invalid','STORE_MANAGER',3),
 ('00000000-0000-4000-8000-000000000009','test9@synthetic.invalid','STORE_MANAGER',4);
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
\i supabase/migrations/20261013212000_store_primary_owner_delegation.sql
\i supabase/migrations/20261014074000_owner_replacement_revoke_access.sql

-- Error assertions use actual installed SQL function bodies (not copies).
CREATE FUNCTION public.qa_expect_failure(p_label text,p_statement text,p_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
 BEGIN
  EXECUTE p_statement;
  RAISE EXCEPTION 'EXPECTED_REJECTION_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
  IF observed IS DISTINCT FROM p_message
  THEN RAISE EXCEPTION 'QA % expected %, got %',p_label,p_message,observed; END IF;
 END;
END $$;
DO $qa$
BEGIN
 IF has_function_privilege('anon','public.hq_store_primary_owner_set(bigint,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.store_delegated_manager_list(bigint)','EXECUTE')
 OR has_function_privilege('anon','public.store_delegated_manager_change(bigint,text,uuid,text)','EXECUTE')
 OR has_function_privilege('anon','public.store_primary_owner_can_delegate(bigint,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.service_store_delegated_manager_attach_invited_user(bigint,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'UNPRIVILEGED_EXECUTE_GRANT'; END IF;
END $qa$;

-- HQ appoints a confirmed, store-scoped primary. Never silently promote on migration.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.store_primary_owners) THEN
  RAISE EXCEPTION 'AUTO_PROMOTED_UNVERIFIED_OWNER'; END IF;
END $$;
SELECT public.qa_expect_failure('no primary for other store',
 $$SELECT public.hq_store_primary_owner_set(3,'00000000-0000-4000-8000-000000000002')$$,
 'CONFIRMED_STORE_MANAGER_REQUIRED');
SELECT public.qa_expect_failure('no primary for unconfirmed',
 $$SELECT public.hq_store_primary_owner_set(2,'00000000-0000-4000-8000-000000000007')$$,
 'CONFIRMED_STORE_MANAGER_REQUIRED');
SELECT public.hq_store_primary_owner_set(2,'00000000-0000-4000-8000-000000000002');
SELECT public.hq_store_primary_owner_set(4,'00000000-0000-4000-8000-000000000009');

-- HQ-only primary appointment/listing. Non-HQ users cannot appoint themselves.
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000003',false);
SELECT public.qa_expect_failure('non-hq appoint',
 $$SELECT public.hq_store_primary_owner_set(2,'00000000-0000-4000-8000-000000000003')$$,
 'NOT_AUTHORIZED');
SELECT public.qa_expect_failure('non-hq owner roster',
 $$SELECT count(*) FROM public.hq_store_primary_owner_list()$$,
 'NOT_AUTHORIZED');
SELECT public.qa_expect_failure('delegate cannot add',
 $$SELECT public.store_delegated_manager_change(2,'test4@synthetic.invalid',NULL,'ADD')$$,
 'OWNER_ONLY');
SELECT public.qa_expect_failure('delegate cannot revoke',
 $$SELECT public.store_delegated_manager_change(2,NULL,'00000000-0000-4000-8000-000000000002','REVOKE')$$,
 'OWNER_ONLY');

-- Primary may view own store and make manager access changes, never another store.
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.store_delegated_manager_list(2))<>2
 OR (SELECT manager_role FROM public.store_delegated_manager_list(2)
     WHERE user_id='00000000-0000-4000-8000-000000000002')<>'OWNER'
 THEN RAISE EXCEPTION 'OWNER_ROSTER_INCORRECT'; END IF;
END $$;
SELECT public.qa_expect_failure('cross-store read',
 $$SELECT count(*) FROM public.store_delegated_manager_list(4)$$,'NOT_AUTHORIZED');
SELECT public.qa_expect_failure('cross-store assign',
 $$SELECT public.store_delegated_manager_change(4,'test4@synthetic.invalid',NULL,'ADD')$$,
 'OWNER_ONLY');
SELECT public.qa_expect_failure('staged assign',
 $$SELECT public.store_delegated_manager_change(3,'test4@synthetic.invalid',NULL,'ADD')$$,
 'OWNER_ONLY');
SELECT public.qa_expect_failure('unconfirmed add',
 $$SELECT public.store_delegated_manager_change(2,'test7@synthetic.invalid',NULL,'ADD')$$,
 'CONFIRMED_ACCOUNT_REQUIRED');
SELECT public.qa_expect_failure('already assigned other branch',
 $$SELECT public.store_delegated_manager_change(2,'test9@synthetic.invalid',NULL,'ADD')$$,
 'ACCOUNT_ALREADY_ASSIGNED');
SELECT public.store_delegated_manager_change(2,'test4@synthetic.invalid',NULL,'ADD');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users
   WHERE user_id='00000000-0000-4000-8000-000000000004'
   AND admin_role='STORE_MANAGER' AND store_id=2)
 OR EXISTS(SELECT 1 FROM public.admin_users
   WHERE user_id='00000000-0000-4000-8000-000000000004' AND store_id<>2)
 THEN RAISE EXCEPTION 'OWNER_ADD_NOT_STORE_SCOPED'; END IF;
END $$;
SELECT public.qa_expect_failure('self revoke',
 $$SELECT public.store_delegated_manager_change(2,NULL,'00000000-0000-4000-8000-000000000002','REVOKE')$$,
 'CANNOT_REVOKE_OWNER_OR_SELF');
SELECT public.qa_expect_failure('revoke other store manager',
 $$SELECT public.store_delegated_manager_change(2,NULL,'00000000-0000-4000-8000-000000000009','REVOKE')$$,
 'MANAGER_NOT_FOUND');
SELECT public.store_delegated_manager_change(2,NULL,'00000000-0000-4000-8000-000000000004','REVOKE');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id='00000000-0000-4000-8000-000000000004')
 THEN RAISE EXCEPTION 'MANAGER_REVOKE_FAILED'; END IF;
END $$;
-- Owners lose authority if banned even with an unexpired JWT.
UPDATE auth.users SET banned_until=now()+interval '1 day'
WHERE id='00000000-0000-4000-8000-000000000002';
SELECT public.qa_expect_failure('banned owner cannot add',
 $$SELECT public.store_delegated_manager_change(2,'test4@synthetic.invalid',NULL,'ADD')$$,
 'OWNER_ONLY');
UPDATE auth.users SET banned_until=NULL
WHERE id='00000000-0000-4000-8000-000000000002';

-- Auth UID and service role must BOTH be checked for invitation attachment.
SELECT public.qa_expect_failure('no client-side service role',
 $$SELECT public.service_store_delegated_manager_attach_invited_user(
   2,'00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000002')$$,
 'SERVICE_ONLY');
SELECT set_config('fixture.role','service_role',false);
SELECT public.qa_expect_failure('fake primary actor',
 $$SELECT public.service_store_delegated_manager_attach_invited_user(
   2,'00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000003')$$,
 'OWNER_ONLY');
SELECT public.qa_expect_failure('primary of other branch',
 $$SELECT public.service_store_delegated_manager_attach_invited_user(
   4,'00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000002')$$,
 'OWNER_ONLY');
SELECT public.service_store_delegated_manager_attach_invited_user(
   2,'00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000002');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users
   WHERE user_id='00000000-0000-4000-8000-000000000008'
   AND store_id=2 AND admin_role='STORE_MANAGER')
 THEN RAISE EXCEPTION 'INVITATION_BINDING_FAILED'; END IF;
END $$;
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000008',false);
DO $$ BEGIN
 IF public.can_manage_store(2)
 THEN RAISE EXCEPTION 'UNCONFIRMED_INVITEE_GRANTED_ACCESS'; END IF;
END $$;

-- Even HQ cannot remove appointed owner without first appointing successor:
-- FK guards legacy HQ revoke, generic admin revoke and other delete paths.
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
SELECT public.qa_expect_failure('owner FK on stale revoke',
 $$DELETE FROM public.admin_users WHERE user_id='00000000-0000-4000-8000-000000000002'$$,
 'update or delete on table "admin_users" violates foreign key constraint "store_primary_owners_user_id_fkey" on table "store_primary_owners"');
-- HQ has a separate nationwide owner assignment path, not delegated self-service.
SELECT public.qa_expect_failure('hq cannot use delegated grant',
 $SELECT public.store_delegated_manager_change(2,'test10@synthetic.invalid',NULL,'ADD')$,
 'OWNER_ONLY');
SELECT public.hq_store_primary_owner_set(2,'00000000-0000-4000-8000-000000000003');
-- An outgoing owner no longer has any admin authorization, rather than silently
-- retaining full access as a secondary manager. Existing other managers survive.
DO $ BEGIN
 IF EXISTS(SELECT 1 FROM public.admin_users
  WHERE user_id='00000000-0000-4000-8000-000000000002')
 OR NOT EXISTS(SELECT 1 FROM public.admin_users
  WHERE user_id='00000000-0000-4000-8000-000000000003')
 THEN RAISE EXCEPTION 'OWNER_REPLACEMENT_DID_NOT_REVOKE_OLD_ADMIN'; END IF;
END $;

SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000002',false);
SELECT public.qa_expect_failure('old primary cannot delegate',
 $$SELECT public.store_delegated_manager_change(2,'test4@synthetic.invalid',NULL,'ADD')$$,
 'OWNER_ONLY');
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000003',false);
SELECT public.store_delegated_manager_change(2,'test4@synthetic.invalid',NULL,'ADD');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.stores)<>283
 OR (SELECT count(*) FROM public.stores WHERE is_active)<>3
 OR (SELECT count(*) FROM public.store_primary_owners)<>2
 THEN RAISE EXCEPTION 'STORES_CHANGED_DURING_MANAGER_QA'; END IF;
END $$;
\echo PASS: primary HQ-only, all 283 stores unchanged, delegated role add/revoke, cross-store/banned/unconfirmed denial, service-only invitation, FK revocation guard
