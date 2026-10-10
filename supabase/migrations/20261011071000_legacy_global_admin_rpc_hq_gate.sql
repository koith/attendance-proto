-- Disable cross-store access through the old global admin endpoints.
-- Modern /_for_store and store-scoped endpoints remain available to store owners.
-- This migration rewrites only the authorization guard on enumerated legacy functions;
-- return signatures and data/functional SQL remain unchanged.
DO $hardening$
DECLARE v_signature text; v_definition text; v_functions text[]:=ARRAY[
    'public.admin_clear_operations_demo()',
    'public.admin_create_employee_onboarding(text,text,date,text,integer,integer,text,numeric,boolean,text,numeric,time without time zone,text,jsonb)',
    'public.admin_create_employee(text,text)',
    'public.admin_inventory_items()',
    'public.admin_inventory_movements(bigint,date,date)',
    'public.admin_inventory_overview_v2()',
    'public.admin_inventory_overview_v3()',
    'public.admin_inventory_overview()',
    'public.admin_inventory_unit_config_save(bigint,text,text,numeric)',
    'public.admin_operations_analytics(date,date)',
    'public.admin_operations_channels(date,date)',
    'public.admin_operations_collect_request(text)',
    'public.admin_operations_import_stage(text,text,jsonb)',
    'public.admin_operations_imports()',
    'public.admin_operations_inquiry(date,date,text,text)',
    'public.admin_operations_summary(date,date)',
    'public.admin_operations_transactions(date,date,text)',
    'public.admin_operations_trend(text)',
    'public.admin_recipe_list_v2()',
    'public.admin_recipe_list()',
    'public.admin_recipe_save(bigint,text,text,jsonb,text)',
    'public.admin_reconciliation_issues(date,date)',
    'public.admin_seed_operations_demo()',
    'public.admin_store_settings_get()',
    'public.admin_store_settings_set(integer,integer,integer)'
];
BEGIN
 FOREACH v_signature IN ARRAY v_functions LOOP
   SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_definition;
   IF v_definition IS NULL OR position('public.is_admin()' in v_definition)=0 THEN
      RAISE EXCEPTION 'GLOBAL_RPC_GUARD_CONTRACT_CHANGED: %',v_signature;
   END IF;
   IF position('public.can_manage_store(' in v_definition)>0 THEN
      RAISE EXCEPTION 'REFUSE_TO_DOWNGRADE_SCOPED_RPC: %',v_signature;
   END IF;
   EXECUTE replace(v_definition,'public.is_admin()','public.is_hq_admin()');
 END LOOP;
END
$hardening$;
