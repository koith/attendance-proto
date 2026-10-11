import assert from 'node:assert/strict';
import fs from 'node:fs';

// Static contract against the SQL migration; never submits production PINs or timecards.
const sql=fs.readFileSync('supabase/migrations/20261012033000_pin_rpc_store_scope_guard.sql','utf8');
function body(name){
  const key='CREATE OR REPLACE FUNCTION public.'+name+'(';
  const start=sql.indexOf(key);
  assert.ok(start>=0,'Missing updated RPC: '+name);
  const begin=sql.indexOf('$function$',start);
  const end=sql.indexOf('$function$',begin+10);
  assert.ok(begin>start && end>begin,'Missing function body: '+name);
  return sql.slice(begin,end);
}
assert.equal((sql.match(/\\$function\\$;/g)||[]).length,6, 'All six Postgres CREATE FUNCTION statements require terminators');
const names=['punch','my_events','request_correction','substitution_request_create',
  'substitution_request_respond','substitution_clock_in'];
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length,names.length);
const punch=body('punch');
assert.match(punch,/crypt\(p_pin,v_hash\)<>v_hash/,'Correct PIN still required');
assert.match(punch,/id=p_substitute_for_employee_id and is_active=true and store_id=v_store_id/);
assert.match(punch,/STORE_NOT_READY/,'Inactive or staged store cannot punch');
const my=body('my_events');
assert.match(my,/crypt\(p_pin, v_hash\) <> v_hash/);
assert.match(my,/e\.id=p_employee_id and s\.is_active and s\.onboarding_status='READY'/);
const correction=body('request_correction');
assert.match(correction,/e\.id=p_employee_id and s\.is_active and s\.onboarding_status='READY'/);
assert.match(correction,/ev\.id=p_event_id and ev\.employee_id=p_employee_id/);
assert.match(correction,/EVENT_EMPLOYEE_MISMATCH/);
const request=body('substitution_request_create');
assert.match(request,/e\.id=p_requester and s\.is_active and s\.onboarding_status='READY'/);
assert.match(request,/public\.employees sub join public\.employees req on req\.store_id=sub\.store_id/);
for(const name of ['substitution_request_respond','substitution_clock_in']){
  const fn=body(name);
  assert.match(fn,/req\.id=r\.requester_employee_id/);
  assert.match(fn,/st\.is_active and st\.onboarding_status='READY'/);
  assert.match(fn,/STORE_NOT_READY_OR_MISMATCH/);
}
assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\.employees/i,
  'Do not change stored employee or payroll data');
console.log('PASS PIN RPC scoped to ready store, event ownership and same-store substitution');
