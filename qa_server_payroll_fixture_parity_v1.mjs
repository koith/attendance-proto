import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
process.env.TZ='UTC';
const html=fs.readFileSync('index.html','utf8');
const scripts=['payroll_live_accrual_v1.js','payroll_contract_authority_v1.js','payroll_night_allowance_v1.js'].map(x=>fs.readFileSync(x,'utf8'));
const fixed=new Date('2026-10-09T11:00:00Z'); // Friday 20:00 Seoul
function take(signature){
 const i=html.indexOf(signature);assert.ok(i>=0,signature);
 const j=html.indexOf('\n}\n',i);assert.ok(j>i,signature);
 return html.slice(i,j+2);
}
const employees=[
 {id:1,name:'hourly',wage:12000,juhyu_hours:0,tax_rate:.033,is_active:true,store_id:1},
 {id:2,name:'monthly',wage:0,juhyu_hours:0,tax_rate:0,is_active:true,store_id:1},
 {id:3,name:'legacy',wage:10000,juhyu_hours:0,tax_rate:.033,is_active:true,store_id:1}
];
const contracts=[
 {id:10,employee_id:1,effective_from:'2026-01-01',effective_to:null,payroll_type:'HOURLY',hourly_wage:12000,weekly_contracted_minutes:900,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:.033,break_provision_mode:'NOT_PROVIDED',night_allowance_enabled:true,night_allowance_mode:'RATE',night_allowance_value:50,night_allowance_start:'22:00',night_allowance_end:'06:00'},
 {id:20,employee_id:2,effective_from:'2026-01-01',effective_to:null,payroll_type:'MONTHLY',monthly_salary:2600000,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:.033,break_provision_mode:'IGNORED',night_allowance_enabled:false},
 {id:30,employee_id:3,effective_from:'2026-01-01',effective_to:null,payroll_type:'HOURLY',hourly_wage:10000,weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:.033,break_provision_mode:'PROVIDED',night_allowance_enabled:false}
];
const workdays=[{employee_id:1,weekly_contracted_minutes:900,weekday:1,contracted_minutes:480}];
const events=[
 {id:1,employee_id:1,event_type:'IN',event_at:'2026-09-14T09:00:00'},
 {id:2,employee_id:1,event_type:'OUT',event_at:'2026-09-14T18:00:00'},
 {id:3,employee_id:1,event_type:'IN',event_at:'2026-09-15T22:00:00'},
 {id:4,employee_id:1,event_type:'OUT',event_at:'2026-09-16T02:00:00'},
 {id:5,employee_id:2,event_type:'IN',event_at:'2026-09-16T09:00:00'},
 {id:6,employee_id:2,event_type:'OUT',event_at:'2026-09-16T18:00:00'},
 {id:7,employee_id:3,event_type:'IN',event_at:'2026-09-17T08:00:00'},
 {id:8,employee_id:3,event_type:'OUT',event_at:'2026-09-17T17:30:00'}
];
const corrections=[{id:1,event_id:2,employee_id:1,action:'EDIT_TIME',new_event_at:'2026-09-14T19:00:00',reason:'CORRECTED',created_at:'2026-09-20T10:00:00Z'}];
const overrides=[{employee_id:1,adjust_amount:1000,tax_rate_override:.033}];
const substitutions=[{id:1,requester_employee_id:1,substitute_employee_id:3,actual_minutes:60}];
const bundles={};
for(const c of contracts)bundles[c.employee_id]={contracts:[c],periods:[],workdays:[]};
function buildBE(){
 return {
  allEmployees:async()=>structuredClone(employees),
  eventsWithCorrections:async()=>({events:structuredClone(events),corrections:structuredClone(corrections)}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:structuredClone(overrides)}),
  payrollContracts:async()=>structuredClone(contracts),
  payrollContractWorkdays:async()=>structuredClone(workdays),
  payrollSubstitutions:async()=>structuredClone(substitutions),
  employmentBundle:async(id)=>structuredClone(bundles[id])
 };
}
function normalize(R){
 return JSON.parse(JSON.stringify({totalGross:R.totalGross,totalNet:R.totalNet,rows:R.rows.map(r=>({
  id:r.employee_id,sec:r.sec,hours:r.hours,nightMinutes:r.nightMinutes,
  breakMode:r.breakMode,breakBonusMinutes:r.breakBonusMinutes,breakDeductSeconds:r.breakDeductSeconds,
  substitutionPay:r.substitutePay,contractMode:r.contractMode,
  pay:r.pay&&{base:r.pay.base,juhyu:r.pay.juhyu,adjust:r.pay.adjust,breakCompPay:r.pay.breakCompPay,
    gross:r.pay.gross,net:r.pay.net,nightAllowance:r.pay.nightAllowance,night:r.pay.night,
    nightHours:r.pay.nightHours,rate:r.pay.rate,wage:r.pay.wage}
 }))}));
}
const browserCtx={
 BE:buildBE(),LIVE:true,CURRENT_STORE_ID:1,
 CONFIG:{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test'},Auth:{token:'test'},
 document:{getElementById:()=>null,addEventListener:()=>{}},
 localStorage:{getItem:()=>JSON.stringify({access_token:'test'})},
 setInterval:()=>0,console,
 fetch:async(_url,options)=>{
  const id=JSON.parse(options.body).p_employee_id;
  return {ok:true,status:200,text:async()=>JSON.stringify(bundles[id])};
 }
};
browserCtx.window=browserCtx;
const ctx=vm.createContext(browserCtx);
vm.runInContext(`
const kstNow=()=>new Date(2026,9,9,20,0,0);
const won=n=>(n||0).toLocaleString('ko-KR')+'원';
const secToHours=sec=>sec/3600;
const xround=(x,n)=>Math.round(x/Math.pow(10,-n))*Math.pow(10,-n);
const xrounddown=(x,n)=>Math.floor(x/Math.pow(10,-n))*Math.pow(10,-n);
const weeksInMonth=ym=>ym<'2026-10'?4:0;
async function drawPay(){}
function openMonthAdjust(){}
function fmtHM(){}
`,ctx);
for(const key of ['function fromIso(','function idOrder(','function pairEvents(','function applyCorrections(','function calcPayroll(','function isHiddenInhaTestEmployee(','async function computeMonthPayroll(ym)']){
 vm.runInContext(take(key),ctx);
}
ctx.__payrollElapsedWeeksV1={completedWeeksInMonth:()=>4};
for(const script of scripts)vm.runInContext(script,ctx);
const browserResult=await vm.runInContext("computeMonthPayroll('2026-09')",ctx);
const server=createPayrollEngine({BE:buildBE(),storeId:1,storeName:'인하대학교점',now:fixed});
const serverResult=await server.computeMonthPayroll('2026-09');
const a=normalize(browserResult),b=normalize(serverResult);
assert.deepEqual(b,a,'real browser payroll wrappers and server result mismatch');
assert.equal(a.rows.length,3,'fixture row count');
assert.ok(a.rows.find(r=>r.id===1).pay.night>0,'night allowance fixture');
assert.ok(a.rows.find(r=>r.id===1).pay.breakCompPay>0,'break allowance fixture');
assert.ok(a.rows.find(r=>r.id===3).breakDeductSeconds>0,'provided break fixture');
assert.ok(a.rows.find(r=>r.id===2).pay.gross>0,'monthly salary fixture');
console.log('PASS browser/server three-employee monthly payroll parity including corrections, hourly/monthly, night, 3-way break, adjustments and substitutes');
