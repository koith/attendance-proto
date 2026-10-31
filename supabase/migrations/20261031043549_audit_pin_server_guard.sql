-- #1442 staged server protection. APPROVAL REQUIRED before production installation/enable.
-- Default OFF. No employee/PIN/attendance/payroll/settings rows are updated.
CREATE SCHEMA pin_private;
REVOKE ALL ON SCHEMA pin_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE pin_private.settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false);
INSERT INTO pin_private.settings DEFAULT VALUES;
CREATE TABLE pin_private.source_archive(
 signature text PRIMARY KEY,before_definition text NOT NULL,before_public boolean NOT NULL,installed_md5 text
);
ALTER TABLE pin_private.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_private.settings FORCE ROW LEVEL SECURITY;
ALTER TABLE pin_private.source_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_private.source_archive FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA pin_private FROM PUBLIC,anon,authenticated,service_role;

-- Non-transactional failure state prevents a caller from rolling counters back
-- via response-shaping errors or an aborted surrounding transaction. Each existing
-- employee gets one private sequence; INSERT trigger seeds new employees before
-- they can be used. No PIN, name, email, or IP is stored in the sequence.
CREATE FUNCTION pin_private.seed_employee(p_employee_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $seed$
BEGIN
 EXECUTE format('CREATE SEQUENCE IF NOT EXISTS pin_private.%I MINVALUE 1 START 1 CACHE 1','e_'||p_employee_id::text);
 EXECUTE format('REVOKE ALL ON SEQUENCE pin_private.%I FROM PUBLIC,anon,authenticated,service_role','e_'||p_employee_id::text);
END $seed$;
REVOKE ALL ON FUNCTION pin_private.seed_employee(bigint) FROM PUBLIC,anon,authenticated,service_role;
DO $seed$ DECLARE r record; BEGIN
 FOR r IN SELECT id FROM public.employees LOOP PERFORM pin_private.seed_employee(r.id); END LOOP;
END $seed$;
CREATE FUNCTION pin_private.seed_new_employee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $seed$
BEGIN PERFORM pin_private.seed_employee(NEW.id); RETURN NEW; END $seed$;
REVOKE ALL ON FUNCTION pin_private.seed_new_employee() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pin_guard_seed AFTER INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION pin_private.seed_new_employee();

-- A sequence value encodes (window-start UTC epoch seconds * 10 + failures).
-- Five wrong attempts per employee in a fixed 15-minute window. A blocked call
-- never extends that window. Success resets it, but cannot bypass an active lock.
CREATE FUNCTION pin_private.verify(p_employee_id bigint,p_pin text,p_store_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$
DECLARE h text; v_now bigint; v_state bigint; v_start bigint; v_failures int; enabled boolean; v_seq regclass;
BEGIN
 SELECT e.pin_bcrypt INTO h FROM public.employees e
 WHERE e.id=p_employee_id AND e.is_active AND (p_store_id IS NULL OR e.store_id=p_store_id);
 IF h IS NULL THEN RETURN jsonb_build_object('ok',false,'error','BAD_PIN'); END IF;
 SELECT s.enabled INTO enabled FROM pin_private.settings s WHERE s.id;
 IF NOT coalesce(enabled,false) THEN
  RETURN CASE WHEN extensions.crypt(p_pin,h) IS NOT DISTINCT FROM h
   THEN jsonb_build_object('ok',true) ELSE jsonb_build_object('ok',false,'error','BAD_PIN') END;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('staff_pin:'||p_employee_id::text,0));
 SELECT e.pin_bcrypt INTO h FROM public.employees e
 WHERE e.id=p_employee_id AND e.is_active AND (p_store_id IS NULL OR e.store_id=p_store_id);
 IF h IS NULL THEN RETURN jsonb_build_object('ok',false,'error','BAD_PIN'); END IF;
 v_seq:=to_regclass('pin_private.e_'||p_employee_id::text);
 IF v_seq IS NULL THEN RETURN jsonb_build_object('ok',false,'error','PIN_GUARD_UNAVAILABLE'); END IF;
 v_now:=floor(extract(epoch FROM clock_timestamp()))::bigint;
 EXECUTE format('SELECT last_value FROM %s',v_seq) INTO v_state;
 v_start:=v_state/10; v_failures:=(v_state%10)::int;
 IF v_start<=v_now-900 THEN v_start:=v_now; v_failures:=0; END IF;
 IF v_failures>=5 THEN
  RETURN jsonb_build_object('ok',false,'error','RATE_LIMITED','retry_after_seconds',greatest(1,(v_start+900-v_now)::int));
 END IF;
 -- Preserve legacy PIN lengths; no forced rotation or new login step.
 IF p_pin IS NOT NULL AND octet_length(p_pin)<=72 AND extensions.crypt(p_pin,h) IS NOT DISTINCT FROM h THEN
  PERFORM setval(v_seq,v_now*10,true);
  RETURN jsonb_build_object('ok',true);
 END IF;
 v_failures:=v_failures+1;
 PERFORM setval(v_seq,v_start*10+v_failures,true);
 IF v_failures>=5 THEN
  RETURN jsonb_build_object('ok',false,'error','RATE_LIMITED','retry_after_seconds',greatest(1,(v_start+900-v_now)::int));
 END IF;
 RETURN jsonb_build_object('ok',false,'error','BAD_PIN');
END $guard$;
REVOKE ALL ON FUNCTION pin_private.verify(bigint,text,bigint) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve TABLE return signatures and HTTP failure handling without aborting
-- the transaction. PostgREST honours response.status after committing normally.
CREATE FUNCTION pin_private.http_denial(p_result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $http$
BEGIN
 PERFORM set_config('response.status',CASE WHEN p_result->>'error'='RATE_LIMITED' THEN '429' ELSE '400' END,true);
 IF p_result->>'error'='RATE_LIMITED' THEN
  PERFORM set_config('response.headers',jsonb_build_array(jsonb_build_object('Retry-After',p_result->>'retry_after_seconds'))::text,true);
 END IF;
END $http$;
REVOKE ALL ON FUNCTION pin_private.http_denial(jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE r record; current_source text;
BEGIN

 current_source:=pg_get_functiondef('public.my_events(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure);
 IF md5(current_source)<>'c0926060500a9e478e3f2a5bc295e233' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: my_events'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.my_events(bigint, text, timestamp without time zone, timestamp without time zone)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.my_events(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.my_events(p_employee_id bigint, p_pin text, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_guard jsonb; v_hash text;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  v_guard:=pin_private.verify(p_employee_id,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if;
  if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_employee_id and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  return json_build_object('ok',true,'events',
    coalesce((select json_agg(row_to_json(t)) from (
      select ev.id, ev.event_type,
        (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
      from attendance_events ev
      where ev.employee_id=p_employee_id
        and ev.event_at >= ((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
        and ev.event_at < ((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
      order by ev.event_at
    ) t),'[]'::json),
    'requests', coalesce((select json_agg(row_to_json(r)) from (
      select id, kind, requested_at, requested_type, note, status, created_at
      from correction_requests
      where employee_id=p_employee_id and created_at > now() - interval '60 days' order by created_at desc
    ) r),'[]'::json));
end;
$function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.my_events(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure)) WHERE signature='public.my_events(bigint, text, timestamp without time zone, timestamp without time zone)';
 REVOKE EXECUTE ON FUNCTION public.my_events(bigint, text, timestamp without time zone, timestamp without time zone) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.my_events(bigint, text, timestamp without time zone, timestamp without time zone) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.pos_unlock_store(bigint, integer, text)'::regprocedure);
 IF md5(current_source)<>'d8cec5117beb7e4b013fc8c6774a23d5' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: pos_unlock_store'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.pos_unlock_store(bigint, integer, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.pos_unlock_store(bigint, integer, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.pos_unlock_store(p_store_id bigint, p_employee_no integer, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_guard jsonb; v_hash text; v_employee_id bigint; v_token text; v_attempts bigint; v_store_attempts bigint;
BEGIN
 IF p_store_id IS NULL OR p_employee_no IS NULL OR p_employee_no < 1 OR p_employee_no > 99999
    OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
   RETURN jsonb_build_object('ok',false,'error','INVALID_CREDENTIALS');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pos_unlock:'||p_store_id::text,0));
 SELECT count(*),count(*) FILTER(WHERE employee_no=p_employee_no) INTO v_store_attempts,v_attempts
 FROM pos_private.unlock_attempts
 WHERE store_id=p_store_id AND attempted_at>clock_timestamp()-interval '15 minutes' AND success IS FALSE;
 IF v_attempts>=5 OR v_store_attempts>=100 THEN
   RETURN jsonb_build_object('ok',false,'error','RATE_LIMITED');
 END IF;
 SELECT e.id,e.pin_bcrypt INTO v_employee_id,v_hash
 FROM public.employees e INNER JOIN public.stores s ON s.id=e.store_id
 WHERE e.store_id=p_store_id AND e.employee_no=p_employee_no AND e.is_active
   AND s.is_active AND s.onboarding_status='READY'
 ORDER BY e.id LIMIT 1;
 v_guard:=pin_private.verify(v_employee_id,p_pin,p_store_id);
 IF NOT (v_guard->>'ok')::boolean THEN
   INSERT INTO pos_private.unlock_attempts(store_id,employee_no,success) VALUES(p_store_id,p_employee_no,false);
   RETURN jsonb_build_object('ok',false,'error',CASE WHEN v_guard->>'error'='RATE_LIMITED' THEN 'RATE_LIMITED' ELSE 'INVALID_CREDENTIALS' END);
 END IF;
 INSERT INTO pos_private.unlock_attempts(store_id,employee_no,success) VALUES(p_store_id,p_employee_no,true);
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO pos_private.kiosk_sessions(store_id,employee_id,token_digest,expires_at)
 VALUES (p_store_id,v_employee_id,extensions.digest(v_token,'sha256'),clock_timestamp()+interval '8 hours');
 RETURN jsonb_build_object('ok',true,'token',v_token,'valid_for_seconds',28800);
END $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.pos_unlock_store(bigint, integer, text)'::regprocedure)) WHERE signature='public.pos_unlock_store(bigint, integer, text)';
 REVOKE EXECUTE ON FUNCTION public.pos_unlock_store(bigint, integer, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.pos_unlock_store(bigint, integer, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.punch(bigint, text, text, bigint)'::regprocedure);
 IF md5(current_source)<>'8a4e60c3cc048e1572aebe6f98f92b30' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: punch'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.punch(bigint, text, text, bigint)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.punch(bigint, text, text, bigint)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.punch(p_employee_id bigint, p_pin text, p_device text DEFAULT 'POS'::text, p_substitute_for_employee_id bigint DEFAULT NULL::bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_guard jsonb;
  v_hash text; v_store_id bigint; v_last_type text; v_type text;
  v_instant timestamptz:=clock_timestamp(); v_now_utc timestamp:=v_instant at time zone 'UTC'; v_now_kst timestamp:=v_instant at time zone 'Asia/Seoul';
  v_sub_name text; v_open_minute integer:=420; v_close_minute integer:=1500; v_reopen_minute integer; v_local_minute integer; v_close_clock_minute integer;
begin
  select pin_bcrypt,store_id into v_hash,v_store_id from public.employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if not exists(select 1 from public.stores s where s.id=v_store_id AND s.is_active AND s.onboarding_status='READY')
  then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  v_guard:=pin_private.verify(p_employee_id,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if;
  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));
  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by,created_at from public.event_corrections
    where event_id is not null and employee_id=p_employee_id order by event_id,created_at desc,id desc
  ),eff as (
    select e.id::numeric ord,case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
      case when c.action='EDIT_TIME' and c.new_event_at is not null then public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) else e.event_at end at
    from public.attendance_events e left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_employee_id and coalesce(c.action,'')<>'VOID'
    union all
    select 1000000000000000::numeric+c.id,c.new_event_type,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) from public.event_corrections c
    where c.employee_id=p_employee_id and c.action='ADD' and coalesce(c.reason,'') not like '%[VOID_ADD:%' and c.new_event_at is not null and c.new_event_type is not null
  ) select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;
  v_type:=case when v_last_type='IN' then 'OUT' else 'IN' end;
  if v_type='IN' then
    select coalesce(open_minute,420),coalesce(close_minute,1500) into v_open_minute,v_close_minute
      from public.store_settings where id=coalesce(v_store_id,1);
    v_reopen_minute:=greatest(v_open_minute-60,0);
    v_local_minute:=extract(hour from v_now_kst)::integer*60+extract(minute from v_now_kst)::integer;
    if v_close_minute>=1440 then
      v_close_clock_minute:=v_close_minute-1440;
      if v_local_minute>=v_close_clock_minute and v_local_minute<v_reopen_minute then
        return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
      end if;
    elsif v_local_minute>=v_close_minute or v_local_minute<v_reopen_minute then
      return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
    end if;
  end if;
  if v_type='OUT' then p_substitute_for_employee_id:=null;
  elsif p_substitute_for_employee_id is not null then
    if p_substitute_for_employee_id=p_employee_id then return json_build_object('ok',false,'error','SUBSTITUTE_SELF'); end if;
    select name into v_sub_name from public.employees where id=p_substitute_for_employee_id and is_active=true and store_id=v_store_id;
    if v_sub_name is null then return json_build_object('ok',false,'error','SUBSTITUTE_NOT_ACTIVE'); end if;
  end if;
  insert into public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id,substitute_for_employee_id)
  values(p_employee_id,v_type,v_now_utc,v_now_utc,coalesce(p_device,'POS'),p_substitute_for_employee_id);
  return json_build_object('ok',true,'type',v_type,'at',to_char(v_now_kst,'YYYY-MM-DD"T"HH24:MI:SS'),'name',(select name from public.employees where id=p_employee_id),
    'substitute_for_employee_id',p_substitute_for_employee_id,'substitute_for_name',v_sub_name);
end;$function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.punch(bigint, text, text, bigint)'::regprocedure)) WHERE signature='public.punch(bigint, text, text, bigint)';
 REVOKE EXECUTE ON FUNCTION public.punch(bigint, text, text, bigint) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.punch(bigint, text, text, bigint) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.request_correction(bigint, text, text, bigint, timestamp without time zone, text, text)'::regprocedure);
 IF md5(current_source)<>'3f125b848f1694469d2ee3bfeda7454f' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: request_correction'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.request_correction(bigint, text, text, bigint, timestamp without time zone, text, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.request_correction(bigint, text, text, bigint, timestamp without time zone, text, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.request_correction(p_employee_id bigint, p_pin text, p_kind text, p_event_id bigint, p_requested_at timestamp without time zone, p_requested_type text, p_note text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_guard jsonb; v_hash text; v_id bigint;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  v_guard:=pin_private.verify(p_employee_id,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if;
  if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_employee_id and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if p_event_id is not null and not exists(select 1 from public.attendance_events ev where ev.id=p_event_id and ev.employee_id=p_employee_id) then return json_build_object('ok',false,'error','EVENT_EMPLOYEE_MISMATCH'); end if;
  insert into correction_requests(employee_id,event_id,kind,requested_at,requested_type,note)
    values (p_employee_id,p_event_id,p_kind,p_requested_at,p_requested_type,p_note) returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end; $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.request_correction(bigint, text, text, bigint, timestamp without time zone, text, text)'::regprocedure)) WHERE signature='public.request_correction(bigint, text, text, bigint, timestamp without time zone, text, text)';
 REVOKE EXECUTE ON FUNCTION public.request_correction(bigint, text, text, bigint, timestamp without time zone, text, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.request_correction(bigint, text, text, bigint, timestamp without time zone, text, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.staff_actual_attendance(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure);
 IF md5(current_source)<>'f65a635b4b9ea0100f72e58a27949d3a' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: staff_actual_attendance'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.staff_actual_attendance(bigint, text, timestamp without time zone, timestamp without time zone)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.staff_actual_attendance(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.staff_actual_attendance(p_employee_id bigint, p_pin text, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_guard jsonb; v_hash text; v_emp json;
begin
  select pin_bcrypt, json_build_object('id',id,'name',name,'employee_no',employee_no,'store_id',store_id)
    into v_hash,v_emp from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if not exists(select 1 from public.stores s where s.id=(v_emp->>'store_id')::bigint AND s.is_active AND s.onboarding_status='READY')
  then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  v_guard:=pin_private.verify(p_employee_id,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if;
  return json_build_object(
    'ok',true,'employee',v_emp,
    'events',coalesce((select json_agg(row_to_json(t)) from (
      select ev.id,ev.employee_id,ev.event_type,
        (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
      from attendance_events ev
      where ev.employee_id=p_employee_id
        and ev.event_at>=((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
        and ev.event_at<((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
      order by ev.event_at
    ) t),'[]'::json),
    'corrections',coalesce((select json_agg(row_to_json(c)) from (
      select ec.id,ec.event_id,ec.employee_id,ec.action,
        case when ec.new_event_at is null then null else public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at) end as new_event_at,
        ec.new_event_type,ec.reason,ec.created_by,ec.created_at
      from event_corrections ec
      where ec.employee_id=p_employee_id
        and (ec.new_event_at is null or (public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at)>=p_from and public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at)<p_to))
      order by ec.created_at
    ) c),'[]'::json)
  );
end $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.staff_actual_attendance(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure)) WHERE signature='public.staff_actual_attendance(bigint, text, timestamp without time zone, timestamp without time zone)';
 REVOKE EXECUTE ON FUNCTION public.staff_actual_attendance(bigint, text, timestamp without time zone, timestamp without time zone) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.staff_actual_attendance(bigint, text, timestamp without time zone, timestamp without time zone) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.staff_recipe_list(bigint, text, bigint)'::regprocedure);
 IF md5(current_source)<>'cb991b936be6ab5ed9de13408e5f6b66' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: staff_recipe_list'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.staff_recipe_list(bigint, text, bigint)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.staff_recipe_list(bigint, text, bigint)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.staff_recipe_list(p_employee_id bigint, p_pin text, p_store_id bigint)
 RETURNS TABLE(product_id bigint, recipe_version_id bigint, menu_key text, menu_name text, category text, thumbnail_url text, instructions jsonb, components jsonb, assignment_status text, retirement_requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_guard jsonb;
begin
 if not exists(select 1 from public.stores s where s.id=p_store_id and s.is_active and s.onboarding_status='READY') then raise exception 'STORE_NOT_READY'; end if;
 v_guard:=pin_private.verify(p_employee_id,p_pin,p_store_id); if not (v_guard->>'ok')::boolean then perform pin_private.http_denial(v_guard); return; end if;
 if not public.substitution_is_working(p_employee_id) then raise exception 'NOT_CLOCKED_IN'; end if;
 return query
 with src as (
   select v.menu_name,min(v.category) category,max(nullif(v.thumbnail_url,'')) thumbnail_url
   from public.recipe_source_variants v where v.category<>'토핑' group by v.menu_name
 ), base as (
  select hp.id product_id,hp.recipe_version_id,coalesce(hp.product_key,'source_'||md5(s.menu_name)) menu_key,s.menu_name,s.category,
         coalesce(s.thumbnail_url,rv.thumbnail_url,public.recipe_thumbnail_for_source(s.menu_name)) thumbnail_url,
         public.source_recipe_instructions(s.menu_name) instructions,public.source_recipe_components(s.menu_name) components
  from src s
  left join lateral (select p.* from public.hq_products p where p.status='ACTIVE' and regexp_replace(lower(p.name),'[^0-9a-z가-힣]','','g')=regexp_replace(lower(s.menu_name),'[^0-9a-z가-힣]','','g') order by p.id limit 1) hp on true
  left join public.recipe_versions rv on rv.id=hp.recipe_version_id
 )
 select b.product_id,b.recipe_version_id,b.menu_key,coalesce(nullif(o.menu_name,''),b.menu_name),coalesce(nullif(o.category,''),b.category),
        coalesce(nullif(o.thumbnail_url,''),b.thumbnail_url),coalesce(o.instructions,b.instructions),case when o.store_id is null then b.components else o.components end,
        'ACTIVE'::text,null::timestamptz
 from base b left join public.store_recipe_overrides o on o.store_id=p_store_id and o.menu_key=b.menu_key
 order by coalesce(nullif(o.category,''),b.category),coalesce(nullif(o.menu_name,''),b.menu_name);
end $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.staff_recipe_list(bigint, text, bigint)'::regprocedure)) WHERE signature='public.staff_recipe_list(bigint, text, bigint)';
 REVOKE EXECUTE ON FUNCTION public.staff_recipe_list(bigint, text, bigint) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.staff_recipe_list(bigint, text, bigint) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.staff_stocktake_catalog(bigint, bigint, text)'::regprocedure);
 IF md5(current_source)<>'6f0bc47de44e3aa3050c81ba73d9bc02' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: staff_stocktake_catalog'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.staff_stocktake_catalog(bigint, bigint, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.staff_stocktake_catalog(bigint, bigint, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.staff_stocktake_catalog(p_store_id bigint, p_employee_id bigint, p_pin text)
 RETURNS TABLE(id bigint, name text, unit text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.staff_stocktake_verify(p_store_id,p_employee_id,p_pin) THEN RETURN; END IF;
 RETURN QUERY SELECT i.id,i.name,i.unit FROM public.inventory_items i
 WHERE i.is_active AND NOT i.is_demo
   AND NOT EXISTS (SELECT 1 FROM public.inventory_movements m
    WHERE m.item_id=i.id AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
      AND m.is_demo)
 ORDER BY i.name,i.id LIMIT 500;
END $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.staff_stocktake_catalog(bigint, bigint, text)'::regprocedure)) WHERE signature='public.staff_stocktake_catalog(bigint, bigint, text)';
 REVOKE EXECUTE ON FUNCTION public.staff_stocktake_catalog(bigint, bigint, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.staff_stocktake_catalog(bigint, bigint, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.staff_stocktake_submit(bigint, bigint, text, jsonb, text)'::regprocedure);
 IF md5(current_source)<>'1285b486ae09f2adbbc8c7d957a8835a' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: staff_stocktake_submit'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.staff_stocktake_submit(bigint, bigint, text, jsonb, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.staff_stocktake_submit(bigint, bigint, text, jsonb, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.staff_stocktake_submit(p_store_id bigint, p_employee_id bigint, p_pin text, p_lines jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE r jsonb; i bigint; q numeric; n int; saved bigint;
BEGIN
 IF NOT public.staff_stocktake_verify(p_store_id,p_employee_id,p_pin) THEN RETURN jsonb_build_object('ok',false,'error',CASE WHEN current_setting('response.status',true)='429' THEN 'RATE_LIMITED' ELSE 'BAD_PIN' END); END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR
    jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'STOCKTAKE_LINES_INVALID'; END IF;
 IF length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'STOCKTAKE_NOTE_TOO_LONG'; END IF;
 -- Prevent unlimited submitted proposals from a stolen valid staff PIN.
 PERFORM pg_advisory_xact_lock(hashtext('staff_stocktake_'||p_employee_id::text));
 -- Serialize evidence capture with the existing manager stocktake POST lock.
 PERFORM pg_advisory_xact_lock(hashtext('stocktake_store_'||p_store_id::text));
 IF (SELECT COUNT(*) FROM public.store_staff_stocktake_proposals
   WHERE employee_id=p_employee_id AND counted_on=(now() AT TIME ZONE 'Asia/Seoul')::date)>=5
 THEN RAISE EXCEPTION 'STOCKTAKE_DAILY_LIMIT'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(r)<>'object' OR coalesce(r->>'item_id','') !~ '^[1-9][0-9]*$'
     OR jsonb_typeof(r->'counted_quantity') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'STOCKTAKE_ITEM_INVALID'; END IF;
  i:=(r->>'item_id')::bigint;q:=(r->>'counted_quantity')::numeric;
  IF q<0 OR q>1000000000 OR scale(q)>3 THEN RAISE EXCEPTION 'STOCKTAKE_QTY_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_items t WHERE t.id=i AND t.is_active AND NOT t.is_demo)
     OR EXISTS (SELECT 1 FROM public.inventory_movements m WHERE m.item_id=i
       AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL)) AND m.is_demo)
  THEN RAISE EXCEPTION 'REAL_STOCKTAKE_ITEM_REQUIRED'; END IF;
  IF (SELECT COUNT(*) FROM jsonb_array_elements(p_lines) x
        WHERE x.value->>'item_id'=i::text)<>1
  THEN RAISE EXCEPTION 'DUPLICATE_STOCKTAKE_ITEM'; END IF;
 END LOOP;
 -- Only validated item and quantity keys are retained; never store staff PIN.
 INSERT INTO public.store_staff_stocktake_proposals(store_id,employee_id,lines,note)
 VALUES(p_store_id,p_employee_id,
   (SELECT jsonb_agg(jsonb_build_object('item_id',(x.value->>'item_id')::bigint,
     'counted_quantity',(x.value->>'counted_quantity')::numeric,
     'expected_quantity',COALESCE((
       SELECT SUM(m.quantity) FROM public.inventory_movements m
       WHERE m.item_id=(x.value->>'item_id')::bigint AND NOT m.is_demo
         AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
      ),0)::numeric)) FROM jsonb_array_elements(p_lines)x),
   nullif(btrim(p_note),''))
 RETURNING id INTO saved;
 RETURN jsonb_build_object('id',saved,'status','SUBMITTED','stock_changed',false);
END $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.staff_stocktake_submit(bigint, bigint, text, jsonb, text)'::regprocedure)) WHERE signature='public.staff_stocktake_submit(bigint, bigint, text, jsonb, text)';
 REVOKE EXECUTE ON FUNCTION public.staff_stocktake_submit(bigint, bigint, text, jsonb, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.staff_stocktake_submit(bigint, bigint, text, jsonb, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.staff_stocktake_verify(bigint, bigint, text)'::regprocedure);
 IF md5(current_source)<>'c4bd6d716e61c88e840cc036dcf0f89d' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: staff_stocktake_verify'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.staff_stocktake_verify(bigint, bigint, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.staff_stocktake_verify(bigint, bigint, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.staff_stocktake_verify(p_store_id bigint, p_employee_id bigint, p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_guard jsonb;
begin
 IF p_store_id IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY'
 ) THEN RAISE EXCEPTION 'STORE_NOT_READY'; END IF;
 v_guard:=pin_private.verify(p_employee_id,p_pin,p_store_id);
 IF NOT (v_guard->>'ok')::boolean THEN PERFORM pin_private.http_denial(v_guard); RETURN false; END IF;
 IF NOT public.substitution_is_working(p_employee_id)
 THEN RAISE EXCEPTION 'STAFF_NOT_CLOCKED_IN'; END IF;
 RETURN true;
END $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.staff_stocktake_verify(bigint, bigint, text)'::regprocedure)) WHERE signature='public.staff_stocktake_verify(bigint, bigint, text)';

 current_source:=pg_get_functiondef('public.substitution_candidate_availability(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure);
 IF md5(current_source)<>'212fe47a88e02841635e78ab650516bf' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: substitution_candidate_availability'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.substitution_candidate_availability(bigint, text, timestamp without time zone, timestamp without time zone)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.substitution_candidate_availability(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.substitution_candidate_availability(p_requester bigint, p_pin text, p_start timestamp without time zone, p_end timestamp without time zone)
 RETURNS TABLE(employee_id bigint, available boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare v_guard jsonb; h text; begin select pin_bcrypt into h from employees where id=p_requester and is_active=true; v_guard:=pin_private.verify(p_requester,p_pin); if not (v_guard->>'ok')::boolean then perform pin_private.http_denial(v_guard); return; end if; if p_end<=p_start then return; end if; if not exists(select 1 from public.employees req join public.stores st on st.id=req.store_id where req.id=p_requester and st.is_active and st.onboarding_status='READY') then return; end if; return query select e.id, not substitution_is_working(e.id) and not substitution_schedule_conflict(e.id,p_start,p_end) and not exists(select 1 from substitution_requests r where r.substitute_employee_id=e.id and r.status in ('ACCEPTED','IN_PROGRESS') and r.work_start<p_end and r.work_end>p_start), case when substitution_is_working(e.id) then 'CURRENTLY_WORKING' when substitution_schedule_conflict(e.id,p_start,p_end) then 'WORK_SCHEDULE' when exists(select 1 from substitution_requests r where r.substitute_employee_id=e.id and r.status in ('ACCEPTED','IN_PROGRESS') and r.work_start<p_end and r.work_end>p_start) then 'SUBSTITUTION_RESERVED' else null end from employees e where e.is_active=true and e.id<>p_requester and e.store_id=(select req.store_id from public.employees req where req.id=p_requester); end $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.substitution_candidate_availability(bigint, text, timestamp without time zone, timestamp without time zone)'::regprocedure)) WHERE signature='public.substitution_candidate_availability(bigint, text, timestamp without time zone, timestamp without time zone)';
 REVOKE EXECUTE ON FUNCTION public.substitution_candidate_availability(bigint, text, timestamp without time zone, timestamp without time zone) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.substitution_candidate_availability(bigint, text, timestamp without time zone, timestamp without time zone) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.substitution_clock_in(bigint, bigint, text)'::regprocedure);
 IF md5(current_source)<>'2ad89e0f796fb8dfa30f35fa26f6143c' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: substitution_clock_in'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.substitution_clock_in(bigint, bigint, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.substitution_clock_in(bigint, bigint, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.substitution_clock_in(p_request bigint, p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_guard jsonb; h text;r public.substitution_requests%rowtype;now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';now_utc timestamp:=clock_timestamp() at time zone 'UTC';last_type text;
begin
 select pin_bcrypt into h from employees where id=p_employee and is_active=true;
 v_guard:=pin_private.verify(p_employee,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if;
 select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee for update;
 if not found or r.status<>'ACCEPTED' then return json_build_object('ok',false,'error','NOT_ACCEPTED'); end if; if not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id join public.stores st on st.id=sub.store_id where sub.id=p_employee and req.id=r.requester_employee_id and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY_OR_MISMATCH'); end if;
 if now_kst < r.work_start-interval '60 minutes' then return json_build_object('ok',false,'error','TOO_EARLY'); end if;
 if now_kst >= r.work_end then return json_build_object('ok',false,'error','SHIFT_ENDED'); end if;
 perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee::text));
 with latest as(
  select distinct on(event_id) event_id,action,new_event_type,new_event_at,created_by,created_at
  from event_corrections where event_id is not null and employee_id=p_employee order by event_id,created_at desc,id desc
 ),eff as(
  select e.id::numeric ord,
   case when l.action='EDIT_TYPE' and l.new_event_type is not null then l.new_event_type else e.event_type end typ,
   case when l.action='EDIT_TIME' and l.new_event_at is not null then
     public.attendance_correction_effective_kst(l.new_event_at,l.created_by,l.created_at)
   else e.event_at+interval '9 hours' end at_kst
  from attendance_events e left join latest l on l.event_id=e.id
  where e.employee_id=p_employee and coalesce(l.action,'')<>'VOID'
  union all
  select 1000000000000000::numeric+c.id,c.new_event_type,
   public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)
  from event_corrections c where c.employee_id=p_employee and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null and coalesce(c.reason,'') not like '%[VOID_ADD:%'
 )
 select typ into last_type from eff where at_kst is not null order by at_kst desc,ord desc limit 1;
 if last_type='IN' then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if;
 insert into attendance_events(employee_id,event_type,event_at,server_received_at,device_id) values(p_employee,'IN',now_utc,now_utc,'SUBSTITUTE:'||p_request);
 update substitution_requests set status='IN_PROGRESS' where id=p_request;
 return json_build_object('ok',true,'type','IN','at',to_char(now_kst,'YYYY-MM-DD"T"HH24:MI:SS'));
end $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.substitution_clock_in(bigint, bigint, text)'::regprocedure)) WHERE signature='public.substitution_clock_in(bigint, bigint, text)';
 REVOKE EXECUTE ON FUNCTION public.substitution_clock_in(bigint, bigint, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.substitution_clock_in(bigint, bigint, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.substitution_request_cancel(bigint, bigint, text)'::regprocedure);
 IF md5(current_source)<>'31b74f1c245a44ad2540767178d0325d' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: substitution_request_cancel'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.substitution_request_cancel(bigint, bigint, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.substitution_request_cancel(bigint, bigint, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.substitution_request_cancel(p_request bigint, p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare v_guard jsonb; h text; begin select pin_bcrypt into h from employees where id=p_employee and is_active=true; v_guard:=pin_private.verify(p_employee,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if; if not exists(select 1 from public.employees e join public.stores st on st.id=e.store_id where e.id=p_employee and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if; update substitution_requests set status='CANCELLED',resolved_at=now() where id=p_request and requester_employee_id=p_employee and status in('REQUESTED','ACCEPTED'); if not found then return json_build_object('ok',false,'error','NOT_CANCELLABLE'); end if; return json_build_object('ok',true); end $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.substitution_request_cancel(bigint, bigint, text)'::regprocedure)) WHERE signature='public.substitution_request_cancel(bigint, bigint, text)';
 REVOKE EXECUTE ON FUNCTION public.substitution_request_cancel(bigint, bigint, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.substitution_request_cancel(bigint, bigint, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.substitution_request_create(bigint, text, bigint, timestamp without time zone, timestamp without time zone, text)'::regprocedure);
 IF md5(current_source)<>'a5762c5be0d01809406d1252f159e195' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: substitution_request_create'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.substitution_request_create(bigint, text, bigint, timestamp without time zone, timestamp without time zone, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.substitution_request_create(bigint, text, bigint, timestamp without time zone, timestamp without time zone, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.substitution_request_create(p_requester bigint, p_pin text, p_substitute bigint, p_start timestamp without time zone, p_end timestamp without time zone, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare v_guard jsonb; h text; rid bigint; begin select pin_bcrypt into h from employees where id=p_requester and is_active=true; v_guard:=pin_private.verify(p_requester,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if; if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_requester and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if; if p_requester=p_substitute or p_end<=p_start or not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id where sub.id=p_substitute and sub.is_active=true and req.id=p_requester) then return json_build_object('ok',false,'error','INVALID_REQUEST'); end if; perform pg_advisory_xact_lock(hashtext('substitution_reservation_'||p_substitute::text)); if substitution_is_working(p_substitute) then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if; if substitution_schedule_conflict(p_substitute,p_start,p_end) then return json_build_object('ok',false,'error','WORK_SCHEDULE_CONFLICT'); end if; if exists(select 1 from substitution_requests x where x.substitute_employee_id=p_substitute and x.status in ('ACCEPTED','IN_PROGRESS') and x.work_start<p_end and x.work_end>p_start) then return json_build_object('ok',false,'error','SUBSTITUTION_CONFLICT'); end if; insert into substitution_requests(requester_employee_id,substitute_employee_id,work_start,work_end,note) values(p_requester,p_substitute,p_start,p_end,left(nullif(trim(p_note),''),200)) returning id into rid; return json_build_object('ok',true,'id',rid); end $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.substitution_request_create(bigint, text, bigint, timestamp without time zone, timestamp without time zone, text)'::regprocedure)) WHERE signature='public.substitution_request_create(bigint, text, bigint, timestamp without time zone, timestamp without time zone, text)';
 REVOKE EXECUTE ON FUNCTION public.substitution_request_create(bigint, text, bigint, timestamp without time zone, timestamp without time zone, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.substitution_request_create(bigint, text, bigint, timestamp without time zone, timestamp without time zone, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.substitution_request_list(bigint, text)'::regprocedure);
 IF md5(current_source)<>'9b290e3b1d81e5381b6bfbc8e9bd1c6d' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: substitution_request_list'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.substitution_request_list(bigint, text)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.substitution_request_list(bigint, text)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.substitution_request_list(p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_guard jsonb; h text;q record;
begin
  select pin_bcrypt into h from employees where id=p_employee and is_active=true;
  v_guard:=pin_private.verify(p_employee,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if;
  if not exists(select 1 from public.employees e join public.stores st on st.id=e.store_id where e.id=p_employee and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;

  perform substitution_enforce_due();
  for q in select id from substitution_requests
    where p_employee in(requester_employee_id,substitute_employee_id)
      and status in('ACCEPTED','IN_PROGRESS')
  loop
    perform substitution_refresh_one(q.id);
  end loop;

  return json_build_object('ok',true,'requests',(
    select coalesce(json_agg(x order by x.work_start desc),'[]'::json)
    from (
      select r.id,r.requester_employee_id,r.substitute_employee_id,a.name requester_name,b.name substitute_name,
             r.work_start,r.work_end,r.status,r.requested_at,r.accepted_at,r.resolved_at,r.note,r.actual_minutes
      from substitution_requests r
      join employees a on a.id=r.requester_employee_id
      join employees b on b.id=r.substitute_employee_id
      where p_employee in(r.requester_employee_id,r.substitute_employee_id) and a.store_id=b.store_id
    ) x
  ));
end;
$function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.substitution_request_list(bigint, text)'::regprocedure)) WHERE signature='public.substitution_request_list(bigint, text)';
 REVOKE EXECUTE ON FUNCTION public.substitution_request_list(bigint, text) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.substitution_request_list(bigint, text) TO anon,authenticated,service_role;

 current_source:=pg_get_functiondef('public.substitution_request_respond(bigint, bigint, text, boolean)'::regprocedure);
 IF md5(current_source)<>'c2029fa80ba1c1e322c96b1a39b9c865' THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_DRIFT: substitution_request_respond'; END IF;
 INSERT INTO pin_private.source_archive(signature,before_definition,before_public)
 SELECT 'public.substitution_request_respond(bigint, bigint, text, boolean)',current_source,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') FROM pg_proc WHERE oid='public.substitution_request_respond(bigint, bigint, text, boolean)'::regprocedure;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.substitution_request_respond(p_request bigint, p_employee bigint, p_pin text, p_accept boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare v_guard jsonb; h text; r substitution_requests%rowtype; begin select pin_bcrypt into h from employees where id=p_employee and is_active=true; v_guard:=pin_private.verify(p_employee,p_pin); if not (v_guard->>'ok')::boolean then return v_guard::json; end if; select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee and status='REQUESTED' for update; if not found then return json_build_object('ok',false,'error','NOT_PENDING'); end if; if not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id join public.stores st on st.id=sub.store_id where sub.id=p_employee and req.id=r.requester_employee_id and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY_OR_MISMATCH'); end if; if p_accept then perform pg_advisory_xact_lock(hashtext('substitution_reservation_'||p_employee::text)); if substitution_is_working(p_employee) then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if; if substitution_schedule_conflict(p_employee,r.work_start,r.work_end) then return json_build_object('ok',false,'error','WORK_SCHEDULE_CONFLICT'); end if; if exists(select 1 from substitution_requests x where x.id<>r.id and x.substitute_employee_id=p_employee and x.status in ('ACCEPTED','IN_PROGRESS') and x.work_start<r.work_end and x.work_end>r.work_start) then return json_build_object('ok',false,'error','SUBSTITUTION_CONFLICT'); end if; end if; update substitution_requests set status=case when p_accept then 'ACCEPTED' else 'REJECTED' end,accepted_at=case when p_accept then now() else null end,resolved_at=case when p_accept then null else now() end where id=r.id; return json_build_object('ok',true); end $function$
$replacement$;
 UPDATE pin_private.source_archive SET installed_md5=md5(pg_get_functiondef('public.substitution_request_respond(bigint, bigint, text, boolean)'::regprocedure)) WHERE signature='public.substitution_request_respond(bigint, bigint, text, boolean)';
 REVOKE EXECUTE ON FUNCTION public.substitution_request_respond(bigint, bigint, text, boolean) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.substitution_request_respond(bigint, bigint, text, boolean) TO anon,authenticated,service_role;
END $patch$;
NOTIFY pgrst, 'reload schema';
