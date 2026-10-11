import assert from 'node:assert/strict';
import fs from 'node:fs';
// Read-only P0 gate: no production salary or closed-month rows are created.
const sql=fs.readFileSync('supabase/migrations/20261012063000_payroll_close_require_nonnull_amounts.sql','utf8');
const requiredNumbers=['employee_id','hours','wage','weeks','base_pay','juhyu_pay',
  'adjust','gross_pay','tax_rate','net_pay'];
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.server_payroll_close_verified\(/);
assert.equal((sql.match(/\$function\$;/g)||[]).length,1,'One valid PostgreSQL DDL statement');
const idxGuard=sql.indexOf('PAYROLL_ROW_NONNUMERIC_OR_NULL');
const idxDuplicate=sql.indexOf('DUPLICATE_PAYROLL_EMPLOYEE');
const idxInsert=sql.indexOf('INSERT INTO public.payroll_snapshot(');
assert.ok(idxGuard>0 && idxDuplicate>idxGuard && idxInsert>idxDuplicate,
  'Type / NULL validation must run before duplicates and any snapshot insert');
assert.match(sql,/jsonb_typeof\(j->'employee_name'\) IS DISTINCT FROM 'string'/);
for(const field of requiredNumbers){
  const expected="jsonb_typeof(j->'"+field+"') IS DISTINCT FROM 'number'";
  assert.ok(sql.includes(expected),'Reject absent/JSON null/string/non-numeric field: '+field);
}
assert.match(sql,/CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE/);
assert.match(sql,/PAYROLL_EMPLOYEE_STORE_MISMATCH/);
assert.match(sql,/PAYROLL_ALREADY_CLOSED/);
assert.match(sql,/NOT_AUTHORIZED/);
assert.match(sql,/SERVICE_ONLY/);
assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b|\bDELETE FROM\s+public\.payroll_snapshot\b/i);
// Equivalent semantics of IS DISTINCT FROM: a present JSON null is not "number".
const exemplar={employee_id:1,employee_name:'Synthetic monthly salary',
  hours:0,wage:0,weeks:0,base_pay:800000,juhyu_pay:0,adjust:0,
  gross_pay:800000,tax_rate:0.033,net_pay:773600};
const kind=value=>value===null?'null':Array.isArray(value)?'array':
  typeof value==='number'?'number':typeof value==='string'?'string':
  typeof value==='boolean'?'boolean':typeof value;
const rejects=rec=>kind(rec.employee_name)!=='string'||
  requiredNumbers.some(f=>kind(rec[f])!=='number');
assert.equal(rejects(exemplar),false,'Legitimate no-punch monthly salary stays allowed');
for(const key of requiredNumbers){
  for(const invalid of [null,String(exemplar[key]),true,{}]){
    assert.equal(rejects({...exemplar,[key]:invalid}),true,key+' invalid value rejected');
  }
  const missing={...exemplar};delete missing[key];
  assert.equal(rejects(missing),true,key+' missing rejected');
}
assert.equal(rejects({...exemplar,employee_name:null}),true,'NULL name rejected');
console.log('PASS P0 payroll close disallows JSON NULL and nonnumeric snapshot fields, preserves valid salary');
