-- One-time, private, auditable backup of clearly labeled preproduction demo records.
-- Designed to preserve the 2026-09-24 seeded data before carefully scoped removal.
-- Do not archive or modify actual READY store #1 and its real staff.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS demo_cleanup_archive;
REVOKE ALL ON SCHEMA demo_cleanup_archive FROM PUBLIC, anon, authenticated;
DO $guard$
DECLARE v_stores integer; v_staff integer; v_events integer; v_periods integer; v_contracts integer; v_days integer; v_locations integer;
BEGIN
 SELECT count(*) INTO v_stores FROM public.stores WHERE source_store_key LIKE 'demo_%' AND onboarding_status='STAGED' AND is_active=false;
 IF v_stores<>39 OR EXISTS(SELECT 1 FROM public.stores WHERE source_store_key LIKE 'demo_%' AND (onboarding_status<>'STAGED' OR is_active)) THEN
  RAISE EXCEPTION 'SEED_STORES_DRIFT_OR_ACTIVE';
 END IF;
 SELECT count(*) INTO v_staff FROM public.employees e JOIN public.stores s ON s.id=e.store_id
 WHERE s.onboarding_status='STAGED' AND e.store_id<>1 AND
    (coalesce(e.memo,'') ILIKE '%데모%' OR coalesce(e.memo,'') ILIKE '%샘플%' OR e.name ILIKE '%테스트%');
 IF v_staff<>893 OR EXISTS(
   SELECT 1 FROM public.employees e JOIN public.stores s ON s.id=e.store_id
   WHERE s.onboarding_status='STAGED' AND e.store_id<>1
     AND NOT (coalesce(e.memo,'') ILIKE '%데모%' OR coalesce(e.memo,'') ILIKE '%샘플%' OR e.name ILIKE '%테스트%')
 ) THEN RAISE EXCEPTION 'NOT_ALL_STAGED_EMPLOYEES_PROVEN_SEEDS'; END IF;
 SELECT count(*) INTO v_events FROM public.attendance_events ae JOIN public.employees e ON e.id=ae.employee_id
 WHERE e.store_id<>1;
 IF v_events<>5236 OR EXISTS(SELECT 1 FROM public.attendance_events ae JOIN public.employees e ON e.id=ae.employee_id
 WHERE e.store_id<>1 AND ae.created_at::date<>'2026-09-24'::date) THEN
  RAISE EXCEPTION 'NEW_NONSEED_ATTENDANCE_EVENTS';
 END IF;
 SELECT count(*) INTO v_periods FROM public.employment_periods p JOIN public.employees e ON e.id=p.employee_id WHERE e.store_id<>1;
 SELECT count(*) INTO v_contracts FROM public.employment_contracts c JOIN public.employment_periods p ON p.id=c.employment_period_id JOIN public.employees e ON e.id=p.employee_id WHERE e.store_id<>1;
 SELECT count(*) INTO v_days FROM public.employment_contract_workdays w JOIN public.employment_contracts c ON c.id=w.contract_id JOIN public.employment_periods p ON p.id=c.employment_period_id JOIN public.employees e ON e.id=p.employee_id WHERE e.store_id<>1;
 SELECT count(*) INTO v_locations FROM public.store_locations l JOIN public.stores s ON s.id=l.store_id WHERE s.source_store_key LIKE 'demo_%';
 IF v_periods<>719 OR v_contracts<>719 OR v_days<>3595 OR v_locations<>4 THEN
  RAISE EXCEPTION 'SEED_DEPENDENCIES_CHANGED';
 END IF;
 IF EXISTS(SELECT 1 FROM public.employment_contracts c JOIN public.employment_periods p ON p.id=c.employment_period_id JOIN public.employees e ON e.id=p.employee_id JOIN auth.users u ON lower(u.email)=lower(c.created_by_email) WHERE e.store_id<>1) THEN
  RAISE EXCEPTION 'REAL_AUTH_USER_APPEARS_IN_SEED_CONTRACTS';
 END IF;
END;
$guard$;
CREATE TABLE demo_cleanup_archive.stores_20261015 AS SELECT * FROM public.stores WHERE source_store_key LIKE 'demo_%';
CREATE TABLE demo_cleanup_archive.store_locations_20261015 AS
 SELECT l.* FROM public.store_locations l JOIN public.stores s ON s.id=l.store_id WHERE s.source_store_key LIKE 'demo_%';
CREATE TABLE demo_cleanup_archive.employees_20261015 AS
 SELECT e.* FROM public.employees e JOIN public.stores s ON s.id=e.store_id WHERE s.onboarding_status='STAGED' AND e.store_id<>1;
CREATE TABLE demo_cleanup_archive.attendance_events_20261015 AS
 SELECT ae.* FROM public.attendance_events ae JOIN demo_cleanup_archive.employees_20261015 e ON e.id=ae.employee_id;
CREATE TABLE demo_cleanup_archive.employment_periods_20261015 AS
 SELECT p.* FROM public.employment_periods p JOIN demo_cleanup_archive.employees_20261015 e ON e.id=p.employee_id;
CREATE TABLE demo_cleanup_archive.employment_contracts_20261015 AS
 SELECT c.* FROM public.employment_contracts c JOIN demo_cleanup_archive.employment_periods_20261015 p ON p.id=c.employment_period_id;
CREATE TABLE demo_cleanup_archive.employment_contract_workdays_20261015 AS
 SELECT w.* FROM public.employment_contract_workdays w JOIN demo_cleanup_archive.employment_contracts_20261015 c ON c.id=w.contract_id;
REVOKE ALL ON ALL TABLES IN SCHEMA demo_cleanup_archive FROM PUBLIC,anon,authenticated;
COMMIT;
