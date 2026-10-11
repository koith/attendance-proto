-- Keep public store readiness and the underlying active bit consistent.
-- Historical nationwide seeded stores were STAGED but 243 retained is_active=true.
-- Only normalize non-READY flags. Never modify Inha READY or any employee/payroll data.
BEGIN;

ALTER TABLE public.stores ALTER COLUMN is_active SET DEFAULT false;

UPDATE public.stores
   SET is_active=false
 WHERE onboarding_status IN ('STAGED','SUSPENDED')
   AND is_active=true
   AND id<>1;

-- An active storefront must have passed HQ evidence review and owner activation
-- through the existing READY-gated RPC; new inserts default to STAGED/inactive.
ALTER TABLE public.stores
  ADD CONSTRAINT stores_ready_active_consistency
  CHECK (is_active=(onboarding_status='READY'));

COMMIT;
