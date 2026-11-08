-- SEC-S4 document custody: enforce existing UI 24h deletion policy at RPC AND Storage.
-- Changes authorization only; no live file/metadata rows modified. Review before hosted deploy.
DO $pre$
BEGIN
 IF to_regprocedure('public.admin_doc_delete(bigint)') IS NULL
  OR to_regprocedure('public.sec_s4_employee_doc_file_access_v1(text)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage'
    AND tablename='objects' AND policyname='empdoc_admin_delete'
    AND qual LIKE '%sec_s4_employee_doc_file_access_v1%'
    AND qual NOT LIKE '%owner_id%')
 THEN RAISE EXCEPTION 'SEC_S4_RETENTION_EXPECTED_SCOPE_GUARD_MISSING_OR_DRIFTED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc
   WHERE oid='public.admin_doc_delete(bigint)'::regprocedure
     AND prosrc LIKE '%TOO_OLD_TO_DELETE%')
 THEN RAISE EXCEPTION 'SEC_S4_RETENTION_ALREADY_ENFORCED_STOP_REVIEW'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='storage' AND table_name='objects'
   AND column_name='owner_id' AND data_type='text')
 THEN RAISE EXCEPTION 'SEC_S4_RETENTION_EXPECTED_STORAGE_OWNER_ID_MISSING'; END IF;
END
$pre$;

-- Preserve existing json RPC signature, existing full-store/verified-account gate
-- and original deletion response. Deny expired or other-uploader requests.
CREATE OR REPLACE FUNCTION public.admin_doc_delete(p_document_id bigint)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $doc_delete$
DECLARE
 v_row public.employee_documents%rowtype;
 v_actor_email text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 SELECT * INTO v_row FROM public.employee_documents WHERE id=p_document_id;
 IF NOT FOUND THEN RETURN json_build_object('ok',false,'error','DOC_NOT_FOUND'); END IF;
 IF NOT public.can_manage_store(
     (SELECT e.store_id FROM public.employees e WHERE e.id=v_row.employee_id)
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 -- Server-authoritative: a document remains immutable after 24 hours.
 IF v_row.uploaded_at IS NULL OR v_row.uploaded_at < now()-interval '24 hours' THEN
   RETURN json_build_object('ok',false,'error','TOO_OLD_TO_DELETE');
 END IF;
 v_actor_email := lower(nullif(auth.jwt()->>'email',''));
 IF v_actor_email IS NULL OR v_row.uploaded_by_email IS NULL
    OR lower(v_row.uploaded_by_email)<>v_actor_email THEN
   RAISE EXCEPTION 'NOT_AUTHORIZED';
 END IF;
 DELETE FROM public.employee_documents WHERE id=p_document_id;
 RETURN json_build_object('ok',true,'storage_path',v_row.storage_path);
END
$doc_delete$;

-- Storage is deleted BEFORE document metadata in current app. Its created_at
-- always precedes or equals document uploaded_at on the normal upload path.
-- Hence an expired object is rejected before metadata can be lost; a newly
-- uploaded unregistered object can be cleaned by its actual owner.
ALTER POLICY empdoc_admin_delete ON storage.objects
  USING(
    bucket_id='employee-docs'
    AND public.sec_s4_employee_doc_file_access_v1(name)
    AND created_at>=now()-interval '24 hours'
    AND owner_id=(SELECT auth.uid())::text
  );

DO $post$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
   AND policyname='empdoc_admin_delete'
   AND qual LIKE '%sec_s4_employee_doc_file_access_v1%'
   AND qual LIKE '%created_at%'
   AND qual LIKE '%owner_id%')
 OR NOT EXISTS(SELECT 1 FROM pg_proc
 WHERE oid='public.admin_doc_delete(bigint)'::regprocedure
 AND prosrc LIKE '%TOO_OLD_TO_DELETE%')
 THEN RAISE EXCEPTION 'SEC_S4_RETENTION_INSTALL_NOT_VERIFIED'; END IF;
END
$post$;

-- Emergency reversal: restore reviewed previous policy DELETE USING
-- (bucket_id='employee-docs' AND public.sec_s4_employee_doc_file_access_v1(name))
-- and previous public.admin_doc_delete RPC body from recorded preflight.
-- Never reverse the store-scope fix to the old globally permissive is_admin().
