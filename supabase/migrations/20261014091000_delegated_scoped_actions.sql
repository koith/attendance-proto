-- Scope-specific RPCs. Existing full-manager and HQ workflows remain unmodified.
CREATE OR REPLACE FUNCTION public.store_scope_can(p_store_id bigint,p_scope text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
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
  WHEN 'PAYROLL_VIEW' THEN coalesce(d.payroll_view,true)
  ELSE false END)
);
$fn$;

CREATE OR REPLACE FUNCTION public.store_delegated_permissions_list(p_store_id bigint)
RETURNS TABLE(user_id uuid,staff_edit boolean,attendance_approve boolean,payroll_view boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT(public.is_hq_admin() OR public.store_primary_owner_can_delegate(p_store_id,auth.uid()))
 THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 RETURN QUERY SELECT a.user_id,coalesce(d.staff_edit,true),coalesce(d.attendance_approve,true),coalesce(d.payroll_view,true)
 FROM public.admin_users a LEFT JOIN public.store_delegated_permissions d
  ON d.store_id=a.store_id AND d.user_id=a.user_id
 WHERE a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.store_delegated_permissions_set(
 p_store_id bigint,p_user_id uuid,p_staff_edit boolean,p_attendance_approve boolean,p_payroll_view boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
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
END $fn$;

CREATE OR REPLACE FUNCTION public.store_limited_employee_list(p_store_id bigint)
RETURNS TABLE(id bigint,name text,employee_no integer,memo text,is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT public.store_scope_can(p_store_id,'STAFF_EDIT') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT e.id,e.name,e.employee_no,e.memo,e.is_active
 FROM public.employees e WHERE e.store_id=p_store_id ORDER BY e.is_active DESC,e.name,e.id;
END $fn$;

CREATE OR REPLACE FUNCTION public.store_limited_employee_update(
 p_store_id bigint,p_employee_id bigint,p_name text,p_memo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT public.store_scope_can(p_store_id,'STAFF_EDIT') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 80 OR length(coalesce(p_memo,''))>500
 THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_FIELDS'; END IF;
 UPDATE public.employees SET name=btrim(p_name),memo=nullif(btrim(coalesce(p_memo,'')),'')
 WHERE id=p_employee_id AND store_id=p_store_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 RETURN jsonb_build_object('ok',true,'employee_id',p_employee_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.store_limited_payroll_read(p_store_id bigint,p_ym text)
RETURNS TABLE(employee_name text,gross_pay integer,net_pay integer,base_pay integer,juhyu_pay integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT public.store_scope_can(p_store_id,'PAYROLL_VIEW') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
 RETURN QUERY SELECT p.employee_name,p.gross_pay,p.net_pay,p.base_pay,p.juhyu_pay
 FROM public.payroll_snapshot p JOIN public.payroll_period pp
 ON pp.store_id=p.store_id AND pp.ym=p.ym AND pp.status='CLOSED'
 WHERE p.store_id=p_store_id AND p.ym=p_ym ORDER BY p.employee_name;
END $fn$;

CREATE OR REPLACE FUNCTION public.store_limited_pending_requests(p_store_id bigint)
RETURNS TABLE(id bigint,employee_name text,kind text,note text,requested_at timestamp without time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT public.store_scope_can(p_store_id,'ATTENDANCE_APPROVE') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT r.id,e.name,r.kind,r.note,r.requested_at
 FROM public.correction_requests r JOIN public.employees e ON e.id=r.employee_id
 WHERE e.store_id=p_store_id AND r.status='PENDING' ORDER BY r.created_at,r.id;
END $fn$;

CREATE OR REPLACE FUNCTION public.store_limited_correction_decide(
 p_store_id bigint,p_request_id bigint,p_approve boolean,p_reject_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE r public.correction_requests%rowtype;v_actor text;v_action text;
BEGIN
 IF NOT public.store_scope_can(p_store_id,'ATTENDANCE_APPROVE') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
 SELECT cr.* INTO r FROM public.correction_requests cr JOIN public.employees e ON e.id=cr.employee_id
 WHERE cr.id=p_request_id AND e.store_id=p_store_id AND cr.status='PENDING' FOR UPDATE OF cr;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND_OR_RESOLVED'; END IF;
 v_actor:=coalesce(auth.jwt()->>'email','admin');
 IF p_approve THEN
  v_action:=CASE WHEN r.kind IN ('MISSING_IN','MISSING_OUT') THEN 'ADD' ELSE 'EDIT_TIME' END;
  INSERT INTO public.event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
  VALUES(r.event_id,r.employee_id,v_action,
   CASE WHEN r.requested_at IS NULL THEN NULL ELSE (r.requested_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC' END,
   coalesce(r.requested_type,CASE WHEN r.kind='MISSING_OUT' THEN 'OUT' WHEN r.kind='MISSING_IN' THEN 'IN' ELSE NULL END),
   '직원 정정요청 승인: '||coalesce(r.note,''),v_actor);
  UPDATE public.correction_requests SET status='APPROVED',resolved_by=v_actor,resolved_at=now() WHERE id=p_request_id;
 ELSE
  UPDATE public.correction_requests SET status='REJECTED',resolved_by=v_actor,resolved_at=now(),
   reject_reason=nullif(btrim(coalesce(p_reject_reason,'')),'') WHERE id=p_request_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'status',CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END);
END $fn$;

REVOKE ALL ON FUNCTION public.store_scope_can(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_scope_can(bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.store_delegated_permissions_list(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_delegated_permissions_set(bigint,uuid,boolean,boolean,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_limited_employee_list(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_limited_employee_update(bigint,bigint,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_limited_payroll_read(bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_limited_pending_requests(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.store_limited_correction_decide(bigint,bigint,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION
 public.store_delegated_permissions_list(bigint),
 public.store_delegated_permissions_set(bigint,uuid,boolean,boolean,boolean),
 public.store_limited_employee_list(bigint),
 public.store_limited_employee_update(bigint,bigint,text,text),
 public.store_limited_payroll_read(bigint,text),
 public.store_limited_pending_requests(bigint),
 public.store_limited_correction_decide(bigint,bigint,boolean,text) TO authenticated;
