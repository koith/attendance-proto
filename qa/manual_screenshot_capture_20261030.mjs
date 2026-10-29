// Read-only screenshot capture from the repository's actual index.html and CSS.
// All backend traffic is blocked; test values are only in browser memory.
// No production login, RPC, inserts, or writes.
import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

fs.mkdirSync('qa-results/manual-capture',{recursive:true});
const root='http://127.0.0.1:4173/index.html';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let page;
try {
 const ctx=await browser.newContext({viewport:{width:430,height:930},deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul'});
 page=await ctx.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e.message||e)));
 await page.route('**/*', route=>{
   const url=route.request().url();
   if(!url.startsWith('http://127.0.0.1:4173/')) return route.abort();
   return route.continue();
 });
 await page.goto(root+'?mode=store&store=1#pos',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#employeeOnboarding').waitFor({timeout:20000});
 await page.evaluate(()=>{
  window.eval('EMP_ONBOARD=newEmployeeOnboardingState()');
  window.eval('EMP_ONBOARD.name="김민지";EMP_ONBOARD.pin="1234";EMP_ONBOARD.startedOn="2026-10-30";EMP_ONBOARD.payrollType="HOURLY";EMP_ONBOARD.amount="12500";EMP_ONBOARD.taxTreatment="BUSINESS_INCOME";EMP_ONBOARD.rate="3.3";EMP_ONBOARD.weekdays=new Set([1,3,5]);EMP_ONBOARD.start="09:00";EMP_ONBOARD.end="17:00";');
  document.getElementById('addVeil').classList.add('show');
 });
 for(const step of [1,2,3,4]){
  await page.evaluate(n=>window.eval('EMP_ONBOARD.step='+n+';renderEmployeeOnboardingStep()'),step);
  await page.locator('#employeeOnboarding h3').waitFor({timeout:5000});
  await page.waitForTimeout(250);
  await page.locator('#addVeil .modal').screenshot({path:'qa-results/manual-capture/employee-'+step+'.png',animations:'disabled',timeout:12000});
  console.log('CAPTURE employee step',step,await page.locator('#employeeOnboarding h3').innerText());
 }
 await page.evaluate(()=>{
  document.getElementById('addVeil').classList.remove('show');
  const sample={
    active:[{id:991,name:'김민지'}],weeks:4,overrides:{},totalGross:100000,totalNet:96700,
    rows:[{
      employee_id:991,employee_name:'김민지',emp:{id:991,name:'김민지',employee_no:1},
      sec:28800,hours:8,issues:0,ov:0,hasWage:true,payrollType:'HOURLY',
      contract:{},sessions:[],substituteMinutes:0,nightMinutes:0,breakEligibleCount:0,
      breakConfirmedCount:0,breakNotProvidedCount:0,breakCompensateCount:0,memo:'',
      pay:{payrollType:'HOURLY',wage:12500,base:100000,weekly:0,juhyu:0,adjust:0,
        gross:100000,net:96700,rate:3.3,jweeks:0,breakCompPay:0,weeklyReviewComments:[]}
    }]
  };
  window.computeMonthPayroll=async()=>sample;
  window.eval('BE.snapshot=async()=>null;BE.payrollPeriod=async()=>({store_ready:false});');
  window.eval('Auth.token="QA-SCREENSHOT-ONLY";');
  window.eval('renderPay()');
 });
 await page.locator('.payroll-employee-card').first().waitFor({timeout:12000});
 await page.waitForTimeout(200);
 await page.screenshot({path:'qa-results/manual-capture/payroll-list.png',fullPage:true,animations:'disabled'});
 await page.locator('.payroll-pay-detail').first().click();
 await page.locator('.payroll-detail-popover:not([hidden])').waitFor({timeout:5000});
 await page.screenshot({path:'qa-results/manual-capture/payroll-detail.png',fullPage:true,animations:'disabled'});
 const metadata={
  generated_at:new Date().toISOString(),source:'actual GitHub repository index.html, browser-rendered',
  data:'Synthetic in-memory UI data; no operational records',backend_requests:'blocked',
  version:await page.locator('#appVersion').innerText().catch(()=>null),errors:errors.slice(0,30),
  screenshots:fs.readdirSync('qa-results/manual-capture').filter(x=>x.endsWith('.png'))
 };
 fs.writeFileSync('qa-results/manual-capture/PROVENANCE.json',JSON.stringify(metadata,null,2));
 assert.equal(metadata.screenshots.length,6);
 console.log('SCREENSHOT_CAPTURE_SUCCESS',metadata.screenshots,metadata.version);
 await ctx.close();
}finally { await browser.close(); }
