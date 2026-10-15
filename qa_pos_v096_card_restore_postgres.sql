-- Isolated synthetic PostgreSQL 16 fixture; never accesses production data.
BEGIN;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.stores(id bigint PRIMARY KEY,is_active boolean,onboarding_status text);
CREATE TABLE public.employees(
 id bigint PRIMARY KEY,employee_no integer,name text,store_id bigint,
 is_active boolean,working boolean,working_since timestamp,
 today_work_seconds bigint,today_first_in timestamp,today_last_out timestamp,
 hourly_wage bigint,pin_bcrypt text
);
CREATE FUNCTION public.list_employees_state(p_store_id bigint)
RETURNS TABLE(id bigint,name text,employee_no integer,working boolean,working_since timestamp,
 today_work_seconds bigint,today_first_in timestamp,today_last_out timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
 SELECT e.id,e.name,e.employee_no,e.working,e.working_since,
 e.today_work_seconds,e.today_first_in,e.today_last_out
 FROM public.employees e WHERE e.store_id=p_store_id AND e.is_active
$body$;
REVOKE ALL ON FUNCTION public.list_employees_state(bigint) FROM PUBLIC,anon,authenticated;
INSERT INTO public.stores VALUES(1,true,'READY'),(2,true,'STAGED'),(3,false,'READY');
INSERT INTO public.employees VALUES
(10,1,'working-staff',1,true,true,'2026-10-15 09:00:00',1500,'2026-10-15 09:00:00',NULL,15000,'hash-not-exposed'),
(11,2,'off-staff',1,true,false,NULL,3600,'2026-10-15 08:00:00','2026-10-15 09:00:00',12000,'hash-not-exposed'),
(12,3,'inactive-staff',1,false,false,NULL,0,NULL,NULL,12000,'hash-not-exposed'),
(20,1,'staged-staff',2,true,false,NULL,0,NULL,NULL,9000,'hash-not-exposed'),
(30,1,'disabled-store-staff',3,true,false,NULL,0,NULL,NULL,8000,'hash-not-exposed');
\i supabase/migrations/20261015194500_pos_v096_public_cards.sql
DO $test$
DECLARE all_names text[]; v record;
BEGIN
 IF has_function_privilege('anon','public.list_employees_state(bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'OLD_FULL_ROSTER_AUTH_BYPASS'; END IF;
 IF NOT has_function_privilege('anon','public.pos_public_staff_cards(bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'NO_ANON_KIOSK_VIEW'; END IF;
 IF (SELECT count(*) FROM public.pos_public_staff_cards(1))<>2
 THEN RAISE EXCEPTION 'VALID_READY_STAFF_NOT_VISIBLE'; END IF;
 IF (SELECT count(*) FROM public.pos_public_staff_cards(2))<>0
 OR (SELECT count(*) FROM public.pos_public_staff_cards(3))<>0
 OR (SELECT count(*) FROM public.pos_public_staff_cards(999))<>0
 THEN RAISE EXCEPTION 'NON_READY_STORE_DATA_LEAK'; END IF;
 IF EXISTS(SELECT 1 FROM public.pos_public_staff_cards(1) WHERE id=12)
 THEN RAISE EXCEPTION 'INACTIVE_EMPLOYEE_LEAK'; END IF;
 SELECT * INTO v FROM public.pos_public_staff_cards(1) WHERE id=10;
 IF NOT v.working OR v.working_since<>'2026-10-15 09:00:00'::timestamp
 THEN RAISE EXCEPTION 'TRUE_WORK_STATE_MISSING'; END IF;
 SELECT * INTO v FROM public.pos_public_staff_cards(1) WHERE id=11;
 IF v.working OR v.today_work_seconds<>3600
 THEN RAISE EXCEPTION 'TODAY_WORK_HISTORY_MISSING'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_name='pos_public_staff_cards')>0
 THEN RAISE EXCEPTION 'UNEXPECTED_PUBLIC_STORAGE'; END IF;
END $test$;
SET LOCAL ROLE anon;
SELECT count(*) FROM public.pos_public_staff_cards(1);
RESET ROLE;
ROLLBACK;