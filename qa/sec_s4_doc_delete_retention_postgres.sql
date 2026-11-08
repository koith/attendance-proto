\set ON_ERROR_STOP on
-- Synthetic PG16/17. Reproduces 24h bypass then tests actual policy/RPC.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage,auth TO anon,authenticated;
CREATE TABLE public.employees(id bigint PRIMARY KEY,store_id bigint);
CREATE TABLE public.mgr(uid uuid PRIMARY KEY,store_id bigint,role text);
CREATE TABLE public.employee_documents (
 id bigint PRIMARY KEY,employee_id bigint,storage_path text,
 filename text,content_type text,byte_size integer,
 uploaded_by_email text,uploaded_at timestamptz
);
CREATE TABLE storage.objects (
 id bigint PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL,
 owner_id text,created_at timestamptz NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,DELETE ON storage.objects TO authenticated,anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$f$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$f$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.mgr m WHERE m.uid=auth.uid() AND m.role IN ('HQ','OWNER'))
$f$;
CREATE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.mgr m WHERE m.uid=auth.uid() AND m.role='HQ')
$f$;
CREATE FUNCTION public.can_manage_store(p_store_id bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.mgr m WHERE m.uid=auth.uid() AND (m.role='HQ' OR (m.role='OWNER' AND m.store_id=p_store_id)))
$f$;
INSERT INTO public.mgr VALUES
 ('00000000-0000-4000-8000-000000000001',1,'OWNER'),
 ('00000000-0000-4000-8000-000000000002',2,'OWNER'),
 ('00000000-0000-4000-8000-000000000003',null,'HQ');
INSERT INTO public.employees VALUES (101,1),(202,2);
INSERT INTO public.employee_documents VALUES
 (1,101,'101/old.pdf','old.pdf','application/pdf',1024,'owner1@example.invalid',now()-interval '5 days'),
 (2,101,'101/recent.pdf','recent.pdf','application/pdf',1024,'owner1@example.invalid',now()-interval '10 minutes'),
 (3,202,'202/recent.pdf','other.pdf','application/pdf',1024,'owner2@example.invalid',now()-interval '10 minutes');
INSERT INTO storage.objects VALUES
 (1,'employee-docs','101/old.pdf','00000000-0000-4000-8000-000000000001',now()-interval '5 days'),
 (2,'employee-docs','101/recent.pdf','00000000-0000-4000-8000-000000000001',now()-interval '11 minutes'),
 (3,'employee-docs','202/recent.pdf','00000000-0000-4000-8000-000000000002',now()-interval '11 minutes'),
 (4,'employee-docs','101/unregistered.pdf','00000000-0000-4000-8000-000000000001',now()-interval '1 minute');
-- Reuse same protected scope semantics with synthetic helper; no real employee data.
CREATE FUNCTION public.sec_s4_employee_doc_file_access_v1(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $f$
 SELECT public.is_hq_admin() OR EXISTS(SELECT 1 FROM public.employees e
  WHERE e.id::text=split_part(p_name,'/',1) AND public.can_manage_store(e.store_id))
$f$;
GRANT EXECUTE ON FUNCTION public.sec_s4_employee_doc_file_access_v1(text) TO authenticated;
CREATE POLICY empdoc_admin_select ON storage.objects
 FOR SELECT TO authenticated USING(bucket_id='employee-docs' AND public.sec_s4_employee_doc_file_access_v1(name));
CREATE POLICY empdoc_admin_delete ON storage.objects
 FOR DELETE TO authenticated USING(bucket_id='employee-docs' AND public.sec_s4_employee_doc_file_access_v1(name));

-- Old server RPC had no 24h or same-uploader protection: baseline reproducible.
CREATE FUNCTION public.admin_doc_delete(p_document_id bigint) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp
AS $old$
DECLARE v_row public.employee_documents%rowtype;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 SELECT * INTO v_row FROM public.employee_documents WHERE id=p_document_id;
 IF NOT FOUND THEN RETURN json_build_object('ok',false,'error','DOC_NOT_FOUND'); END IF;
 IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=v_row.employee_id))
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 DELETE FROM public.employee_documents WHERE id=p_document_id;
 RETURN json_build_object('ok',true,'storage_path',v_row.storage_path);
