-- SEC-S08 live production, READ-ONLY: authenticated SECURITY DEFINER ACL inventory.
-- Re-run through Supabase SQL read-only query. Never output user records or secrets.
-- This reviews 214 function sources, EXECUTE ACL, fixed search_path and guard families.
-- This is NOT a replacement for separately required hosted JWT/cross-store E2E (SEC-S05/S06/S09).
WITH inventory AS MATERIALIZED (
  SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
    p.prorettype::regtype::text AS return_type, p.proconfig,
    split_part(pg_get_functiondef(p.oid), 'AS $function$', 2) AS body,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
), classified AS (
  SELECT *,
    CASE
      WHEN NOT anon_exec AND return_type='trigger'
        AND proname IN ('cancel_revoked_owner_invitation','store_assistant_invitation_default_permissions')
        THEN 'internal_trigger'
      WHEN NOT anon_exec AND body ~*
        'public\.(is_hq_admin|store_scope_can|can_manage_store|can_manage_hq|require_[a-z_]+|is_store_admin|is_admin|can_[a-z_]+|[a-z_]*auth[a-z_]*|[a-z_]*pin[a-z_]*|[a-z_]*token[a-z_]*)\s*\(|auth\.uid\(|auth\.jwt\(|request.jwt|require_latest_session|guard_[a-z_]+'
        THEN 'signed_guarded'
      WHEN anon_exec AND proname IN
        ('list_stores','pos_public_staff_cards','pos_public_staff_picker','store_recipe_list_public')
        THEN 'intentional_public_ui'
      WHEN anon_exec AND proname='pos_employees_state'
        AND body ~* 'POS_AUTH_REQUIRED' AND body ~* 'token_digest'
        THEN 'pos_token_checked'
      WHEN anon_exec AND args ~* 'p_pin\s+text'
        AND body ~* 'pin_private\.verify\s*\(|staff_stocktake_verify\s*\('
        AND body ~* 'v_guard|staff_stocktake_verify'
        THEN 'pin_checked'
      ELSE 'UNCLASSIFIED'
    END AS review_class,
    coalesce(array_to_string(proconfig,';'),'') LIKE '%search_path=%' AS pinned_path,
    body ~* 'raw_user_meta_data|user_metadata' AS user_metadata_ref
  FROM inventory
), totals AS (
  SELECT count(*)::integer total,
    count(*) FILTER (WHERE anon_exec)::integer anon_exec_count,
    count(*) FILTER (WHERE NOT anon_exec)::integer signed_only_count,
    count(*) FILTER (WHERE review_class='signed_guarded')::integer signed_guarded,
    count(*) FILTER (WHERE review_class='internal_trigger')::integer internal_triggers,
    count(*) FILTER (WHERE review_class='intentional_public_ui')::integer public_ui,
    count(*) FILTER (WHERE review_class='pos_token_checked')::integer pos_token,
    count(*) FILTER (WHERE review_class='pin_checked')::integer pin_checked,
    count(*) FILTER (WHERE review_class='UNCLASSIFIED')::integer unclassified,
    count(*) FILTER (WHERE NOT pinned_path)::integer path_unpinned,
    count(*) FILTER (WHERE user_metadata_ref)::integer user_metadata_references,
    count(DISTINCT oid)::integer unique_function_oids,
    coalesce(array_agg(format('%s(%s)',proname,args) ORDER BY proname)
      FILTER (WHERE review_class='UNCLASSIFIED'), ARRAY[]::text[]) AS unexpected_signatures
  FROM classified
)
SELECT t.*,
  has_schema_privilege('anon','public','CREATE') AS anon_can_create_public,
  has_schema_privilege('authenticated','public','CREATE') AS signed_can_create_public,
  has_schema_privilege('anon','extensions','CREATE') AS anon_can_create_extensions,
  has_schema_privilege('authenticated','extensions','CREATE') AS signed_can_create_extensions,
  (SELECT count(*)::integer FROM pg_trigger tr JOIN pg_proc p ON p.oid=tr.tgfoid
     WHERE p.proname IN ('cancel_revoked_owner_invitation',
                        'store_assistant_invitation_default_permissions')
       AND tr.tgenabled IN ('O','A') AND NOT tr.tgisinternal
  ) AS active_internal_trigger_links
FROM totals t;

-- Acceptance gate (compare output, do not automatically REVOKE):
-- unclassified=0, path_unpinned=0, user_metadata_references=0
-- anon/signed CREATE on public/extensions all FALSE, internal trigger links=2.
-- 2026-11-13 observed: total 214; signed only 195; anon 19;
-- signed_guarded 193; trigger 2; public UI 4; token 1; PIN-verified 14.
-- If inventory count or categories drift, inspect changed definitions individually
-- and rerun hosted JWT/non-owner tests before making privilege changes.
