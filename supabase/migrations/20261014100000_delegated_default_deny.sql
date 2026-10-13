-- Bootstrap every newly registered store manager with no delegated capabilities.
-- Existing managers and their permissions are NOT changed. A primary appointed by HQ
-- always retains full rights through the explicit primary-owner authorization.
CREATE OR REPLACE FUNCTION public.store_delegated_default_deny_on_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $default_deny$
BEGIN
 IF NEW.admin_role='STORE_MANAGER' AND NEW.store_id IS NOT NULL THEN
  INSERT INTO public.store_delegated_permissions(
    store_id,user_id,staff_edit,attendance_approve,payroll_view
  ) VALUES(NEW.store_id,NEW.user_id,false,false,false)
  ON CONFLICT (store_id,user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END
$default_deny$;

DROP TRIGGER IF EXISTS store_delegated_default_deny_after_insert ON public.admin_users;
CREATE TRIGGER store_delegated_default_deny_after_insert
AFTER INSERT ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.store_delegated_default_deny_on_join();

REVOKE ALL ON FUNCTION public.store_delegated_default_deny_on_join()
 FROM PUBLIC,anon,authenticated;
