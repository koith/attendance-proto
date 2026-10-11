import assert from 'node:assert/strict';
import fs from 'node:fs';

// Read-only regression: inspect exact production migration SQL, no real PINs
// or attendance events are created or changed.
const sql=fs.readFileSync('supabase/migrations/20261012051000_substitution_candidate_store_isolation.sql','utf8');
const names=['substitution_candidate_availability','substitution_request_list','substitution_request_cancel'];
assert.deepEqual([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m=>m[1]).sort(),[...names].sort());
assert.equal((sql.match(/\$function\$;/g)||[]).length,3,'All three SQL functions must terminate with semicolon');
function body(name){
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(start>=0);
  const first=sql.indexOf('$function$',start),last=sql.indexOf('$function$',first+10);
  assert.ok(first>start && last>first);
  return sql.slice(first,last);
}
const candidates=body('substitution_candidate_availability');
assert.match(candidates,/crypt\(p_pin,h\) IS DISTINCT FROM h/);
assert.match(candidates,/req\.id=p_requester and st\.is_active and st\.onboarding_status='READY'/);
assert.match(candidates,/e\.store_id=\(select req\.store_id from public\.employees req where req\.id=p_requester\)/);
assert.doesNotMatch(candidates,/from employees e where e\.is_active=true and e\.id<>p_requester;/);
const list=body('substitution_request_list');
assert.match(list,/e\.id=p_employee and st\.is_active and st\.onboarding_status='READY'/);
assert.match(list,/p_employee in\(r\.requester_employee_id,r\.substitute_employee_id\) and a\.store_id=b\.store_id/);
const cancel=body('substitution_request_cancel');
assert.match(cancel,/e\.id=p_employee and st\.is_active and st\.onboarding_status='READY'/);
for(const name of names)assert.match(body(name),/crypt\(p_pin,h\) IS DISTINCT FROM h/,name+' retains NULL-safe PIN');
assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b|\bDELETE FROM\b|\bUPDATE\s+public\.employees\b/i);
console.log('PASS substitution candidate store scope and STAGED/INACTIVE staff request guards');
