-- SEC-S11 regression: synthetic-only disposable PG16/17 fixture.
-- This file intentionally writes only to the TEST PostgreSQL container.
-- Never execute against the operating Supabase database.
BEGIN;
CREATE TABLE public.attendance_events (
 id bigint PRIMARY KEY, employee_id bigint NOT NULL,
 event_type text NOT NULL, event_at timestamp NOT NULL
);
CREATE TABLE public.event_corrections (
 id bigint PRIMARY KEY, event_id bigint, employee_id bigint NOT NULL,
 action text NOT NULL, new_event_at timestamp, new_event_type text,
 reason text, created_by text, created_at timestamptz NOT NULL
);
CREATE TABLE public.employment_periods (
 id bigint PRIMARY KEY, employee_id bigint NOT NULL,
 started_on date NOT NULL, ended_on date
);
CREATE TABLE public.employment_contracts (
 id bigint PRIMARY KEY, employment_period_id bigint NOT NULL,
 effective_from date NOT NULL, effective_to date
);
CREATE TABLE public.payroll_snapshot (
 employee_id bigint NOT NULL, ym text NOT NULL
);
-- Exactly the published operating function's canonical timestamp semantics.
CREATE FUNCTION public.attendance_correction_effective_utc(
 p_at timestamp without time zone, p_actor text, p_created_at timestamptz
) RETURNS timestamp without time zone LANGUAGE sql IMMUTABLE
AS $function$ SELECT CASE WHEN p_at IS NULL THEN NULL
 WHEN coalesce(p_actor,'')='system:auto-close'
   OR coalesce(p_actor,'') LIKE 'substitution:%'
   OR p_created_at < TIMESTAMPTZ '2026-10-13 06:00:00+00' THEN p_at
 ELSE ((p_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')::timestamp END $function$;
INSERT INTO public.attendance_events(id,employee_id,event_type,event_at) VALUES
 (1,100,'IN','2026-10-20 01:00:00'),
 (2,100,'OUT','2026-10-20 12:00:00'),
 (3,101,'IN','2026-10-20 20:00:00');
INSERT INTO public.event_corrections
 (id,event_id,employee_id,action,new_event_at,new_event_type,reason,created_by,created_at)
 VALUES
 (10,NULL,100,'ADD','2026-10-20 09:00:00','OUT','SYSTEM_STORE_CLOSE','system:auto-close','2026-10-20 09:00:00+00'),
 (11,NULL,101,'ADD','2026-10-20 09:00:00','OUT','SYSTEM_STORE_CLOSE','system:auto-close','2026-10-20 09:00:00+00'),
 (20,2,100,'EDIT_TIME','2026-10-20 16:00:00','OUT','fixture_edit','fixture:human','2026-10-20 12:10:00+00'),
 (21,3,101,'EDIT_TIME','2026-10-20 17:00:00','IN','fixture_edit','fixture:human','2026-10-20 12:10:00+00');
INSERT INTO public.employment_periods VALUES
 (1,100,'2026-09-01',NULL),(2,101,'2026-09-01',NULL);
INSERT INTO public.employment_contracts VALUES
 (1,1,'2026-09-01',NULL),(2,2,'2026-09-01',NULL);
-- Different UTC values are intentional:
-- operator corrected OUT at local 16:00 => UTC 07:00, before auto UTC 09:00
-- operator corrected IN at local 17:00 => UTC 08:00, before auto UTC 09:00
-- legacy incorrect logic would count one false missing IN and no intervening OUT.

-- This commits only the synthetic fixture inside a disposable CI container.
COMMIT;
