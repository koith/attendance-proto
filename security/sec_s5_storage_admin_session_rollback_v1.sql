-- SEC-S5 EMERGENCY ROLLBACK ONLY. Scoped former S4 helper, NEVER restore old
-- global is_admin() storage policy, and do not modify real data.
DO $pre$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc
 WHERE oid='public.sec_s4_employee_doc_file_access_v1(text)'::regprocedure
 AND prosrc LIKE '%PERFORM session_guard.require_latest_session()%')
 THEN RAISE EXCEPTION 'SEC_S5_STORAGE_ROLLBACK_UNEXPECTED_STATE'; END IF;
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
 AND prosrc LIKE '%public.can_manage_store(e.store_id)%'
 AND prosrc NOT LIKE '%session_guard.require_latest_session()%')
 THEN RAISE EXCEPTION 'SEC_S5_STORAGE_ROLLBACK_INCOMPLETE'; END IF;
END
$verify$;
