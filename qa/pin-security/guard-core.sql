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
