-- Isolated PostgreSQL 16 weekly decision integration. NEVER connects to the live
-- payroll store or uses actual employees, manager IDs, PINs or approvals.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))
$$;
CREATE TABLE public.stores(id bigint PRIMARY KEY,is_active boolean,onboarding_status text);
CREATE TABLE public.employees(id bigint PRIMARY KEY,store_id bigint REFERENCES public.stores(id));
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY,admin_role text,store_id bigint);
CREATE TABLE public.payroll_period(store_id bigint,ym text,status text);
CREATE TABLE public.payroll_snapshot(store_id bigint,employee_id bigint,ym text);
INSERT INTO public.stores VALUES(1,true,'READY'),(2,true,'READY'),(3,false,'STAGED');
INSERT INTO public.employees VALUES(1,1),(2,2),(3,3);
INSERT INTO auth.users VALUES
 ('00000000-0000-4000-8000-000000000001','hq@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','store2@example.invalid');
INSERT INTO public.admin_users VALUES
 ('00000000-0000-4000-8000-000000000001','HQ',NULL),
 ('00000000-0000-4000-8000-000000000002','STORE_MANAGER',2);
SELECT set_config('request.jwt.claim.role','service_role',false);
-- Install actual versioned table / immutability trigger and the newest
-- versioned manager decision RPC, with its locking and service-only checks.
\i supabase/migrations/20261009123000_payroll_weekly_approvals.sql
-- Superseded entrypoint exists on the real database; only needed so its
-- REVOKE runs against an explicit local stub in this disposable database.
CREATE OR REPLACE FUNCTION public.approve_payroll_weekly_allowance_internal(
 bigint,bigint,date,integer,integer,text,uuid)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
\i supabase/migrations/20261011210000_weekly_reapprove_immutable_audit.sql

