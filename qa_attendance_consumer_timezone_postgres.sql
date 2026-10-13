\set ON_ERROR_STOP on
-- Purely synthetic disposable PostgreSQL 16 fixture. Production employee data is NEVER written.
\ir qa_actual_attendance_overnight_timezone_postgres.sql
ALTER TABLE public.employees
 ADD COLUMN wage numeric DEFAULT 0, ADD COLUMN juhyu_hours numeric DEFAULT 0,
 ADD COLUMN juhyu_round integer DEFAULT 0, ADD COLUMN tax_rate numeric DEFAULT 0,
 ADD COLUMN memo text;
CREATE TABLE public.payroll_period(store_id bigint,ym text,status text,weeks integer);
CREATE TABLE public.payroll_period_employee(employee_id bigint,ym text,store_id bigint);
CREATE TABLE public.employment_periods(id bigint,employee_id bigint,started_on date,ended_on date);
CREATE TABLE public.employment_contracts(
 id bigint,employment_period_id bigint,payroll_type text,hourly_wage numeric,
 monthly_salary numeric,tax_treatment text,business_deduction_rate numeric,
 effective_from date,effective_to date,break_time_provided boolean,
 break_provision_mode text,night_allowance_enabled boolean,
 night_allowance_mode text,night_allowance_value numeric,
 night_allowance_start time,night_allowance_end time,weekly_contracted_minutes integer
);
CREATE TABLE public.employment_contract_workdays(contract_id bigint,weekday integer,contracted_minutes integer);
CREATE TABLE public.substitution_requests(
 id bigint,substitute_employee_id bigint,requester_employee_id bigint,
 actual_minutes integer,work_start timestamp,work_end timestamp,status text
);
CREATE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
SELECT set_config('request.jwt.claims','{}',false);
\ir supabase/migrations/20261013195000_attendance_consumer_timezone_parity.sql
DO $qa$
DECLARE a timestamp; b timestamp; val jsonb; j jsonb;
BEGIN
 -- Sheet/payroll returns KST correction clocks, not 9h-shifted wall times.
 val:=public.sheet_server_payroll_source(1,'2026-10');
 SELECT (x->>'new_event_at')::timestamp INTO a FROM jsonb_array_elements(val->'corrections') x WHERE (x->>'id')::bigint=1;
 SELECT (x->>'new_event_at')::timestamp INTO b FROM jsonb_array_elements(val->'corrections') x WHERE (x->>'id')::bigint=2;
 IF a <> timestamp '2026-10-13 01:00:00' OR b <> timestamp '2026-10-13 01:30:00'
 THEN RAISE EXCEPTION 'SHEET_PAYROLL_9H_DRIFT: legacy=% new=%',a,b; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(val->'corrections') x WHERE x->>'created_by'='synthetic-manager')
 THEN RAISE EXCEPTION 'AUTO_CLOSE_PROVENANCE_MISSING_IN_PAYROLL_SOURCE'; END IF;
 -- Employee PIN view must use the same clock, including a post-cutover
 -- edited time on the next-day narrow 00:00-03:00 local calendar window.
 j:=public.staff_actual_attendance(931,'1234','2026-10-13 00:00','2026-10-13 03:00')::jsonb;
 IF j->>'ok' <> 'true' THEN RAISE EXCEPTION 'STAFF_PIN_FAILED %',j; END IF;
 SELECT (x->>'new_event_at')::timestamp INTO b
 FROM jsonb_array_elements(j->'corrections') x WHERE (x->>'id')::bigint=2;
 IF b <> timestamp '2026-10-13 01:30:00'
 THEN RAISE EXCEPTION 'EMPLOYEE_VIEW_MISSING_NEW_KST_EDIT: %',b; END IF;
 j:=public.admin_events_with_corrections('2026-10-10','2026-10-15')::jsonb;
 SELECT (x->>'new_event_at')::timestamp INTO a FROM jsonb_array_elements(j->'corrections') x WHERE (x->>'id')::bigint=1;
 SELECT (x->>'new_event_at')::timestamp INTO b FROM jsonb_array_elements(j->'corrections') x WHERE (x->>'id')::bigint=2;
 IF a <> timestamp '2026-10-13 01:00:00' OR b <> timestamp '2026-10-13 01:30:00'
 THEN RAISE EXCEPTION 'HQ_CALENDAR_DRIFT legacy=% new=%',a,b; END IF;
 -- UTC projection contract must match effective UTC, not unconverted KST.
 SELECT p.event_at INTO a FROM public.sheet_month_attendance_projection(1,'2026-10') p
 WHERE p.employee_id=930 AND p.source='event' AND p.event_type='OUT';
 SELECT p.event_at INTO b FROM public.sheet_month_attendance_projection(1,'2026-10') p
 WHERE p.employee_id=931 AND p.source='event' AND p.event_type='OUT';
 IF a <> timestamp '2026-10-12 16:00:00' OR b <> timestamp '2026-10-12 16:30:00'
 THEN RAISE EXCEPTION 'MONTH_PROJECTION_NOT_UTC: legacy=% new=%',a,b; END IF;
END $qa$;
-- Invalidated automatic ADD must never survive effective source projection.
INSERT INTO public.event_corrections(employee_id,action,new_event_at,new_event_type,reason,created_by)
VALUES(930,'ADD','2026-10-12 17:00','OUT','SYSTEM_STORE_CLOSE [VOID_ADD:999]','system:auto-close');
DO $qa$
BEGIN
 IF EXISTS(SELECT 1 FROM public.sheet_month_attendance_projection(1,'2026-10')
           WHERE employee_id=930 AND source='correction' AND event_at=timestamp '2026-10-12 17:00')
 THEN RAISE EXCEPTION 'VOID_ADD_PROJECTION_REAPPEARED'; END IF;
END $qa$;
SELECT 'PASS correction time parity: payroll/Sheet, employee PIN calendar, HQ admin and UTC projection (including VOID_ADD)' AS result;
