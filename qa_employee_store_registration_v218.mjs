import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260927084350_fix_employee_store_registration.sql','utf8');

assert.ok(html.includes('const APP_VERSION="v0.01"'));
assert.ok(html.includes('admin_create_employee_onboarding_for_store'));
assert.ok(html.includes('Number(sessionStorage.getItem("baekeok_store_id"))||1'));
assert.ok(!html.includes('CURRENT_STORE_ID?rpc("admin_create_employee_for_store"'));
assert.match(migration,/insert into public\.employees\(name,pin_bcrypt,is_active,store_id\)/);
assert.match(migration,/values\(trim\(p_name\),crypt\(p_pin,gen_salt\('bf'\)\),true,p_store_id\)/);
assert.match(migration,/v_emp:=public\.admin_create_employee_for_store\(trim\(p_name\),p_pin,p_store_id\)/);
assert.match(migration,/revoke execute on function public\.admin_create_employee_onboarding_for_store/);

console.log('employee store registration v218 QA PASS');
