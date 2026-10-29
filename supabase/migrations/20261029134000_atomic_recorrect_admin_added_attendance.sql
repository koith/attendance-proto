-- 2026-10-29: allow repeated corrections of manager-created attendance without
-- deleting original punches or leaving half-written VOID_ADD/ADD pairs.
-- A single PostgreSQL function call is one transaction: if ADD validation
-- fails, its preceding VOID_ADD and reason marker roll back together.
CREATE OR REPLACE FUNCTION public.store_attendance_replace_added_event(
  p_correction_id bigint,
  p_employee_id bigint,
  p_new_at timestamp without time zone,
  p_new_type text,
  p_reason text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old public.event_corrections%ROWTYPE;
  v_new_id bigint;
  v_store_id bigint;
BEGIN
  SELECT e.store_id INTO v_store_id
  FROM public.employees e WHERE e.id=p_employee_id;
  IF v_store_id IS NULL OR NOT public.can_manage_store_attendance(v_store_id)
  THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL
  THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED'; END IF;
  IF p_correction_id IS NULL OR p_new_at IS NULL
     OR p_new_type NOT IN ('IN','OUT') OR p_new_type IS NULL
  THEN RAISE EXCEPTION 'INVALID_REPLACEMENT_CORRECTION'; END IF;

  -- Synchronize with regular ADD so concurrent edits cannot create duplicates.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('attendance-add:'||p_employee_id::text,0)
  );
  SELECT c.* INTO v_old
  FROM public.event_corrections c
  WHERE c.id=p_correction_id AND c.employee_id=p_employee_id
    AND c.action='ADD'
    AND position('[VOID_ADD:' IN coalesce(c.reason,''))=0
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_ADD_CORRECTION_NOT_FOUND'; END IF;
  IF v_old.new_event_type IS DISTINCT FROM p_new_type
  THEN RAISE EXCEPTION 'REPLACEMENT_EVENT_TYPE_MISMATCH'; END IF;
  IF public.attendance_correction_effective_kst(
       v_old.new_event_at,v_old.created_by,v_old.created_at
     )=p_new_at
  THEN RAISE EXCEPTION 'CORRECTION_TIME_UNCHANGED'; END IF;

  -- Reuse the deployed store-scoped authorization, audit and duplication
  -- rules. Both writes commit or both roll back; no raw punch is mutated.
  PERFORM public.store_attendance_correct_event(
    'VOID_ADD',p_correction_id,p_employee_id,NULL,NULL,p_reason
  );
  v_new_id:=public.store_attendance_correct_event(
    'ADD',NULL,p_employee_id,p_new_at,p_new_type,
    p_reason||' [REPLACES_ADD:'||p_correction_id||']'
  );
  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.store_attendance_replace_added_event(
  bigint,bigint,timestamp without time zone,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_attendance_replace_added_event(
  bigint,bigint,timestamp without time zone,text,text
) TO authenticated, service_role;
COMMENT ON FUNCTION public.store_attendance_replace_added_event(
  bigint,bigint,timestamp without time zone,text,text
) IS 'Atomic audit-preserving re-correction of a store-scoped administrator ADD event.';
