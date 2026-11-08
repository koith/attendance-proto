-- SEC-S4 EMERGENCY ROLLBACK ONLY. Never execute on production unless a verified
-- regression in 24h deletion policy requires restoring the immediately prior
-- *store-scoped* delete behavior. Does NOT restore globally permissive is_admin().
DO $pre$
BEGIN
 IF to_regprocedure('public.sec_s4_employee_doc_file_access_v1(text)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.admin_doc_delete(bigint)'::regprocedure AND prosrc LIKE '%TOO_OLD_TO_DELETE%')
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
   AND policyname='empdoc_admin_delete' AND qual LIKE '%owner_id%'
   AND qual LIKE '%sec_s4_employee_doc_file_access_v1%')
 THEN RAISE EXCEPTION 'SEC_S4_ROLLBACK_STATE_DRIFT_STOP'; END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.admin_doc_delete(p_document_id bigint)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
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

ALTER POLICY empdoc_admin_delete ON storage.objects
  USING(bucket_id='employee-docs'
    AND public.sec_s4_employee_doc_file_access_v1(name));

DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname='empdoc_admin_delete'
  AND qual LIKE '%sec_s4_employee_doc_file_access_v1%'
  AND qual NOT LIKE '%owner_id%')
 OR EXISTS(SELECT 1 FROM pg_proc
  WHERE oid='public.admin_doc_delete(bigint)'::regprocedure
  AND prosrc LIKE '%TOO_OLD_TO_DELETE%')
 THEN RAISE EXCEPTION 'SEC_S4_ROLLBACK_UNVERIFIED'; END IF;
END
$verify$;
