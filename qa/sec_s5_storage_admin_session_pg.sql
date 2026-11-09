\set ON_ERROR_STOP on
-- Isolated disposable PG16/17: real prior S4 migration and S5 migration,
-- real session_guard code imported from existing first-party migration, synthetic identities only.
\i qa_admin_session_postgrest_setup.sql
BEGIN;
CREATE TABLE public.employees(id bigint PRIMARY KEY,store_id bigint NOT NULL);
CREATE TABLE public.employee_documents(id bigint PRIMARY KEY,employee_id bigint NOT NULL,storage_path text NOT NULL);
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id bigint PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated;
GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $uid$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $uid$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $admin$ SELECT auth.uid()='11111111-1111-1111-1111-111111111111'::uuid $admin$;
CREATE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $hq$ SELECT auth.uid()='11111111-1111-1111-1111-111111111111'::uuid $hq$;
CREATE FUNCTION public.can_manage_store(p_store_id bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $store$ SELECT p_store_id=1 AND auth.uid()='11111111-1111-1111-1111-111111111111'::uuid $store$;
INSERT INTO public.employees VALUES(101,1),(202,2);
INSERT INTO public.employee_documents VALUES(1,101,'101/known.pdf');
INSERT INTO storage.objects VALUES(1,'employee-docs','101/known.pdf');
CREATE POLICY empdoc_admin_select ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='employee-docs' AND public.is_admin());
CREATE POLICY empdoc_admin_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='employee-docs' AND public.is_admin());
CREATE POLICY empdoc_admin_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='employee-docs' AND public.is_admin());
\i security/sec_s4_employee_docs_store_scoped_rls.sql
-- Make exact synthetic protected old session claims.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',true);
DO $legacy$
BEGIN
 IF NOT public.sec_s4_employee_doc_file_access_v1('101/known.pdf')
 THEN RAISE EXCEPTION 'SEC_S5_OLD_STORAGE_SESSION_BYPASS_NOT_REPRODUCED'; END IF;
END
$legacy$;
RESET ROLE;
\i security/sec_s5_storage_admin_session_helper_v1.sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',true);
DO $denied$
BEGIN
 BEGIN
  PERFORM public.sec_s4_employee_doc_file_access_v1('101/known.pdf');
  RAISE EXCEPTION 'SEC_S5_OLD_STORAGE_SESSION_WAS_NOT_REVOKED';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE '%SESSION_SUPERSEDED%' THEN RAISE; END IF;
 END;
END
$denied$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',true);
DO $latest$
BEGIN
 IF NOT public.sec_s4_employee_doc_file_access_v1('101/known.pdf')
 THEN RAISE EXCEPTION 'SEC_S5_CURRENT_ADMIN_STORAGE_ACCESS_BROKEN'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>1
 THEN RAISE EXCEPTION 'SEC_S5_CURRENT_ADMIN_STORAGE_RLS_BROKEN'; END IF;
END
$latest$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',true);
DO $storage$
BEGIN
 BEGIN
  PERFORM count(*) FROM storage.objects WHERE bucket_id='employee-docs';
  RAISE EXCEPTION 'SEC_S5_OLD_STORAGE_OBJECT_READ_ALLOWED';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE '%SESSION_SUPERSEDED%' THEN RAISE; END IF;
 END;
END
$storage$;
-- Fake staff has no admin_users record; no session check block but no privileged file visibility.
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222"}',true);
DO $staff$
BEGIN
 IF public.sec_s4_employee_doc_file_access_v1('101/known.pdf')
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>0
 THEN RAISE EXCEPTION 'SEC_S5_STAFF_DOC_LEAK'; END IF;
END
$staff$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>0
 THEN RAISE EXCEPTION 'SEC_S5_ANON_DOC_LEAK'; END IF;
END
$anon$;
RESET ROLE;
-- Verify emergency rollback preserves store scope, solely in isolated fixture.
\i security/sec_s5_storage_admin_session_rollback_v1.sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","session_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',true);
DO $rollback$
BEGIN
 IF NOT public.sec_s4_employee_doc_file_access_v1('101/known.pdf')
 THEN RAISE EXCEPTION 'SEC_S5_REVERT_SCOPED_FUNCTION_FAILED'; END IF;
END
$rollback$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS SEC-S5 storage scope: before stale=true; after stale denied, current admin and staff/anon protected, rollback scoped; PG16/17 disposable' AS result;
