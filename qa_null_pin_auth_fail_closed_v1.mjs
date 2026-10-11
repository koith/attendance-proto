import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regression for SQL three-valued NULL logic: normal <> comparison does NOT
// reject NULL PINs in a PL/pgSQL IF branch. IS DISTINCT FROM always does.
// Pure source check: never calls real PIN RPCs or writes a production timecard.
const migration=fs.readFileSync('supabase/migrations/20261012044000_null_pin_auth_fail_closed.sql','utf8');
const targets=["my_events","punch","request_correction","staff_actual_attendance","substitution_candidate_availability","substitution_clock_in","substitution_request_cancel","substitution_request_create","substitution_request_list","substitution_request_respond"];
const found=Array.from(migration.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g),m=>m[1]);
assert.deepEqual(found.sort(),[...targets].sort(),'Replace all 10 vulnerable staff RPCs');
assert.equal((migration.match(/\$function\$;/g)||[]).length,targets.length,'Every function must terminate correctly');
for(const name of targets){
 const begin=migration.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
 const bodyStart=migration.indexOf('$function$',begin);
 const bodyEnd=migration.indexOf('$function$',bodyStart+10);
 assert.ok(begin>=0 && bodyStart>begin && bodyEnd>bodyStart,name+' complete');
 const body=migration.slice(bodyStart,bodyEnd);
 assert.ok(body.includes('crypt(p_pin,') && body.includes(' IS DISTINCT FROM '),name+' NULL-safe PIN check');
 assert.ok(!/crypt\(p_pin,\s*(?:v_hash|h)\)\s*<>\s*(?:v_hash|h)/.test(body),name+' must never use NULL-unsafe comparison');
 assert.ok(migration.slice(begin,bodyStart).includes('SECURITY DEFINER'),name+' preserve security definer');
}
assert.doesNotMatch(migration,/\bTRUNCATE\b|\bDROP TABLE\b|\bDELETE FROM\b|\bUPDATE\s+public\.employees\b/i,'No user data mutations');
console.log('PASS ten staff PIN RPCs reject NULL by IS DISTINCT FROM, SQL statements are complete');
