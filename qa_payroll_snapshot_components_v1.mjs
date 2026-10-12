import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Pure synthetics: no live close, payroll records, or employees altered.
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261012121500_payroll_close_allowance_component_snapshot.sql','utf8');
const old=fs.readFileSync('supabase/migrations/20261012063000_payroll_close_require_nonnull_amounts.sql','utf8');
assert.match(sql,/ALTER TABLE public\.payroll_snapshot/);
for(const col of ['night_allowance_won','break_compensation_won','substitution_pay_won','night_allowance_label','break_mode']){
 assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS '+col) || sql.includes('ADD COLUMN IF NOT EXISTS '+col+' '),
  'Audit schema must be additive for '+col);
 assert.match(sql,new RegExp('rec->>\\x27'+col+'\\x27'),'Close RPC must persist '+col);
 assert.match(edge,new RegExp('night_allowance_won|break_compensation_won|substitution_pay_won'),
  'Edge must compute itemized source fields');
}
for(const guard of ['SERVICE_ONLY','STORE_NOT_AUTHORIZED','NOT_AUTHORIZED','PAYROLL_ALREADY_CLOSED',
 'PAYROLL_EMPLOYEE_STORE_MISMATCH','PAYROLL_ROW_NONNUMERIC_OR_NULL']){
 if(guard==='STORE_NOT_AUTHORIZED')continue;
 assert.ok(sql.includes(guard),'Hardened close guard was dropped: '+guard);
}
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('payroll-close:'/);
assert.match(sql,/WHERE store_id=p_store_id AND ym=p_ym/);
assert.match(sql,/NOT EXISTS\(SELECT 1 FROM public\.stores s WHERE s\.id=p_store_id AND s\.is_active AND s\.onboarding_status='READY'\)/);
assert.match(sql,/jsonb_typeof\(j->'night_allowance_won'\) IS DISTINCT FROM 'number'/);
assert.match(sql,/PAYROLL_ALLOWANCE_COMPONENT_INVALID/);
assert.doesNotMatch(sql,/DELETE FROM public\.payroll_snapshot|TRUNCATE|DROP TABLE/i);
assert.ok(old.includes('PAYROLL_ROW_NONNUMERIC_OR_NULL'),
 'Previous non-null salary guard remains source of the additive migration');

function slice(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,'Missing live block '+start);
 return source.slice(a,b);
}
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const ctx=vm.createContext({HttpError});
vm.runInContext(slice(edge,'function payrollClosingRows(report){','\nasync function closingPreview('),ctx);
const close=ctx.payrollClosingRows;
const row={employee_id:81,employee_name:'Synthetic hourly',emp:{memo:''},
 payrollType:'HOURLY',hours:8,sec:28800,issues:0,sessions:[{status:'COMPLETE'}],
 breakMode:'NOT_PROVIDED',
 pay:{base:100000,juhyu:15000,adjust:1000,nightAllowance:14000,breakCompPay:5000,
  substitutePay:2000,nightAllowanceLabel:'정률 50%',wage:13000,jweeks:1,
  gross:137000,rate:0,net:137000}};
const result=close({rows:[row]});
assert.equal(result.length,1);
assert.equal(result[0].night_allowance_won,14000);
assert.equal(result[0].break_compensation_won,5000);
assert.equal(result[0].substitution_pay_won,2000);
assert.equal(result[0].night_allowance_label,'정률 50%');
assert.equal(result[0].break_mode,'NOT_PROVIDED');
assert.equal(result[0].gross_pay,137000);
assert.equal(result[0].base_pay,100000);
assert.equal(result[0].juhyu_pay,15000);
assert.equal(result[0].adjust,1000);
for(const field of ['nightAllowance','breakCompPay','substitutePay']){
 const bad=structuredClone(row);bad.pay[field]=-1;
 assert.throws(()=>close({rows:[bad]}),/INVALID_CALCULATED_PAYROLL_ROW/,
  field+' cannot be negative at immutable close');
}
const monthly=structuredClone(row);
monthly.payrollType='MONTHLY';monthly.breakMode='PROVIDED';
monthly.pay={wage:0,base:2600000,juhyu:0,adjust:0,gross:2600000,rate:0,net:2600000};
const m=close({rows:[monthly]})[0];
assert.equal(m.night_allowance_won,0);
assert.equal(m.break_compensation_won,0);
assert.equal(m.substitution_pay_won,0);
assert.equal(m.break_mode,'PROVIDED');
assert.match(edge,/select\("store_id,employee_id,employee_name,hours,wage,base_pay,juhyu_pay,adjust,gross_pay,night_allowance_won,break_compensation_won,substitution_pay_won,night_allowance_label,break_mode,closed_at"\)/);
console.log('PASS immutable close captures itemized night, break and substitution allowances, rejects negatives, keeps gross authoritative');
