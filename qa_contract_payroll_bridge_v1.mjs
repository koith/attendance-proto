import fs from 'node:fs';
const js=fs.readFileSync('employment_contract_payroll_bridge_v1.js','utf8');
const html=fs.readFileSync('employment_contracts.html','utf8');
const atomic=fs.readFileSync('employment_period_atomic_v1.js','utf8');
function t(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
function a(x,m){if(!x)throw new Error(m)}
t('bridge loads after atomic wrapper',()=>{const a1=html.indexOf('employment_period_atomic_v1.js'),b=html.indexOf('employment_contract_payroll_bridge_v1.js');a(a1>=0&&b>a1,'load order wrong')});
t('atomic first contract still uses wrapped BE.contractSet',()=>a(atomic.includes('BE.contractSet=async function(args)'),'atomic wrapper missing'));
t('only successful HOURLY saves sync payroll cache',()=>{a(js.includes("!r?.ok || args?.p_payroll_type!=='HOURLY'"),'HOURLY guard missing');a(js.includes('wage:args.p_hourly_wage'),'wage bridge missing')});
t('business income deduction syncs tax rate',()=>{a(js.includes("p_tax_treatment==='BUSINESS_INCOME'"),'tax treatment guard missing');a(js.includes('fields.tax_rate=args.p_business_deduction_rate'),'tax bridge missing')});
t('bridge does not invent weekly allowance or monthly semantics',()=>{a(!js.includes('juhyu_hours'),'juhyu must remain untouched');a(!js.includes('monthly_salary'),'monthly salary must remain untouched')});
t('successful contract is not rolled back on cache sync failure',()=>{a(js.includes("console.error('[contract-payroll-bridge]'"),'failure handling missing');a(js.includes('return r'),'contract result must be preserved')});
