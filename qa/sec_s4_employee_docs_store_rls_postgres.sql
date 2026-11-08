\set ON_ERROR_STOP on
-- PG16/17 disposable database only. Synthetic users/documents, no live credentials.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated;
CREATE TABLE public.employees(id bigint PRIMARY KEY,store_id bigint NOT NULL);
CREATE TABLE public.fake_manager_membership(user_id uuid PRIMARY KEY,store_id bigint,role text);
CREATE TABLE storage.objects(id bigint PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL UNIQUE);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE ON storage.objects TO anon,authenticated;
CREATE TABLE public.employee_documents(id bigint PRIMARY KEY,employee_id bigint,storage_path text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$f$;
CREATE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.fake_manager_membership m
 WHERE m.user_id=auth.uid() AND m.role='HQ')
$f$;
CREATE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.fake_manager_membership m
 WHERE m.user_id=auth.uid() AND (m.role='HQ' OR (m.role='OWNER' AND m.store_id=p_store_id)))
$f$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.fake_manager_membership m
 WHERE m.user_id=auth.uid() AND m.role IN ('HQ','OWNER'))
$f$;
INSERT INTO public.employees VALUES(101,1),(202,2);
INSERT INTO public.fake_manager_membership VALUES
('00000000-0000-4000-8000-000000000001',1,'OWNER'),
('00000000-0000-4000-8000-000000000002',2,'OWNER'),
('00000000-0000-4000-8000-000000000003',NULL,'HQ'),
('00000000-0000-4000-8000-000000000004',2,'ASSISTANT');
INSERT INTO storage.objects VALUES
(1,'employee-docs','101/original.pdf'),
(2,'employee-docs','202/original.pdf'),
(3,'employee-docs','404/legacy-orphan.pdf'),
(4,'recipe-thumbnails','sample.png');
INSERT INTO public.employee_documents VALUES
(1,101,'101/original.pdf'),(2,202,'202/original.pdf');
CREATE POLICY empdoc_admin_select ON storage.objects
 FOR SELECT TO authenticated USING(bucket_id='employee-docs' AND public.is_admin());
CREATE POLICY empdoc_admin_insert ON storage.objects
 FOR INSERT TO authenticated WITH CHECK(bucket_id='employee-docs' AND public.is_admin());
CREATE POLICY empdoc_admin_delete ON storage.objects
 FOR DELETE TO authenticated USING(bucket_id='employee-docs' AND public.is_admin());

-- Verify that the exact old permission is overbroad.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
DO $baseline$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>3
 THEN RAISE EXCEPTION 'SEC_S4_BASELINE_LEAK_NOT_REPRODUCED'; END IF;
END
$baseline$;
RESET ROLE;

\i security/sec_s4_employee_docs_store_scoped_rls.sql

-- Owner at store 2: own file + new unregistered upload allowed;
-- store 1 and orphan must be excluded.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
DO $owner2$
DECLARE affected bigint;
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>1
 OR (SELECT count(*) FROM storage.objects WHERE name='202/original.pdf')<>1
 THEN RAISE EXCEPTION 'SEC_S4_CROSS_STORE_SELECT_STILL_EXPOSED'; END IF;
 IF public.sec_s4_employee_doc_file_access_v1('101/forged.pdf')
 OR public.sec_s4_employee_doc_file_access_v1('404/legacy-orphan.pdf')
 OR public.sec_s4_employee_doc_file_access_v1('9223372036854775808/overflow.pdf')
 OR public.sec_s4_employee_doc_file_access_v1('0202/alias.pdf')
 OR public.sec_s4_employee_doc_file_access_v1('nonnumeric/file.pdf')
 THEN RAISE EXCEPTION 'SEC_S4_PATH_HELPER_ALLOWED_FOREIGN_OR_MALFORMED'; END IF;
 BEGIN
  INSERT INTO storage.objects VALUES(10,'employee-docs','101/forged.pdf');
  RAISE EXCEPTION 'SEC_S4_CROSS_STORE_UPLOAD_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO storage.objects VALUES(11,'employee-docs','202/new-before-doc-metadata.pdf');
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>2
 THEN RAISE EXCEPTION 'SEC_S4_OWNER_UPLOAD_BROKEN'; END IF;
 DELETE FROM storage.objects WHERE name='101/original.pdf';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'SEC_S4_CROSS_STORE_DELETE_ALLOWED'; END IF;
END
$owner2$;
RESET ROLE;

-- Owner at store 1: only own existing doc visible/deletable.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
DO $owner1$
DECLARE affected bigint;
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>1
 THEN RAISE EXCEPTION 'SEC_S4_OWNER1_LOST_OWN_DOCUMENT'; END IF;
 DELETE FROM storage.objects WHERE name='101/original.pdf';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'SEC_S4_OWN_DELETE_BLOCKED'; END IF;
END
$owner1$;
RESET ROLE;

-- Delegated assistant without document authority cannot read any private file.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000004';
DO $assistant$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>0
 THEN RAISE EXCEPTION 'SEC_S4_ASSISTANT_DOCUMENT_LEAK'; END IF;
END
$assistant$;
RESET ROLE;

-- HQ retains original, orphan and newly uploaded objects access.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
DO $hq$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>3
 OR (SELECT count(*) FROM storage.objects WHERE name='404/legacy-orphan.pdf')<>1
 THEN RAISE EXCEPTION 'SEC_S4_HQ_ARCHIVE_RECOVERY_BROKEN'; END IF;
END
$hq$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $guest$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='employee-docs')<>0
 THEN RAISE EXCEPTION 'SEC_S4_ANON_DOC_LEAK'; END IF;
END
$guest$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS SEC-S4 PG16/17: formerly 3 leaked, now store-only SELECT/INSERT/DELETE, owner upload-before-metadata, HQ orphan recovery, assistant/guest denied, rollback-only' AS result;
