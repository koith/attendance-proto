-- #832: authenticated POS kiosk access; no alteration to employee/attendance/payroll records.
CREATE SCHEMA IF NOT EXISTS pos_private;
REVOKE ALL ON SCHEMA pos_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS pos_private.kiosk_sessions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store_id bigint NOT NULL REFERENCES public.stores(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 token_digest bytea NOT NULL UNIQUE,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS pos_kiosk_sessions_store_expiry_idx ON pos_private.kiosk_sessions(store_id,expires_at);
CREATE TABLE IF NOT EXISTS pos_private.unlock_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store_id bigint NOT NULL,
 employee_no integer NOT NULL,
 attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 success boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS pos_unlock_attempts_rate_idx ON pos_private.unlock_attempts(store_id,employee_no,attempted_at DESC);
ALTER TABLE pos_private.kiosk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_private.unlock_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA pos_private FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pos_unlock_store(p_store_id bigint,p_employee_no integer,p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE v_hash text; v_employee_id bigint; v_token text; v_attempts bigint; v_store_attempts bigint;
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
 IF v_hash IS NULL OR extensions.crypt(p_pin,v_hash) IS DISTINCT FROM v_hash THEN
   INSERT INTO pos_private.unlock_attempts(store_id,employee_no,success) VALUES(p_store_id,p_employee_no,false);
   RETURN jsonb_build_object('ok',false,'error','INVALID_CREDENTIALS');
 END IF;
 INSERT INTO pos_private.unlock_attempts(store_id,employee_no,success) VALUES(p_store_id,p_employee_no,true);
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO pos_private.kiosk_sessions(store_id,employee_id,token_digest,expires_at)
 VALUES (p_store_id,v_employee_id,extensions.digest(v_token,'sha256'),clock_timestamp()+interval '8 hours');
 RETURN jsonb_build_object('ok',true,'token',v_token,'valid_for_seconds',28800);
END $body$;

CREATE OR REPLACE FUNCTION public.pos_employees_state(p_store_id bigint,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE v_result jsonb;
BEGIN
 IF p_store_id IS NULL OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'POS_AUTH_REQUIRED';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pos_private.kiosk_sessions k
    JOIN public.stores s ON s.id=k.store_id
    JOIN public.employees e ON e.id=k.employee_id
   WHERE k.store_id=p_store_id AND k.token_digest=extensions.digest(p_token,'sha256')
     AND k.expires_at>clock_timestamp() AND NOT k.revoked
     AND s.is_active AND s.onboarding_status='READY'
     AND e.is_active AND e.store_id=p_store_id
 ) THEN RAISE EXCEPTION 'POS_AUTH_REQUIRED'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_result
 FROM public.list_employees_state(p_store_id) x;
 RETURN v_result;
END $body$;
REVOKE ALL ON FUNCTION public.pos_unlock_store(bigint,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_unlock_store(bigint,integer,text) TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pos_employees_state(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_employees_state(bigint,text) TO anon,authenticated,service_role;
