import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261012045500_create_employee_pin_required.sql','utf8');
const names=['admin_create_employee','admin_create_employee_for_store'];
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length,2);
assert.equal((sql.match(/\$function\$;/g)||[]).length,2,'Postgres statements must terminate');
for(const name of names){
 const at=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
 assert.ok(at>=0,name);
 const end=sql.indexOf('$function$;',at);
 const body=sql.slice(at,end);
 assert.ok(body.includes("p_pin is null or p_pin !~ '^[0-9]{4}$'"),name+' requires non-NULL four numeric digits');
 assert.match(body,/PIN_REQUIRED/,name+' denies invalid PIN');
 assert.match(body,/SECURITY DEFINER/,name+' retains server privilege context');
 assert.match(body,/NOT_AUTHORIZED/,name+' retains management authorization');
}
assert.ok(sql.includes("NAME_REQUIRED"));
assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b|\bDELETE FROM\b|\bUPDATE\s+public\.employees/i);
console.log('PASS employee creation rejects NULL/non-four-digit PIN and preserves management scope');
