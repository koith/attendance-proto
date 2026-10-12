\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE TABLE public.stores(id bigint primary key,is_active boolean,onboarding_status text);
CREATE TABLE public.store_settings(store_id bigint,open_minute integer);
CREATE TABLE public.employees(id bigint primary key,name text,employee_no integer,is_active boolean,store_id bigint);
CREATE TABLE public.attendance_events(id bigint primary key,employee_id bigint,event_type text,event_at timestamp without time zone);
CREATE TABLE public.event_corrections(
 id bigint primary key,event_id bigint,employee_id bigint,action text,
 new_event_type text,new_event_at timestamp without time zone,created_at timestamptz
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employees,public.attendance_events,public.event_corrections FROM PUBLIC,anon;
INSERT INTO public.stores VALUES (1,true,'READY'),(2,false,'STAGED'),(3,true,'READY');
INSERT INTO public.employees VALUES (101,'first',1,true,1),(201,'staged',1,true,2),(301,'inactive',1,false,3);
INSERT INTO public.attendance_events VALUES
 (1,101,'IN',clock_timestamp() at time zone 'UTC'),
 (2,201,'IN',clock_timestamp() at time zone 'UTC'),
 (3,301,'IN',clock_timestamp() at time zone 'UTC');
INSERT INTO public.event_corrections VALUES (10,NULL,201,'ADD','OUT',clock_timestamp() at time zone 'UTC',now());
\ir supabase/migrations/20261012195000_anon_pos_employee_store_scoped_events.sql
GRANT USAGE ON SCHEMA public TO anon;
GRANT EXECUTE ON FUNCTION public.list_employees_state(bigint) TO anon;
SET ROLE anon;
DO $test$
DECLARE cnt integer; working_now boolean;
BEGIN
 SELECT count(*),bool_and(working) INTO cnt,working_now FROM public.list_employees_state(1);
 IF cnt<>1 OR working_now IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'READY store roster regression: %, %',cnt,working_now;
 END IF;
 SELECT count(*) INTO cnt FROM public.list_employees_state(2);
 IF cnt<>0 THEN RAISE EXCEPTION 'STAGED store roster disclosed'; END IF;
 SELECT count(*) INTO cnt FROM public.list_employees_state(3);
 IF cnt<>0 THEN RAISE EXCEPTION 'inactive employee disclosed'; END IF;
 SELECT count(*) INTO cnt FROM public.list_employees_state(NULL);
 IF cnt<>0 THEN RAISE EXCEPTION 'NULL store roster disclosed'; END IF;
 SELECT count(*) INTO cnt FROM public.list_employees_state(9999);
 IF cnt<>0 THEN RAISE EXCEPTION 'unknown store roster disclosed'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS scoped POS roster: READY correct, STAGED/NULL/unknown/inactive hidden' as result;
