\set ON_ERROR_STOP on
-- Disposable PG16/17 only. No connection to production or real employee rows.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.admin_users (
  id integer PRIMARY KEY,
  cancel_trigger_ran boolean NOT NULL DEFAULT false,
  permission_trigger_ran boolean NOT NULL DEFAULT false
);
CREATE OR REPLACE FUNCTION public.cancel_revoked_owner_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $body$ BEGIN NEW.cancel_trigger_ran:=true; RETURN NEW; END $body$;
CREATE OR REPLACE FUNCTION public.store_assistant_invitation_default_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $body$ BEGIN NEW.permission_trigger_ran:=true; RETURN NEW; END $body$;
CREATE TRIGGER cancel_revoked_owner_invitation
  BEFORE INSERT ON public.admin_users FOR EACH ROW
  EXECUTE FUNCTION public.cancel_revoked_owner_invitation();
CREATE TRIGGER store_assistant_invitation_default_permissions
  BEFORE INSERT ON public.admin_users FOR EACH ROW
  EXECUTE FUNCTION public.store_assistant_invitation_default_permissions();
-- Mirror production explicit grants; PUBLIC defaults to execute on new funcs.
GRANT EXECUTE ON FUNCTION public.cancel_revoked_owner_invitation()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_assistant_invitation_default_permissions()
  TO anon, authenticated, service_role;
CREATE FUNCTION public.synthetic_guest_public_rpc() RETURNS integer LANGUAGE sql
SECURITY DEFINER AS $func$SELECT 42$func$;
DO $pre$
BEGIN
  IF NOT has_function_privilege('anon',
    'public.cancel_revoked_owner_invitation()','EXECUTE')
    OR NOT has_function_privilege('anon',
    'public.store_assistant_invitation_default_permissions()','EXECUTE')
    OR NOT has_function_privilege('anon',
    'public.synthetic_guest_public_rpc()','EXECUTE')
  THEN RAISE EXCEPTION 'SEC_S2_FIXTURE_BASELINE_INVALID'; END IF;
END
$pre$;
\i security/sec_s2_anon_trigger_execute_hardening.sql
-- Re-running migration must not add, remove or alter any operational records.
\i security/sec_s2_anon_trigger_execute_hardening.sql
INSERT INTO public.admin_users(id) VALUES (101);
DO $post$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_users
             WHERE NOT cancel_trigger_ran OR NOT permission_trigger_ran)
    OR (SELECT count(*) FROM public.admin_users)<>1 THEN
    RAISE EXCEPTION 'SEC_S2_EXISTING_TRIGGER_FUNCTIONALITY_BROKEN';
  END IF;
  IF has_function_privilege('anon',
    'public.cancel_revoked_owner_invitation()','EXECUTE')
    OR has_function_privilege('anon',
    'public.store_assistant_invitation_default_permissions()','EXECUTE')
  THEN RAISE EXCEPTION 'SEC_S2_UNNECESSARY_ANON_EXECUTE_STILL_AVAILABLE'; END IF;
  IF NOT has_function_privilege('anon',
    'public.synthetic_guest_public_rpc()','EXECUTE')
  THEN RAISE EXCEPTION 'SEC_S2_PUBLIC_POS_FUNCTION_DISRUPTED'; END IF;
END
$post$;
ROLLBACK;
SELECT 'PASS SEC-S2: anonymous trigger EXECUTE revoked, active admin triggers still fire, public guest RPC untouched, repeat idempotent' AS result;