END
$old$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims"='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner1@example.invalid"}';
SAVEPOINT before_unsafe_delete;
DO $legacy$
BEGIN
 IF (SELECT public.admin_doc_delete(1)->>'ok')<>'true'
 THEN RAISE EXCEPTION 'SEC_S4_RETENTION_OLD_BYPASS_NOT_REPRODUCED'; END IF;
END
$legacy$;
ROLLBACK TO SAVEPOINT before_unsafe_delete;
RESET ROLE;

\i security/sec_s4_doc_delete_retention_24h.sql
-- Old metadata + old Storage object must both remain, even when own-store owner attempts deletion.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims"='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner1@example.invalid"}';
DO $owner$
DECLARE affected bigint;
BEGIN
 IF (SELECT public.admin_doc_delete(1)->>'error')<>'TOO_OLD_TO_DELETE'
 THEN RAISE EXCEPTION 'SEC_S4_OLD_METADATA_DELETION_NOT_BLOCKED'; END IF;
 DELETE FROM storage.objects WHERE name='101/old.pdf';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'SEC_S4_OLD_STORAGE_OBJECT_REMOVED'; END IF;
 -- Simulate app's Storage-first cleanup on fresh uploaded file with no metadata row.
 DELETE FROM storage.objects WHERE name='101/unregistered.pdf';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'SEC_S4_FRESH_UPLOAD_CLEANUP_BROKEN'; END IF;
 DELETE FROM storage.objects WHERE name='101/recent.pdf';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'SEC_S4_OWN_FRESH_STORAGE_DELETE_DENIED'; END IF;
 IF (SELECT public.admin_doc_delete(2)->>'ok')<>'true'
 THEN RAISE EXCEPTION 'SEC_S4_OWN_FRESH_METADATA_DELETE_DENIED'; END IF;
END
$owner$;
RESET ROLE;
DO $verify_unchanged$
BEGIN
 IF (SELECT count(*) FROM public.employee_documents WHERE id=1)<>1
 THEN RAISE EXCEPTION 'SEC_S4_OLD_METADATA_REMOVED'; END IF;
END
$verify_unchanged$;

-- HQ cannot delete another uploader's fresh document or past retention object.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET LOCAL "request.jwt.claims"='{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","email":"hq@example.invalid"}';
DO $hq$
DECLARE affected bigint;
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE name='202/recent.pdf')<>1
 THEN RAISE EXCEPTION 'SEC_S4_HQ_FILE_READ_BROKEN'; END IF;
 DELETE FROM storage.objects WHERE name='202/recent.pdf';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'SEC_S4_OTHER_UPLOADER_STORAGE_DELETE_ALLOWED'; END IF;
 BEGIN
  PERFORM public.admin_doc_delete(3);
  RAISE EXCEPTION 'SEC_S4_OTHER_UPLOADER_RPC_ALLOWED';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF;
 END;
END
$hq$;
RESET ROLE;

-- Foreign store manager may not remove anything, including fresh objects.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claims"='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","email":"owner2@example.invalid"}';
DO $foreign$
DECLARE affected bigint;
BEGIN
 DELETE FROM storage.objects WHERE name='101/old.pdf';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'SEC_S4_FOREIGN_STORE_STORAGE_DELETE_ALLOWED'; END IF;
END
$foreign$;
RESET ROLE;
\i security/sec_s4_doc_delete_retention_rollback_v1.sql
DO $rollback_safety$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname='empdoc_admin_delete' AND qual LIKE '%sec_s4_employee_doc_file_access_v1%'
  AND qual NOT LIKE '%owner_id%')
 THEN RAISE EXCEPTION 'SEC_S4_ROLLBACK_MUST_KEEP_STORE_SCOPE'; END IF;
END
$rollback_safety$;
ROLLBACK;
SELECT 'PASS SEC-S4: expired metadata+Storage protected, uploader ownership, foreign denial, fresh upload cleanup and 24h owner deletion; PG16/17 isolated transaction rollback' AS result;
