-- QA1243: delegated attendance access remains separate from full administrator access.
-- No employee, event, payroll, account or existing permission rows are rewritten.
ALTER TABLE public.store_delegated_permissions ADD COLUMN IF NOT EXISTS attendance_view boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.can_view_store_attendance(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
 SELECT public.can_manage_store(p_store_id) OR EXISTS(
 SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
 JOIN public.stores s ON s.id=a.store_id
 JOIN public.store_delegated_permissions d ON d.store_id=a.store_id AND d.user_id=a.user_id
 WHERE a.user_id=auth.uid() AND a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
 AND s.is_active AND s.onboarding_status='READY'
 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
 AND (u.banned_until IS NULL OR u.banned_until<now())
 AND (d.attendance_view OR d.attendance_approve));
$fn$;
CREATE OR REPLACE FUNCTION public.can_manage_store_attendance(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
 SELECT public.can_manage_store(p_store_id) OR
 (public.can_view_store_attendance(p_store_id) AND EXISTS(
 SELECT 1 FROM public.store_delegated_permissions d WHERE d.store_id=p_store_id AND d.user_id=auth.uid() AND d.attendance_approve));
$fn$;
CREATE OR REPLACE FUNCTION public.store_attendance_employees(p_store_id bigint)
RETURNS TABLE(id bigint,name text,employee_no integer,is_active boolean,store_id bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 IF NOT public.can_view_store_attendance(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT e.id,e.name,e.employee_no,e.is_active,e.store_id FROM public.employees e WHERE e.store_id=p_store_id ORDER BY e.is_active DESC,e.name;
END $fn$;
CREATE OR REPLACE FUNCTION public.store_attendance_settings(p_store_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE h record;
BEGIN
 IF NOT public.can_view_store_attendance(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 SELECT open_minute,close_minute INTO h FROM public.store_settings WHERE store_id=p_store_id ORDER BY id LIMIT 1;
 RETURN jsonb_build_object('open_minute',coalesce(h.open_minute,420),'close_minute',coalesce(h.close_minute,1500));
END $fn$;
CREATE OR REPLACE FUNCTION public.store_attendance_events(p_store_id bigint, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.can_view_store_attendance(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>=p_to OR p_to-p_from>INTERVAL '400 days'
 THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
 RETURN jsonb_build_object(
   'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.employee_id,x.event_at,x.id)
     FROM (SELECT ev.id,ev.employee_id,ev.event_type,
       (ev.event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul' event_at
       FROM public.attendance_events ev JOIN public.employees e ON e.id=ev.employee_id
       WHERE e.store_id=p_store_id
         AND ev.event_at>=((p_from AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')
         AND ev.event_at<((p_to AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')) x),'[]'::jsonb),
   'corrections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id)
     FROM (SELECT ec.id,ec.event_id,ec.employee_id,ec.action,
         CASE WHEN ec.new_event_at IS NULL THEN NULL ELSE
           public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at) END new_event_at,
         ec.new_event_type,ec.reason,ec.created_by,ec.created_at
       FROM public.event_corrections ec JOIN public.employees e ON e.id=ec.employee_id
       WHERE e.store_id=p_store_id
         AND ec.created_at>=(p_from AT TIME ZONE 'Asia/Seoul')-INTERVAL '90 days'
         AND NOT(ec.action='ADD' AND ec.reason LIKE '%[VOID_ADD:%')
         AND ec.action<>'VOID_ADD') c),'[]'::jsonb));
END $function$
;
CREATE OR REPLACE FUNCTION public.store_attendance_correct_event(p_action text, p_event_id bigint, p_employee_id bigint, p_new_at timestamp without time zone, p_new_type text, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id bigint; v_actor text; v_target bigint;
BEGIN
 IF NOT public.can_manage_store_attendance(
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
   -- Also reject duplicates of EFFECTIVE source punches. This covers a
   -- raw punch whose latest correction changed its time/type (107->108).
   -- Match the same latest-correction semantics as the shipped day view;
   -- never collapse two genuine shifts at distinct instants.
   IF EXISTS (
     SELECT 1 FROM public.attendance_events a
     LEFT JOIN LATERAL (
       SELECT c.action,c.new_event_at,c.new_event_type,c.created_by,c.created_at
       FROM public.event_corrections c
       WHERE c.event_id=a.id AND c.employee_id=p_employee_id
         AND c.action IN ('EDIT_TIME','EDIT_TYPE','VOID')
       ORDER BY c.created_at DESC,c.id DESC LIMIT 1
     ) latest ON TRUE
     WHERE a.employee_id=p_employee_id
       AND latest.action IS DISTINCT FROM 'VOID'
       AND coalesce(latest.new_event_type,a.event_type)=p_new_type
       AND coalesce(
         public.attendance_correction_effective_kst(
           latest.new_event_at,latest.created_by,latest.created_at),
         (a.event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'
       )=p_new_at
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
$function$
;
CREATE OR REPLACE FUNCTION public.store_assistant_permissions_set(p_store_id bigint,p_user_id uuid,p_attendance_view boolean,p_attendance_manage boolean,p_staff_edit boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 IF NOT public.store_primary_owner_can_delegate(p_store_id,auth.uid()) THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 IF p_attendance_view IS NULL OR p_attendance_manage IS NULL OR p_staff_edit IS NULL THEN RAISE EXCEPTION 'INVALID_PERMISSIONS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=p_user_id AND a.store_id=p_store_id AND a.admin_role='STORE_MANAGER')
 THEN RAISE EXCEPTION 'MANAGER_NOT_FOUND'; END IF;
 IF p_user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE user_id=p_user_id)
 THEN RAISE EXCEPTION 'OWNER_PERMISSIONS_IMMUTABLE'; END IF;
 INSERT INTO public.store_delegated_permissions(store_id,user_id,attendance_view,attendance_approve,staff_edit,payroll_view,granted_by)
 VALUES(p_store_id,p_user_id,p_attendance_view OR p_attendance_manage,p_attendance_manage,p_staff_edit,false,auth.uid())
 ON CONFLICT(store_id,user_id) DO UPDATE SET attendance_view=excluded.attendance_view,attendance_approve=excluded.attendance_approve,staff_edit=excluded.staff_edit,payroll_view=false,granted_by=excluded.granted_by;
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id);
END $fn$;
CREATE OR REPLACE FUNCTION public.store_delegated_permissions_self()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a record; d public.store_delegated_permissions%ROWTYPE; v_owner boolean;
BEGIN
 SELECT admin_role,store_id INTO a FROM public.admin_users WHERE user_id=auth.uid();
 IF NOT FOUND OR a.admin_role NOT IN ('HQ','STORE_MANAGER') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF a.admin_role='HQ' THEN
  RETURN jsonb_build_object('limited',false,'staff_edit',true,'attendance_approve',true,'payroll_view',true);
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=a.store_id AND user_id=auth.uid()) INTO v_owner;
 SELECT * INTO d FROM public.store_delegated_permissions WHERE store_id=a.store_id AND user_id=auth.uid();
 RETURN jsonb_build_object(
  'limited', NOT v_owner AND d.user_id IS NOT NULL,
  'attendance_view',v_owner OR coalesce(d.attendance_view,false) OR coalesce(d.attendance_approve,false),
  'staff_edit',v_owner OR coalesce(d.staff_edit,true),
  'attendance_approve',v_owner OR coalesce(d.attendance_approve,true),
  'payroll_view',v_owner OR d.user_id IS NULL,
  'store_id',a.store_id);
END $function$
;
CREATE OR REPLACE FUNCTION public.store_delegated_permissions_set(p_store_id bigint, p_user_id uuid, p_staff_edit boolean, p_attendance_approve boolean, p_payroll_view boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF p_payroll_view IS TRUE THEN RAISE EXCEPTION 'ASSISTANT_PAYROLL_FORBIDDEN'; END IF;
 IF NOT public.store_primary_owner_can_delegate(p_store_id,auth.uid()) THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 IF p_user_id IS NULL OR p_staff_edit IS NULL OR p_attendance_approve IS NULL OR p_payroll_view IS NULL
 THEN RAISE EXCEPTION 'INVALID_PERMISSIONS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 IF p_user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id AND user_id=p_user_id)
 THEN RAISE EXCEPTION 'OWNER_PERMISSIONS_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a
  WHERE a.user_id=p_user_id AND a.store_id=p_store_id AND a.admin_role='STORE_MANAGER')
 THEN RAISE EXCEPTION 'MANAGER_NOT_FOUND'; END IF;
 INSERT INTO public.store_delegated_permissions(store_id,user_id,staff_edit,attendance_approve,payroll_view,granted_by)
 VALUES(p_store_id,p_user_id,p_staff_edit,p_attendance_approve,p_payroll_view,auth.uid())
 ON CONFLICT(store_id,user_id) DO UPDATE SET staff_edit=excluded.staff_edit,
  attendance_approve=excluded.attendance_approve,payroll_view=excluded.payroll_view,
  granted_by=excluded.granted_by,changed_at=now();
 RETURN jsonb_build_object('ok',true,'store_id',p_store_id,'user_id',p_user_id);
END $function$
;
CREATE OR REPLACE FUNCTION public.store_limited_payroll_read(p_store_id bigint, p_ym text)
 RETURNS TABLE(employee_name text, gross_pay integer, net_pay integer, base_pay integer, juhyu_pay integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 RAISE EXCEPTION 'ASSISTANT_PAYROLL_FORBIDDEN';
END $function$;
CREATE OR REPLACE FUNCTION public.store_scope_can(p_store_id bigint, p_scope text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
SELECT public.is_hq_admin() OR EXISTS(
 SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
 JOIN public.stores s ON s.id=a.store_id
 LEFT JOIN public.store_delegated_permissions d ON d.store_id=a.store_id AND d.user_id=a.user_id
 WHERE a.user_id=auth.uid() AND a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id
 AND s.is_active AND s.onboarding_status='READY'
 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
 AND (u.banned_until IS NULL OR u.banned_until<now())
 AND (EXISTS(SELECT 1 FROM public.store_primary_owners o WHERE o.store_id=p_store_id AND o.user_id=a.user_id)
 OR CASE p_scope
  WHEN 'STAFF_EDIT' THEN coalesce(d.staff_edit,true)
  WHEN 'ATTENDANCE_APPROVE' THEN coalesce(d.attendance_approve,true)
  WHEN 'PAYROLL_VIEW' THEN false
  ELSE false END)
);
$function$
;
REVOKE ALL ON FUNCTION public.can_view_store_attendance(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_view_store_attendance(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.can_manage_store_attendance(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store_attendance(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.store_attendance_employees(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_attendance_employees(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.store_attendance_settings(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_attendance_settings(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.store_attendance_events(bigint,timestamp without time zone,timestamp without time zone) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_attendance_events(bigint,timestamp without time zone,timestamp without time zone) TO authenticated;
REVOKE ALL ON FUNCTION public.store_attendance_correct_event(text,bigint,bigint,timestamp without time zone,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_attendance_correct_event(text,bigint,bigint,timestamp without time zone,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.store_assistant_permissions_set(bigint,uuid,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_assistant_permissions_set(bigint,uuid,boolean,boolean,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.store_assistant_permissions_list(p_store_id bigint)
RETURNS TABLE(user_id uuid,attendance_view boolean,attendance_approve boolean,staff_edit boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 IF NOT public.store_primary_owner_can_delegate(p_store_id,auth.uid()) THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 RETURN QUERY SELECT a.user_id,coalesce(d.attendance_view,false) OR coalesce(d.attendance_approve,false),coalesce(d.attendance_approve,false),coalesce(d.staff_edit,false)
 FROM public.admin_users a LEFT JOIN public.store_delegated_permissions d ON d.store_id=a.store_id AND d.user_id=a.user_id
 WHERE a.store_id=p_store_id AND a.admin_role='STORE_MANAGER';
END $fn$;
REVOKE ALL ON FUNCTION public.store_assistant_permissions_list(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.store_assistant_permissions_list(bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';

