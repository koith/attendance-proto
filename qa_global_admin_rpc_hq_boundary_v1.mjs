import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261011071000_legacy_global_admin_rpc_hq_gate.sql','utf8');
const guarded=[
  "admin_clear_operations_demo()",
  "admin_create_employee_onboarding(text,text,date,text,integer,integer,text,numeric,boolean,text,numeric,time without time zone,text,jsonb)",
  "admin_create_employee(text,text)",
  "admin_inventory_items()",
  "admin_inventory_movements(bigint,date,date)",
  "admin_inventory_overview_v2()",
  "admin_inventory_overview_v3()",
  "admin_inventory_overview()",
  "admin_inventory_unit_config_save(bigint,text,text,numeric)",
  "admin_operations_analytics(date,date)",
  "admin_operations_channels(date,date)",
  "admin_operations_collect_request(text)",
  "admin_operations_import_stage(text,text,jsonb)",
  "admin_operations_imports()",
  "admin_operations_inquiry(date,date,text,text)",
  "admin_operations_summary(date,date)",
  "admin_operations_transactions(date,date,text)",
  "admin_operations_trend(text)",
  "admin_recipe_list_v2()",
  "admin_recipe_list()",
  "admin_recipe_save(bigint,text,text,jsonb,text)",
  "admin_reconciliation_issues(date,date)",
  "admin_seed_operations_demo()",
  "admin_store_settings_get()",
  "admin_store_settings_set(integer,integer,integer)"
];
for(const fn of guarded)assert.ok(sql.includes("'public."+fn+"'"),'Missing '+fn);
assert.equal((sql.match(/'public\.admin_/g)||[]).length,guarded.length);
assert.match(sql,/position\('public\.is_admin\(\)' in v_definition\)=0/);
assert.match(sql,/position\('public\.can_manage_store\(' in v_definition\)>0/);
assert.match(sql,/replace\(v_definition,'public\.is_admin\(\)','public\.is_hq_admin\(\)'\)/);
assert.match(sql,/EXECUTE replace/);
assert.doesNotMatch(sql,/\bDELETE FROM public\.(?:employees|payroll_snapshot|attendance_events)\b/i);
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/admin_create_employee_for_store/);
assert.match(html,/admin_store_settings_get",\{p_store_id:/);
assert.match(html,/admin_store_settings_set",\{p_open_minute:/);
assert.match(html,/admin_inventory_manual_list/);
console.log('PASS 25 legacy unscoped admin RPCs guarded by HQ role, scoped owner APIs retained');
