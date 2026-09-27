import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(file,'utf8');
const html=read('index.html');
const migration=read('supabase/migrations/20260927085725_store_scoped_employee_numbers.sql');
const compactMigration=read('supabase/migrations/20260927191500_compact_active_employee_numbers.sql');
const substitution=read('substitution_v2.js');
const attendance=read('actual_attendance.js');
const contracts=read('employment_contract_employee_number_v1.js');

assert.ok(html.includes('const APP_VERSION="v0.01"'));
assert.ok(html.includes('function employeeNumber(employee){ return Number(employee?.employee_no)||Number(employee?.id)||0; }'));
assert.ok(!html.includes('No.${safeHtml(e.id)}'));
assert.match(migration,/row_number\(\) over\(partition by store_id order by created_at,id\)/i);
assert.match(migration,/unique index if not exists employees_store_employee_no_uidx on public\.employees\(store_id,employee_no\)/i);
assert.match(migration,/pg_advisory_xact_lock\(hashtext\('employees_store_no'\),new\.store_id::integer\)/i);
assert.match(migration,/create trigger employees_assign_store_employee_no before insert or update of store_id/i);
assert.match(migration,/returns table\(id bigint,name text,employee_no integer,store_id bigint\)/i);
assert.match(migration,/returns table\(id bigint,name text,employee_no integer,working boolean/i);
assert.match(migration,/returns table\(id bigint,name text,employee_no integer,is_active boolean/i);
assert.match(migration,/jsonb_build_object\('ok',true,'employee_id',v_emp,'employee_no',v_employee_no/i);
assert.match(compactMigration,/where is_active/);
assert.match(compactMigration,/employees_store_active_employee_no_uidx/);
assert.match(compactMigration,/after insert or update of store_id,is_active/);
assert.match(compactMigration,/set employee_no=null/);
assert.ok(substitution.includes('e?.employee_no'));
assert.ok(attendance.includes('e?.employee_no'));
assert.ok(contracts.includes('e?.employee_no'));

console.log('store-scoped employee numbers v219 QA PASS');
