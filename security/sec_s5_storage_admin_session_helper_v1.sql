-- SEC-S5: scoped Storage employee document latest-admin-session check.
-- No changes to real employee, contract, auth.sessions, RLS policy or Storage object rows.
-- This does NOT activate global PostgREST db_pre_request or solve Realtime.
DO $pre$
BEGIN
 IF to_regprocedure('public.sec_s4_employee_doc_file_access_v1(text)') IS NULL
 OR to_regprocedure('session_guard.require_latest_session()') IS NULL
 OR to_regclass('session_guard.latest_session') IS NULL
 OR NOT EXISTS (SELECT 1 FROM pg_proc
   WHERE oid='public.sec_s4_employee_doc_file_access_v1(text)'::regprocedure
   AND prosecdef AND prosrc LIKE '%public.can_manage_store(e.store_id)%'
   AND prosrc NOT LIKE '%session_guard.require_latest_session()%')
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
     AND policyname IN ('empdoc_admin_select','empdoc_admin_delete')
     AND qual LIKE '%sec_s4_employee_doc_file_access_v1%') <> 2
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
     AND policyname='empdoc_admin_insert' AND with_check LIKE '%sec_s4_employee_doc_file_access_v1%') <> 1
 THEN RAISE EXCEPTION 'SEC_S5_STORAGE_GUARD_PRECHECK_MISMATCH_STOP'; END IF;
 IF has_function_privilege('anon','public.sec_s4_employee_doc_file_access_v1(text)','EXECUTE')
 THEN RAISE EXCEPTION 'SEC_S5_STORAGE_GUARD_ANON_EXECUTE_UNEXPECTED'; END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.sec_s4_employee_doc_file_access_v1(p_object_name text)
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
  -- Storage API skips PostgREST db_pre_request. Check latest admin session
  -- directly for every employee-doc Storage SELECT / INSERT / DELETE.
  -- This function is called only after a verified auth.uid claim exists.
  PERFORM session_guard.require_latest_session();
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

DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc
  WHERE oid='public.sec_s4_employee_doc_file_access_v1(text)'::regprocedure
  AND prosecdef AND prosrc LIKE '%PERFORM session_guard.require_latest_session()%')
 OR has_function_privilege('anon','public.sec_s4_employee_doc_file_access_v1(text)','EXECUTE')
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 3
 THEN RAISE EXCEPTION 'SEC_S5_STORAGE_LATEST_SESSION_GUARD_NOT_INSTALLED'; END IF;
END
$verify$;
