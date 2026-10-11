import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261012054500_employee_creation_pin_null_guard.sql','utf8');
const names=['admin_create_employee_onboarding','admin_create_employee_onboarding_for_store'];
const found=[...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(x=>x[1]);
assert.deepEqual(found.sort(),[...names].sort(),'Only the two unguarded onboarding wrappers are changed');
assert.equal((sql.match(/\$function\$;/g)||[]).length,2,'Each CREATE FUNCTION must terminate');
for(const name of names){
  const at=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  const first=sql.indexOf('$function$',at),last=sql.indexOf('$function$',first+10);
  assert.ok(first>at&&last>first,name+' complete body');
  const body=sql.slice(first,last);
  assert.ok(body.includes("if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_REQUIRED'; end if;"),name+' rejects NULL and non-four-digit PIN');
  assert.ok(body.includes("if nullif(trim(p_name),'') is null then raise exception 'NAME_REQUIRED'; end if;"),name+' validates employee name');
  assert.match(body,/public\.admin_create_employee/,name+' delegates to protected creator');
}
assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b|\bDELETE FROM\b/i);
console.log('PASS both onboarding paths reject NULL PIN before calling protected creator');
