import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
process.env.TZ='UTC';
const html=fs.readFileSync('index.html','utf8');
const scripts=['payroll_live_accrual_v1.js','payroll_contract_authority_v1.js','payroll_night_allowance_v1.js'].map(p=>fs.readFileSync(p,'utf8'));
const e={id:998771,name:'QA synthetic',store_id:1,wage:12000,tax_rate:0,juhyu_hours:0,is_active:true};
const contract={id:71,contract_id:71,employee_id:e.id,effective_from:'2026-01-01',effective_to:null,
 payroll_type:'HOURLY',hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:0,
 tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false};
const bundle={contracts:[contract],periods:[],workdays:[]};
const mk=(id,type,date)=>({id,employee_id:e.id,event_type:type,event_at:date});
const system=(id,at)=>({id,event_id:null,employee_id:e.id,action:'ADD',new_event_type:'OUT',
 new_event_at:at,reason:'SYSTEM_STORE_CLOSE',created_by:'system:auto-close',created_at:'2026-10-13T03:00:00Z'});
const scenarios=[
 ['unverified', [mk(1,'IN','2026-10-12T09:00:00')],[system(2,'2026-10-13T02:00:00')],0,1],
 ['genuine', [mk(1,'IN','2026-10-12T09:00:00'),mk(3,'OUT','2026-10-12T17:00:00')],[system(2,'2026-10-13T02:00:00')],8,0],
 ['overnight', [mk(1,'IN','2026-10-12T19:00:00'),mk(3,'OUT','2026-10-13T01:00:00')],[],6,0]
];
function take(signature){
 const start=html.indexOf(signature),end=html.indexOf('\n}\n',start);
 assert.ok(start>=0&&end>start,signature+' not found in browser');
 return html.slice(start,end+2);
}
function be(events,corrections){
 return {
  allEmployees:async()=>[e],eventsWithCorrections:async()=>({events,corrections}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[contract],payrollContractWorkdays:async()=>[],
  payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
  payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>bundle
 };
}
async function browser(events,corrections){
 const ctxObject={BE:be(events,corrections),LIVE:true,CURRENT_STORE_ID:1,
 CONFIG:{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic'},
 Auth:{token:'synthetic'},document:{getElementById:()=>null,addEventListener:()=>{}},
 localStorage:{getItem:()=>JSON.stringify({access_token:'synthetic'})},
 setInterval:()=>0,console,
 fetch:async()=>({ok:true,status:200,text:async()=>JSON.stringify(bundle)})};
 ctxObject.window=ctxObject;
 const ctx=vm.createContext(ctxObject);
 vm.runInContext(`
const kstNow=()=>new Date(2026,10,2,20,0,0);
const won=n=>(n||0).toLocaleString('ko-KR')+'원';
const secToHours=sec=>sec/3600;
const xround=(x,n)=>Math.round(x/Math.pow(10,-n))*Math.pow(10,-n);
const xrounddown=(x,n)=>Math.floor(x/Math.pow(10,-n))*Math.pow(10,-n);
const weeksInMonth=()=>4;
async function drawPay(){}
function openMonthAdjust(){}
function fmtHM(){}
`,ctx);
 for(const signature of [
  'function fromIso(','function idOrder(','function pairEvents(','function applyCorrections(',
  'function calcPayroll(','function isHiddenInhaTestEmployee(','async function computeMonthPayroll(ym)'
 ])vm.runInContext(take(signature),ctx);
 ctx.__payrollElapsedWeeksV1={completedWeeksInMonth:()=>4};
 for(const sc of scripts)vm.runInContext(sc,ctx);
 return vm.runInContext("computeMonthPayroll('2026-10')",ctx);
}
for(const [name,events,corrections,expectedHours,expectedIssues] of scenarios){
 const b=(await browser(events,corrections)).rows[0];
 const s=(await createPayrollEngine({BE:be(events,corrections),storeId:1,
   now:new Date('2026-11-02T10:00:00Z')}).computeMonthPayroll('2026-10')).rows[0];
 assert.equal(b.hours,expectedHours,name+' browser payable hours');
 assert.equal(s.hours,expectedHours,name+' server payable hours');
 assert.equal(b.issues,expectedIssues,name+' browser requires review');
 assert.equal(s.issues,expectedIssues,name+' server requires review');
 assert.equal(b.pay.gross,s.pay.gross,name+' gross salary browser/server mismatch');
 assert.equal(b.pay.base,s.pay.base,name+' base salary browser/server mismatch');
 console.log('PASS auto-close browser/server',name,'hours='+expectedHours,'gross='+b.pay.gross);
}
console.log('PAYROLL_AUTOCLOSE_BROWSER_SERVER_PARITY_PASS 3');
