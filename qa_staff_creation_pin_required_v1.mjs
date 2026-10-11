import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261012054500_employee_creation_pin_null_guard.sql','utf8');
const names=['admin_create_employee','admin_create_employee_for_store',
  'admin_create_employee_onboarding','admin_create_employee_onboarding_for_store'];
const found=[...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(x=>x[1]);
assert.deepEqual(found.sort(),[...names].sort(),'All four creator RPCs must reject NULL PINs');
assert.equal((sql.match(/\$function\$;/g)||[]).length,4,'Each DDL statement needs terminator');
for(const name of names){
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  const first=sql.indexOf('$function$',start);
  const last=sql.indexOf('$function$',first+10);
  assert.ok(first>start&&last>first,name+' complete body');
  const code=sql.slice(first,last);
  assert.match(code,/if p_pin is null or p_pin !~ '\^\\d\{4\}\$' then raise exception 'PIN_REQUIRED'/,
    name+' must reject null and non-four-digit PIN');
  assert.match(code,/if nullif\(trim\(p_name\),''\) is null then raise exception 'NAME_REQUIRED'/,
    name+' must reject blank employee names');
}
assert.doesNotMatch(sql,/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b/);
console.log('PASS null/malformed PIN and blank name rejected in all staff creation RPCs');