DO $$
DECLARE func oid;
BEGIN
 func:='public.approve_payroll_weekly_decision_internal(bigint,bigint,date,integer,integer,text,uuid,text)'::regprocedure::oid;
 IF has_function_privilege('anon',func,'EXECUTE') OR
    has_function_privilege('authenticated',func,'EXECUTE') OR
    NOT has_function_privilege('service_role',func,'EXECUTE') THEN
   RAISE EXCEPTION 'Weekly approval role grants are unsafe';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.weekly_fixture_expect_error(
 p_store bigint,p_employee bigint,p_week date,
 p_amount integer,p_decision text,p_actor uuid,p_error text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
 BEGIN
  PERFORM public.approve_payroll_weekly_decision_internal(
    p_store,p_employee,p_week,40000,p_amount,'Synthetic manager review',
    p_actor,p_decision);
  RAISE EXCEPTION 'EXPECTED_REJECTION_WAS_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
  IF observed IS DISTINCT FROM p_error THEN
    RAISE EXCEPTION 'Expected %, got %',p_error,observed;
  END IF;
 END;
END $$;

-- Service boundary, invalid store/employee roles, and current-week closure.
SELECT set_config('request.jwt.claim.role','anon',false);
SELECT public.weekly_fixture_expect_error(1,1,'2026-09-28',30000,'APPROVE',
 '00000000-0000-4000-8000-000000000001','SERVICE_ONLY');
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.weekly_fixture_expect_error(3,3,'2026-09-28',30000,'APPROVE',
 '00000000-0000-4000-8000-000000000001','STORE_NOT_ACTIVE');
SELECT public.weekly_fixture_expect_error(1,2,'2026-09-28',30000,'APPROVE',
 '00000000-0000-4000-8000-000000000001','EMPLOYEE_STORE_MISMATCH');
SELECT public.weekly_fixture_expect_error(1,1,'2026-09-28',30000,'APPROVE',
 '00000000-0000-4000-8000-000000000002','NOT_AUTHORIZED');
SELECT public.weekly_fixture_expect_error(1,1,
 date_trunc('week',current_timestamp AT TIME ZONE 'Asia/Seoul')::date,
 30000,'APPROVE','00000000-0000-4000-8000-000000000001','WEEK_NOT_CLOSED');
SELECT public.weekly_fixture_expect_error(1,1,'2026-09-29',30000,'APPROVE',
 '00000000-0000-4000-8000-000000000001','INVALID_WEEKLY_DECISION');
SELECT public.weekly_fixture_expect_error(1,1,'2026-09-28',30000,'REAPPROVE',
 '00000000-0000-4000-8000-000000000001','INITIAL_APPROVAL_REQUIRED');
SELECT public.weekly_fixture_expect_error(1,1,'2026-09-28',5000,'REJECT',
 '00000000-0000-4000-8000-000000000001','INVALID_WEEKLY_DECISION');

-- Three immutable history records, not a mutable upsert.
SELECT public.approve_payroll_weekly_decision_internal(1,1,'2026-09-28',
 40000,30000,'Initial verified approval',
 '00000000-0000-4000-8000-000000000001','APPROVE');
SELECT public.weekly_fixture_expect_error(1,1,'2026-09-28',30000,'APPROVE',
 '00000000-0000-4000-8000-000000000001','REAPPROVAL_REQUIRED');
SELECT public.approve_payroll_weekly_decision_internal(1,1,'2026-09-28',
 40000,0,'Corrected hours rejected',
 '00000000-0000-4000-8000-000000000001','REJECT');
SELECT public.approve_payroll_weekly_decision_internal(1,1,'2026-09-28',
 40000,25000,'Recalculated approved hours',
 '00000000-0000-4000-8000-000000000001','REAPPROVE');

DO $$
DECLARE observed text;
BEGIN
 IF (SELECT count(*) FROM public.payroll_weekly_approvals
     WHERE employee_id=1 AND week_start='2026-09-28')<>3 OR
    (SELECT decision FROM public.payroll_weekly_approvals
     WHERE employee_id=1 AND week_start='2026-09-28'
     ORDER BY approved_at DESC,id DESC LIMIT 1)<>'REAPPROVE' OR
    (SELECT approved_won FROM public.payroll_weekly_approvals
     WHERE employee_id=1 AND week_start='2026-09-28'
     ORDER BY approved_at DESC,id DESC LIMIT 1)<>25000 THEN
   RAISE EXCEPTION 'Latest decision lost or old history overwritten';
 END IF;
 -- A manager cannot edit or delete the immutable approval audit.
 BEGIN
  UPDATE public.payroll_weekly_approvals SET approved_won=1 WHERE id=1;
  RAISE EXCEPTION 'UPDATE_AUDIT_SHOULD_BE_BLOCKED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
  IF observed IS DISTINCT FROM 'WEEKLY_APPROVAL_AUDIT_IMMUTABLE' THEN
    RAISE EXCEPTION 'Update audit guard: %',observed;
  END IF;
 END;
 BEGIN
  DELETE FROM public.payroll_weekly_approvals WHERE id=2;
  RAISE EXCEPTION 'DELETE_AUDIT_SHOULD_BE_BLOCKED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
  IF observed IS DISTINCT FROM 'WEEKLY_APPROVAL_AUDIT_IMMUTABLE' THEN
    RAISE EXCEPTION 'Delete audit guard: %',observed;
  END IF;
 END;
END $$;

-- Store 2 month closure must not restrict store 1's own isolated week.
INSERT INTO public.payroll_period VALUES (2,'2026-09','CLOSED'),(2,'2026-10','CLOSED');
SELECT public.approve_payroll_weekly_decision_internal(1,1,'2026-09-21',
 40000,40000,'Store 2 close does not restrict store 1',
 '00000000-0000-4000-8000-000000000001','APPROVE');

-- But an overlap week from Sep 28 through Oct 4 belongs to BOTH
-- Sep and Oct for close-prevention purposes for this same store.
INSERT INTO public.payroll_period VALUES(1,'2026-10','CLOSED');
SELECT public.weekly_fixture_expect_error(1,1,'2026-09-28',26000,'REAPPROVE',
 '00000000-0000-4000-8000-000000000001','PAYROLL_ALREADY_CLOSED');

DO $$
BEGIN
 IF (SELECT count(*) FROM public.payroll_weekly_approvals)<>4 THEN
  RAISE EXCEPTION 'Invalid decision mutated append-only history';
 END IF;
END $$;
\echo PASS: isolated weekly approval SQL enforces roles, same-store, closed cross-month, immutable decision history
