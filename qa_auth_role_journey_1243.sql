-- Disposable GoTrue-owned database ONLY, after GoTrue has installed auth.*.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'qa1243_gotrue' OR inet_server_addr() IS NULL THEN
  RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED';
 END IF;
END $$;
SET search_path=public;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE qa1243_authenticator LOGIN PASSWORD 'local-disposable-only' NOINHERIT;
GRANT anon,authenticated,service_role TO qa1243_authenticator;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE TABLE public.stores(id bigint PRIMARY KEY,code text,name text,source_store_key text,
 onboarding_status text DEFAULT 'STAGED',is_active boolean DEFAULT false);
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 email text,note text,admin_role text,store_id bigint REFERENCES public.stores(id));
CREATE TABLE public.store_admin_memberships(store_id bigint,user_id uuid);
CREATE TABLE public.employees(id bigint PRIMARY KEY,store_id bigint REFERENCES public.stores(id),
 name text,employee_no integer,memo text,is_active boolean DEFAULT true);
CREATE TABLE public.store_provenance_reviews(id bigint GENERATED ALWAYS AS IDENTITY,
 store_id bigint,decision text);
CREATE TABLE public.correction_requests(id bigint PRIMARY KEY,employee_id bigint,event_id bigint,
 kind text,note text,requested_at timestamp,requested_type text,status text,created_at timestamptz,
 resolved_by text,resolved_at timestamptz,reject_reason text);
CREATE TABLE public.payroll_period(store_id bigint,ym text,status text);
CREATE TABLE public.payroll_snapshot(store_id bigint,ym text,employee_name text,
 gross_pay integer,net_pay integer,base_pay integer,juhyu_pay integer);
CREATE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users a
 JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=auth.uid() AND a.admin_role='HQ'
 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
 AND (u.banned_until IS NULL OR u.banned_until<now())) $$;
-- Delegation migration references this function, replaced by shipped core below.
CREATE FUNCTION public.can_manage_store(bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
\i supabase/migrations/20261013212000_store_primary_owner_delegation.sql
\i supabase/migrations/20261014074000_owner_replacement_revoke_access.sql
\i supabase/migrations/20261014090000_delegated_permissions_core.sql
\i supabase/migrations/20261014091000_delegated_scoped_actions.sql
\i supabase/migrations/20261014100000_delegated_default_deny.sql
\i supabase/migrations/20261014113000_delegated_scopes_not_full_admin.sql
\i supabase/migrations/20261016_owner_invite_autoactivation_921.sql
\i supabase/migrations/20261020093000_hq_verified_existing_account_reconnect.sql
\i supabase/migrations/20261020121000_invitation_dispatch_activation_preflight_1243.sql
\i supabase/migrations/20261022225500_qa1243_confirmed_primary_owner_ready.sql
INSERT INTO public.stores VALUES(1,'PROTECTED','Protected synthetic branch','protected','READY',true),
 (701,'QA701','Disposable Alpha','qa-alpha','STAGED',false),
 (702,'QA702','Disposable Beta','qa-beta','STAGED',false);
INSERT INTO public.store_provenance_reviews(store_id,decision) VALUES(701,'VERIFIED'),(702,'VERIFIED');
INSERT INTO public.employees(id,store_id,name,employee_no,memo)
 SELECT i,1,'Protected employee '||i,i,'protected' FROM generate_series(1,10)i;
INSERT INTO public.employees VALUES(70101,701,'Alpha employee',1,'alpha',true),
 (70201,702,'Beta employee',1,'beta',true);
INSERT INTO public.payroll_period VALUES(701,'2026-10','CLOSED'),(702,'2026-10','CLOSED');
INSERT INTO public.payroll_snapshot VALUES(701,'2026-10','Alpha employee',45000,43510,45000,0),
 (702,'2026-10','Beta employee',30000,29010,30000,0);
-- No anonymous table access or public test mutation RPCs. Fixture setup/audit uses
-- local psql; tested mutations go through the shipped JWT-authorized RPCs.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
