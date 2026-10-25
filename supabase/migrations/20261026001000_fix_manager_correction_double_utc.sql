-- 2026-10-26 P0: human attendance corrections must be stored in the
-- post-2026-10-13 KST-wall-clock format expected by the existing universal
-- attendance_correction_effective_utc()/kst() readers.
--
-- Before: admin_correct_event converted local p_new_at to UTC while the
-- post-cutover readers *also* interpreted it as local and subtracted 9 hours.
-- Result: 13:08 was shown as 04:08; incomplete/orphan sessions prompted
-- repeated ADD OUT, including actual INHA store records 107-109.
--
-- No existing raw event or correction is deleted or reinterpreted here.
-- Existing historical corrections require narrowly scoped, audited recovery.
CREATE OR REPLACE FUNCTION public.admin_correct_event(
 p_action text,
 p_event_id bigint,
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
DECLARE v_id bigint; v_actor text; v_target bigint;
BEGIN
 IF NOT public.can_manage_store(
   (SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_event_id IS NOT NULL AND p_action<>'VOID_ADD' AND NOT EXISTS(
   SELECT 1 FROM public.attendance_events a
   WHERE a.id=p_event_id AND a.employee_id=p_employee_id
 ) THEN RAISE EXCEPTION 'EVENT_EMPLOYEE_MISMATCH'; END IF;
 v_actor:=coalesce(auth.jwt()->>'email','admin');

 IF p_action='VOID_ADD' THEN
   IF p_event_id IS NULL THEN RAISE EXCEPTION 'CORRECTION_ID_REQUIRED'; END IF;
   SELECT id INTO v_target FROM public.event_corrections
   WHERE id=p_event_id AND employee_id=p_employee_id AND action='ADD'
      AND position('[VOID_ADD:' IN coalesce(reason,''))=0;
   IF v_target IS NULL THEN RAISE EXCEPTION 'ACTIVE_ADD_CORRECTION_NOT_FOUND'; END IF;
   INSERT INTO public.event_corrections
      (event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
   VALUES(null,p_employee_id,'VOID_ADD',null,null,p_reason,v_actor)
      RETURNING id INTO v_id;
   UPDATE public.event_corrections
      SET reason=coalesce(reason,'')||' [VOID_ADD:'||v_id||']'
      WHERE id=v_target;
   RETURN v_id;
 END IF;

 IF p_action NOT IN ('ADD','EDIT_TIME','EDIT_TYPE','VOID')
 THEN RAISE EXCEPTION 'INVALID_CORRECTION_ACTION'; END IF;
 IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL
 THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED'; END IF;
 IF p_action IN ('ADD','EDIT_TIME') AND
    (p_new_at IS NULL OR p_new_type NOT IN ('IN','OUT'))
 THEN RAISE EXCEPTION 'INVALID_CORRECTION_TIME_OR_TYPE'; END IF;
 IF p_action='ADD' THEN
   IF p_event_id IS NOT NULL THEN RAISE EXCEPTION 'ADD_EVENT_ID_MUST_BE_NULL'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('attendance-add:'||p_employee_id::text,0));
   -- One active employee/type/clock correction, even on double-click or
   -- after an uncertain network response. A voided ADD is not active.
   IF EXISTS(
     SELECT 1 FROM public.event_corrections c
     WHERE c.employee_id=p_employee_id AND c.action='ADD'
       AND c.new_event_type=p_new_type
       AND position('[VOID_ADD:' IN coalesce(c.reason,''))=0
       AND public.attendance_correction_effective_kst(
           c.new_event_at,c.created_by,c.created_at)=p_new_at
   ) THEN RAISE EXCEPTION 'DUPLICATE_ATTENDANCE_CORRECTION'; END IF;
 ELSIF p_event_id IS NULL THEN
   RAISE EXCEPTION 'EVENT_ID_REQUIRED';
 END IF;

 -- CRITICAL: keep the submitted KST local time UNCONVERTED. Current readers
 -- already convert post-cutover human KST to UTC for payroll/projection and
 -- return the very same local wall clock to all UI/API consumers.
 INSERT INTO public.event_corrections
   (event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
 VALUES(p_event_id,p_employee_id,p_action,p_new_at,p_new_type,p_reason,v_actor)
 RETURNING id INTO v_id;
 RETURN v_id;
END
$function$;
