-- Synthetic fixture only, transaction rolls back. No production writes.
BEGIN;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT current_setting('qa.hq',true)='1'
$$;
CREATE TABLE public.stores(id bigint PRIMARY KEY,is_active boolean,onboarding_status text);
CREATE TABLE public.payroll_period(store_id bigint, ym text,status text);
CREATE TABLE public.payroll_snapshot(store_id bigint,ym text,source_fingerprint text);
CREATE TABLE public.payroll_weekly_approvals(store_id bigint,week_start date,approved_at timestamptz,approved_by uuid);
CREATE TABLE public.store_primary_owners(store_id bigint,user_id uuid);
CREATE TABLE public.store_admin_memberships(store_id bigint,user_id uuid);
CREATE TABLE public.store_provenance_reviews(id bigint,store_id bigint,decision text,reviewed_at timestamptz);
CREATE TABLE public.operations_import_batches(id bigint,completed_at timestamptz,error_message text);
CREATE TABLE public.operations_raw_records(id bigint,store_id bigint,batch_id bigint);
CREATE TABLE public.operations_transactions(id bigint,store_id bigint,raw_record_id bigint,is_demo boolean,status text);
CREATE TABLE public.operations_reconciliation_issues(status text);
CREATE TABLE public.inventory_movements(is_demo boolean,source_type text);
\i supabase/migrations/20261015172500_hq_field_readiness_v1.sql
DO $$
DECLARE snapshot jsonb; denied boolean:=false;
BEGIN
 IF has_function_privilege('anon','public.hq_field_readiness_v1()','EXECUTE') THEN RAISE EXCEPTION 'ANON_CAN_INVOKE_HQ_READINESS'; END IF;
 IF NOT has_function_privilege('authenticated','public.hq_field_readiness_v1()','EXECUTE') THEN RAISE EXCEPTION 'HQ_ROLE_CANNOT_INVOKE'; END IF;
 BEGIN PERFORM public.hq_field_readiness_v1();
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='NOT_AUTHORIZED' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'MISSING_HQ_AUTHORIZATION'; END IF;
 PERFORM set_config('qa.hq','1',true);
 snapshot:=public.hq_field_readiness_v1();
 IF snapshot->>'schema_version'<>'2'
 OR (snapshot->'payroll'->>'qualified_closed_periods')::int<>0
 OR (snapshot->'stores'->>'qualified_owner_links')::int<>0
 OR (snapshot->'operations'->>'confirmed_linked_real_transactions')::int<>0
 THEN RAISE EXCEPTION 'ZERO_EVIDENCE_MUST_FAIL_CLOSED'; END IF;
END $$;
INSERT INTO public.stores VALUES (1,true,'READY'),(2,true,'STAGED');
INSERT INTO public.payroll_period VALUES(1,'2026-09','CLOSED');
INSERT INTO public.payroll_snapshot VALUES(1,'2026-09','fingerprint-1');
INSERT INTO public.payroll_weekly_approvals VALUES(2,'2026-09-07',now(),'00000000-0000-4000-8000-000000000002');
INSERT INTO public.store_primary_owners VALUES(1,'00000000-0000-4000-8000-000000000001');
INSERT INTO public.store_admin_memberships VALUES(1,'00000000-0000-4000-8000-000000000001');
INSERT INTO public.store_provenance_reviews VALUES(1,1,'VERIFIED',now()-interval '1 day'),(2,1,'REJECTED',now());
INSERT INTO public.operations_import_batches VALUES(10,now(),null);
INSERT INTO public.operations_raw_records VALUES(20,1,10);
INSERT INTO public.operations_transactions VALUES(30,1,20,true,'CONFIRMED'),(31,1,20,false,'PENDING');
DO $$
DECLARE r jsonb;
BEGIN
 PERFORM set_config('qa.hq','1',true);
 r:=public.hq_field_readiness_v1();
 IF (r->'payroll'->>'qualified_closed_periods')::int<>0 THEN RAISE EXCEPTION 'WRONG_STORE_WEEK_APPROVAL_LEAK'; END IF;
 IF (r->'stores'->>'qualified_owner_links')::int<>0 THEN RAISE EXCEPTION 'REVOKED_OWNER_REVIEW_LEAK'; END IF;
 IF (r->'operations'->>'confirmed_linked_real_transactions')::int<>0 THEN RAISE EXCEPTION 'DEMO_OR_PENDING_COUNTED_AS_REAL'; END IF;
END $$;
INSERT INTO public.payroll_weekly_approvals VALUES(1,'2026-09-07',now(),'00000000-0000-4000-8000-000000000001');
INSERT INTO public.store_provenance_reviews VALUES(3,1,'VERIFIED',now()+interval '1 second');
INSERT INTO public.operations_transactions VALUES(32,1,20,false,'CONFIRMED');
DO $$
DECLARE r jsonb;
BEGIN
 PERFORM set_config('qa.hq','1',true);
 r:=public.hq_field_readiness_v1();
 IF (r->'payroll'->>'qualified_closed_periods')::int<>1
 OR (r->'stores'->>'qualified_owner_links')::int<>1
 OR (r->'operations'->>'confirmed_linked_real_transactions')::int<>1
 THEN RAISE EXCEPTION 'VALID_MATCHED_EVIDENCE_WAS_NOT_COUNTED'; END IF;
 RAISE NOTICE 'PASS HQ-only confidential live readiness, matched payroll and latest owner, non-demo linked sources';
END $$;
ROLLBACK;
