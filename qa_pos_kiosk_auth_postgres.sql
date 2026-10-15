BEGIN;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE stores(id bigint PRIMARY KEY,is_active boolean,onboarding_status text);
CREATE TABLE employees(id bigint PRIMARY KEY,store_id bigint,employee_no integer,name text,is_active boolean,pin_bcrypt text);
CREATE FUNCTION list_employees_state(p_store_id bigint) RETURNS TABLE(id bigint,name text)
LANGUAGE sql SECURITY DEFINER AS $$ SELECT id,name FROM employees WHERE store_id=p_store_id AND is_active $$;
INSERT INTO stores VALUES(1,true,'READY'),(2,true,'STAGED');
INSERT INTO employees VALUES
(1,1,7,'demo-staff',true,extensions.crypt('1234',extensions.gen_salt('bf'))),
(2,2,8,'staged-staff',true,extensions.crypt('5678',extensions.gen_salt('bf')));
\i supabase/migrations/20261015161000_pos_kiosk_session_gate_v1.sql
\i supabase/migrations/20261015191500_pos_original_picker_restoration.sql
REVOKE ALL ON FUNCTION public.list_employees_state(bigint) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE result jsonb; token text; i integer; unauthorized boolean:=false;
BEGIN
 IF (public.pos_unlock_store(2,8,'5678')->>'ok')::boolean THEN RAISE EXCEPTION 'STAGED_ACCEPTED'; END IF;
 IF (public.pos_unlock_store(1,7,'0000')->>'ok')::boolean THEN RAISE EXCEPTION 'WRONG_PIN_ACCEPTED'; END IF;
 result:=public.pos_unlock_store(1,7,'1234');token:=result->>'token';
 IF result->>'ok'<>'true' OR token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'VALID_PIN_DENIED'; END IF;
 IF jsonb_array_length(public.pos_employees_state(1,token))<>1 THEN RAISE EXCEPTION 'ROSTER_DENIED'; END IF;
 BEGIN PERFORM public.pos_employees_state(2,token); EXCEPTION WHEN others THEN unauthorized:=true; END;
 IF NOT unauthorized THEN RAISE EXCEPTION 'CROSS_STORE_TOKEN_ACCEPTED'; END IF;
 UPDATE pos_private.kiosk_sessions SET expires_at=clock_timestamp()-interval '1 second';
 unauthorized:=false;
 BEGIN PERFORM public.pos_employees_state(1,token); EXCEPTION WHEN others THEN unauthorized:=true; END;
 IF NOT unauthorized THEN RAISE EXCEPTION 'EXPIRED_TOKEN_ACCEPTED'; END IF;
 FOR i IN 1..6 LOOP result:=public.pos_unlock_store(1,40,'0000'); END LOOP;
 IF result->>'error'<>'RATE_LIMITED' THEN RAISE EXCEPTION 'RATE_LIMIT_FAILED'; END IF;
 IF has_schema_privilege('anon','pos_private','USAGE') THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_LEAK'; END IF;
 IF has_function_privilege('anon','public.list_employees_state(bigint)','EXECUTE') THEN
   RAISE EXCEPTION 'PRIVATE_ROSTER_REGRANTED'; END IF;
 IF NOT has_function_privilege('anon','public.pos_public_staff_picker(bigint)','EXECUTE') THEN
   RAISE EXCEPTION 'NAME_PICKER_NOT_AVAILABLE'; END IF;
 IF (SELECT count(*) FROM public.pos_public_staff_picker(1))<>1 THEN
   RAISE EXCEPTION 'READY_STORE_PICKER_EMPTY'; END IF;
 IF (SELECT count(*) FROM public.pos_public_staff_picker(2))<>0 THEN
   RAISE EXCEPTION 'STAGED_ROSTER_LEAK'; END IF;
 IF (SELECT count(*) FROM public.pos_public_staff_picker(999))<>0 THEN
   RAISE EXCEPTION 'UNKNOWN_STORE_ROSTER_LEAK'; END IF;
 IF (SELECT count(*) FROM public.pos_public_staff_picker(1) p WHERE p.name='demo-staff' AND p.employee_no=7 AND p.id=1)<>1 THEN
   RAISE EXCEPTION 'PICKER_WRONG_EMPLOYEE'; END IF;
 IF (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute
     WHERE attrelid='public.employees'::regclass AND attnum>0 AND NOT attisdropped) IS NULL THEN
   RAISE EXCEPTION 'STAFF_FIXTURE_INVALID'; END IF;
END $$;
ROLLBACK;
