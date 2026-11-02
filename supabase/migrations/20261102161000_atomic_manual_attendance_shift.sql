-- FIX P0: atomic manual complete-shift correction, no change to historical rows.
-- Deploy database RPC before shipping the corresponding browser caller.
-- Existing admin_correct_event remains unchanged for individual corrections.
CREATE OR REPLACE FUNCTION public.admin_add_completed_attendance_shift(
  p_employee_id bigint,
  p_in_at timestamp without time zone,
  p_out_at timestamp without time zone,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $body$
DECLARE
  v_store_id bigint;
  v_actor text;
  v_open boolean := false;
  v_event record;
  v_in_id bigint;
  v_out_id bigint;
BEGIN
  SELECT e.store_id INTO v_store_id
    FROM public.employees e WHERE e.id=p_employee_id;
  IF v_store_id IS NULL OR public.can_manage_store(v_store_id) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

  IF p_in_at IS NULL OR p_out_at IS NULL OR p_out_at<=p_in_at
  THEN RAISE EXCEPTION 'INVALID_ATTENDANCE_INTERVAL'; END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL
  THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED'; END IF;

  -- Serialize with original single-event ADD and live punch.
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance-add:'||p_employee_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));

  -- Effective raw + corrected + active manual events, same precedence as
  -- live punch; KST wall times are compared consistently.
  FOR v_event IN
    WITH latest_corr AS (
      SELECT DISTINCT ON(c.event_id)
        c.event_id,c.action,c.new_event_at,c.new_event_type,c.created_by,c.created_at
      FROM public.event_corrections c
      WHERE c.employee_id=p_employee_id AND c.event_id IS NOT NULL
      ORDER BY c.event_id,c.created_at DESC,c.id DESC
    ), effective AS (
      SELECT a.id::numeric AS ord,
        CASE WHEN c.action='EDIT_TYPE' AND c.new_event_type IS NOT NULL
             THEN c.new_event_type ELSE a.event_type END AS typ,
        CASE WHEN c.action='EDIT_TIME' AND c.new_event_at IS NOT NULL
             THEN public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)
             ELSE (a.event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'
        END AS event_kst
      FROM public.attendance_events a
      LEFT JOIN latest_corr c ON c.event_id=a.id
      WHERE a.employee_id=p_employee_id AND coalesce(c.action,'')<>'VOID'
      UNION ALL
      SELECT 1000000000000000::numeric+c.id,c.new_event_type,
        public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)
      FROM public.event_corrections c
      WHERE c.employee_id=p_employee_id
        AND c.action='ADD'
        AND coalesce(c.reason,'') NOT LIKE '%[VOID_ADD:%'
        AND c.new_event_at IS NOT NULL AND c.new_event_type IS NOT NULL
    )
    SELECT typ,event_kst FROM effective
      WHERE event_kst IS NOT NULL AND event_kst<=p_out_at
      ORDER BY event_kst,ord
  LOOP
    -- Includes exact endpoint collisions, orphan punches, and overlapping
    -- existing sessions; do not silently break payroll pairing.
    IF v_event.event_kst>=p_in_at THEN
      RAISE EXCEPTION 'OVERLAPPING_ATTENDANCE_INTERVAL';
    END IF;
    IF v_event.typ='IN' THEN v_open:=true;
    ELSIF v_event.typ='OUT' THEN v_open:=false;
    END IF;
  END LOOP;
  IF v_open THEN
    RAISE EXCEPTION 'OVERLAPPING_ATTENDANCE_INTERVAL';
  END IF;

  v_actor:=coalesce(auth.jwt()->>'email','admin');
  INSERT INTO public.event_corrections
    (event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
  VALUES(null,p_employee_id,'ADD',p_in_at,'IN',p_reason,v_actor)
  RETURNING id INTO v_in_id;

  INSERT INTO public.event_corrections
    (event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
  VALUES(null,p_employee_id,'ADD',p_out_at,'OUT',p_reason,v_actor)
  RETURNING id INTO v_out_id;

  RETURN jsonb_build_object('ok',true,'in_id',v_in_id,'out_id',v_out_id);
END
$body$;
REVOKE ALL ON FUNCTION public.admin_add_completed_attendance_shift(bigint,timestamp without time zone,timestamp without time zone,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_add_completed_attendance_shift(bigint,timestamp without time zone,timestamp without time zone,text) TO authenticated,service_role;
