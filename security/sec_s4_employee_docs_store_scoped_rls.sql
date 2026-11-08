-- SEC-S4 REVIEW-ONLY: storage.objects policy guard for employee document files.
-- Existing app uploads first to employee_id/uuid.ext, then creates document metadata.
-- Use actual numeric employee path prefix, not possibly uncommitted document metadata.
-- HQ may recover 4 old objects with deleted/unmapped employee IDs; other stores may not.
-- This changes policies only. No real object or payroll/employee data DML.
DO $sec_s4_preflight$
BEGIN
  IF to_regclass('storage.objects') IS NULL
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
     OR to_regclass('public.employees') IS NULL
     OR to_regprocedure('public.can_manage_store(bigint)') IS NULL
     OR to_regprocedure('public.is_hq_admin()') IS NULL
  THEN RAISE EXCEPTION 'SEC_S4_EXPECTED_STORAGE_RLS_OR_MANAGER_GUARD_MISSING'; END IF;
  IF to_regprocedure('public.sec_s4_employee_doc_file_access_v1(text)') IS NOT NULL
  THEN RAISE EXCEPTION 'SEC_S4_ALREADY_INSTALLED_STOP_FOR_REVIEW'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects')<>3
   OR (SELECT count(*) FROM pg_policies
       WHERE schemaname='storage' AND tablename='objects'
         AND policyname IN ('empdoc_admin_select','empdoc_admin_insert','empdoc_admin_delete')
         AND roles=ARRAY['authenticated']::name[])<>3
   OR (SELECT count(*) FROM pg_policies
       WHERE schemaname='storage' AND tablename='objects'
         AND policyname IN ('empdoc_admin_select','empdoc_admin_delete')
         AND qual ILIKE '%is_admin()%')<>2
   OR (SELECT count(*) FROM pg_policies
       WHERE schemaname='storage' AND tablename='objects'
         AND policyname='empdoc_admin_insert'
         AND with_check ILIKE '%is_admin()%')<>1
  THEN RAISE EXCEPTION 'SEC_S4_STORAGE_POLICY_DRIFT_STOP_FOR_REVIEW'; END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects o JOIN public.employee_documents d ON d.storage_path=o.name
    WHERE o.bucket_id='employee-docs'
      AND split_part(o.name,'/',1)<>d.employee_id::text
  ) THEN RAISE EXCEPTION 'SEC_S4_EXISTING_FILE_PATH_EMPLOYEE_MISMATCH'; END IF;
END
$sec_s4_preflight$;

CREATE FUNCTION public.sec_s4_employee_doc_file_access_v1(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $sec_s4_guard$
DECLARE
  v_prefix text;
  v_employee_id bigint;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_object_name IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_hq_admin() THEN
    RETURN true;
  END IF;
  IF position('/' IN p_object_name)=0 THEN RETURN false; END IF;
  v_prefix := split_part(p_object_name,'/',1);
  IF v_prefix !~ '^[0-9]{1,19}$' THEN RETURN false; END IF;
  BEGIN
    v_employee_id := v_prefix::bigint;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RETURN false;
  END;
  IF v_employee_id::text<>v_prefix THEN RETURN false; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.employees e
    WHERE e.id=v_employee_id
      AND e.store_id IS NOT NULL
      AND public.can_manage_store(e.store_id)
  );
END
$sec_s4_guard$;
REVOKE ALL ON FUNCTION public.sec_s4_employee_doc_file_access_v1(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sec_s4_employee_doc_file_access_v1(text)
  TO authenticated;

ALTER POLICY empdoc_admin_select ON storage.objects
  USING (bucket_id='employee-docs'
    AND public.sec_s4_employee_doc_file_access_v1(name));
ALTER POLICY empdoc_admin_insert ON storage.objects
  WITH CHECK (bucket_id='employee-docs'
    AND public.sec_s4_employee_doc_file_access_v1(name));
ALTER POLICY empdoc_admin_delete ON storage.objects
  USING (bucket_id='employee-docs'
    AND public.sec_s4_employee_doc_file_access_v1(name));

DO $sec_s4_verify$
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
        AND policyname IN ('empdoc_admin_select','empdoc_admin_delete')
        AND qual LIKE '%sec_s4_employee_doc_file_access_v1%')<>2
   OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
        AND policyname='empdoc_admin_insert'
        AND with_check LIKE '%sec_s4_employee_doc_file_access_v1%')<>1
   OR has_function_privilege('anon','public.sec_s4_employee_doc_file_access_v1(text)','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.sec_s4_employee_doc_file_access_v1(text)','EXECUTE')
  THEN RAISE EXCEPTION 'SEC_S4_STORAGE_SCOPE_INSTALL_OR_EXECUTE_GRANTS_FAILED'; END IF;
END
$sec_s4_verify$;

-- Rollback (do not execute casually): restore original
-- SELECT/DELETE USING ((bucket_id='employee-docs') AND public.is_admin()),
-- INSERT WITH CHECK same; then DROP FUNCTION IF EXISTS ... after replacing policies.
