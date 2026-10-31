import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const gas=fs.readFileSync("gas/monthly-owner-report/Code.gs","utf8");
const edge=fs.readFileSync("supabase/functions/monthly-owner-report/index.ts","utf8");
const manifest=JSON.parse(fs.readFileSync("gas/monthly-owner-report/appsscript.json","utf8"));
const props=new Map(),sent=[];
const owner1={user_id:"11111111-1111-4111-8111-111111111111",email:"current@gmail.com"};
const owner2={user_id:"22222222-2222-4222-8222-222222222222",email:"new@gmail.com"};
let currentOwner=owner1,reportOwner=owner1,forcedResponse=null,mailFail=false,sheetRows,simulateClosed=false;
const blob=(name)=>({
 name,getBytes:()=>Array(80).fill(48),
 setName(x){this.name=x;return this;},
 setContentType(){return this;}
});
const fixtureBook={
  getName:()=> "2026 근태",
  getSheetByName:()=>({getDataRange:()=>({getDisplayValues:()=>sheetRows})})
};
const preview={
 ok:true,store_id:1,store_name:"인하대학교점",ym:"2026-10",
 mode:"PREVIEW",status:"OPEN",owner:owner1,
 source_fingerprint:"a".repeat(64),as_of:"2026-10-31T14:45:00.000Z",
 count:2,totals:{gross:100000,net:96700},review_count:1,
 rows:[
  {employee_id:991,employee_name:"김민지",hours:8,complete_pay:true,
   wage:12500,base_pay:100000,juhyu_pay:0,night_allowance_won:0,
   break_compensation_won:0,substitution_pay_won:0,adjust:0,
   gross_pay:100000,net_pay:96700,review_flags:[]},
  {employee_id:992,employee_name:"박연수",hours:0,complete_pay:false,
   review_flags:["근무기록 확인 필요","급여 계산 확인 필요"]}
 ]
};
const finalReport={
 ...preview,mode:"FINAL",status:"CLOSED",count:1,review_count:0,totals:{gross:100000,net:96700},
 rows:[{...preview.rows[0],store_id:1,ym:"2026-10",complete_pay:undefined,review_flags:undefined}]
};
function makeRows(kind){
 const header=kind==="FINAL"?"확정 세전급여":"예상 세전급여";
 return [
 ["2026년 10월 근태 · 급여 보고서"],
 ["마지막 동기화: 2026-11-01 | 상태: "+(kind==="FINAL"?"마감완료":"예상 · 미마감")],
 [],
 ["급여 집계","세전 합계 100,000원"],
 ["직원명",header],
 ["김민지","100,000원"],
 [],
 ["근태 현황"],["날짜"]
 ];
}
sheetRows=makeRows("PREVIEW");
const context={
 Date,Math,JSON,Number,String,Array,Object,RegExp,isFinite,console,
 Utilities:{formatDate:(date,tz,format)=>{
  assert.equal(tz,"Asia/Seoul");
  const value=new Date(date.getTime()+9*3600000).toISOString();
  return format.includes("HH")?value.slice(0,16).replace("T"," "):value.slice(0,10);
 }},
 PropertiesService:{getScriptProperties:()=>({
  getProperty:(key)=>props.get(key)||null,
  setProperty:(key,value)=>props.set(key,value)
 })},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 ScriptApp:{
  getOAuthToken:()=> "mock-token",
  getProjectTriggers:()=>[],
  newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create:()=>{throw Error("NO_REAL_TRIGGER");}})})})
 },
 UrlFetchApp:{fetch:(url,o)=>{
  assert.equal(url,"https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/monthly-owner-report");
  assert.ok(o.headers["x-monthly-report-token"].length>=64);
  const request=JSON.parse(o.payload);
  const result=forcedResponse||(
    request.mode==="owner_check"?
      {code:200,data:{ok:true,store_id:request.store_id,ym:request.ym,
        store_name:"인하대학교점",owner:currentOwner}}:
    request.mode==="final"?
      (simulateClosed?{code:200,data:{...finalReport,owner:reportOwner}}:
        {code:409,data:{ok:false,error:"PAYROLL_NOT_CLOSED"}}):
      (simulateClosed?{code:409,data:{ok:false,error:"ALREADY_CLOSED"}}:
        {code:200,data:{...preview,owner:reportOwner}})
  );
  return {getResponseCode:()=>result.code,getContentText:()=>JSON.stringify(result.data)};
 }},
 SpreadsheetApp:{openById:(id)=>{assert.equal(id,"x".repeat(32));return fixtureBook;}},
 DriveApp:{getFileById:()=>({getAs:()=>blob("document"),setTrashed:()=>{}})},
 DocumentApp:{
  ParagraphHeading:{HEADING1:"H1"},
  create:()=>({
   getId:()=> "temp",
   getBody:()=>({
    appendParagraph:(s)=>({setHeading:()=>{}}),
    appendTable:(rows)=>({getRow:()=>({getCell:()=>({editAsText:()=>({setBold:()=>{}})})})})
   }),
   saveAndClose:()=>{}
  })
 },
 MimeType:{PDF:"application/pdf"},
 MailApp:{
  getRemainingDailyQuota:()=>10,
  sendEmail: (p)=>{if(mailFail)throw Error("uncertain mail");sent.push(p);}
 }
};
vm.createContext(context);
vm.runInContext(gas,context,{filename:"Code.gs"});
const run=(s)=>vm.runInContext(s,context);
props.set("MONTHLY_OWNER_ENABLED","true");
props.set("MONTHLY_OWNER_REPORT_TOKEN","Z".repeat(64));
props.set("MONTHLY_OWNER_START_YM","2026-10");
props.set("MONTHLY_OWNER_WORKBOOKS_JSON",JSON.stringify({1:{bookId:"x".repeat(32)}}));

assert.deepEqual(Array.from(run('_monthlyCandidates_(new Date("2026-10-31T14:45:00Z"))').map(x=>x.kind)),["PREVIEW","FINAL","PREVIEW"]);
assert.deepEqual(Array.from(run('_monthlyCandidates_(new Date("2026-10-30T14:45:00Z"))').map(x=>x.kind)),["FINAL","PREVIEW"]);
assert.deepEqual(Array.from(run('_monthlyCandidates_(new Date("2026-10-31T13:45:00Z"))').map(x=>x.kind)),["FINAL","PREVIEW"]);
assert.deepEqual(Array.from(run('_monthlyCandidates_(new Date("2027-01-31T14:45:00Z"))').map(x=>x.ym)),["2027-01","2026-12","2026-12"]);
assert.equal(run('_monthlyNumericCell_("12,345원")'),12345);
assert.throws(()=>run('_monthlyNumericCell_("0원짜리")'),/SHEET_GROSS_INVALID/);
assert.throws(()=>run('_monthlyConfig_(1,{enabled:true,bookId:"wrong"})'),/BOOK_NOT_CONFIGURED/);
const cfg=run('_monthlyConfig_(1,_monthlyBooks_()["1"])');
assert.equal(cfg.gmail,undefined,"do not store owner emails");
assert.equal(run('_monthlyFetchReport_(_monthlyConfig_(1,_monthlyBooks_()["1"]),"2026-10","PREVIEW").status'),"OPEN");
assert.equal(run('_monthlySendOne_(1,"2026-10","PREVIEW",_monthlyBooks_()["1"],true).status'),"PREVIEW_OK");
assert.equal(sent.length,0,"preview-only must never send");
const badName="new@gmail.com";
reportOwner={...owner1,email:badName};
assert.throws(()=>run('_monthlySendOne_(1,"2026-10","PREVIEW",_monthlyBooks_()["1"],false)'),/PRIMARY_OWNER_CHANGED_RETRY/);
assert.equal(sent.length,0,"recipient change must block");
reportOwner=owner1;
sheetRows[1][0]="상태: 마감완료";
assert.throws(()=>run('_monthlySendOne_(1,"2026-10","PREVIEW",_monthlyBooks_()["1"],false)'),/SHEET_STATE_MISMATCH/);
sheetRows=makeRows("PREVIEW");
sheetRows[5][1]="100,010원";
assert.throws(()=>run('_monthlySendOne_(1,"2026-10","PREVIEW",_monthlyBooks_()["1"],false)'),/SHEET_PAYROLL_STALE/);
sheetRows=makeRows("PREVIEW");
assert.equal(run('_monthlyStatement_(_monthlyFetchReport_(_monthlyConfig_(1,_monthlyBooks_()["1"]),"2026-10","PREVIEW").rows[1],_monthlyConfig_(1,_monthlyBooks_()["1"]),"2026-10",_monthlyFetchReport_(_monthlyConfig_(1,_monthlyBooks_()["1"]),"2026-10","PREVIEW")).name'),"2026-10_검토용_급여명세서_박연수_992.pdf");
run('_monthlyExcel_=function(){return {getBytes:function(){return [1,2,3]},setName:function(n){this.name=n;return this;}}};');
run('_monthlyStatement_=function(row,cfg,ym,report){return {getBytes:function(){return [1,2,3]},name:ym+"_"+report.mode+"_"+row.employee_id+".pdf"};};');
assert.equal(run('_monthlySendOne_(1,"2026-10","PREVIEW",_monthlyBooks_()["1"],false).status'),"SENT");
assert.equal(sent.length,1);
assert.equal(sent[0].to,"current@gmail.com");
assert.equal(sent[0].attachments.length,3,"XLSX and 2 employee PDFs");
assert.match(sent[0].subject,/검토용·미마감/);
assert.equal(props.get("MONTHLY_SENT_PREVIEW_1_202610"),"SENT");
assert.equal(run('_monthlySendOne_(1,"2026-10","PREVIEW",_monthlyBooks_()["1"],false).status'),"SENT");
assert.equal(sent.length,1,"duplicate preview must not resend");
simulateClosed=true;sheetRows=makeRows("FINAL");
currentOwner=owner2;reportOwner=owner2;
assert.equal(run('_monthlySendOne_(1,"2026-10","FINAL",_monthlyBooks_()["1"],false).status'),"SENT");
assert.equal(sent.length,2);
assert.equal(sent[1].to,"new@gmail.com","new primary manager at final send");
assert.equal(sent[1].attachments.length,2,"XLSX + 1 final PDF");
assert.match(sent[1].subject,/확정본/);
assert.equal(props.get("MONTHLY_SENT_FINAL_1_202610"),"SENT");
assert.equal(run('_monthlySendOne_(1,"2026-10","FINAL",_monthlyBooks_()["1"],false).status'),"SENT");
assert.equal(sent.length,2);
props.delete("MONTHLY_SENT_FINAL_1_202610");mailFail=true;
assert.throws(()=>run('_monthlySendOne_(1,"2026-10","FINAL",_monthlyBooks_()["1"],false)'),/MAIL_SEND_UNCERTAIN/);
assert.equal(props.get("MONTHLY_SENT_FINAL_1_202610"),"UNCERTAIN");
assert.equal(run('_monthlySendOne_(1,"2026-10","FINAL",_monthlyBooks_()["1"],false).status'),"REVIEW_REQUIRED");
assert.equal(sent.length,2,"uncertain send must not auto retry");
props.set("MONTHLY_OWNER_START_YM","2026-11");
assert.equal(run('_monthlySendOne_(1,"2026-10","FINAL",_monthlyBooks_()["1"],false).status'),"BEFORE_START");
props.set("MONTHLY_OWNER_ENABLED","false");
assert.equal(run('monthlyOwnerDigestTick()')[0].status,"DISABLED");

assert.ok(edge.includes('.from("store_primary_owners")'),"actual primary owner query");
assert.ok(edge.includes('.from("admin_users")'),"verify matching store manager");
assert.ok(edge.includes('auth.admin.getUserById'),"auth verified email");
assert.ok(edge.includes('currentOwner(storeId)'),"live owner must be read");
assert.ok(edge.includes('createPayrollEngine'),"real shared payroll engine");
assert.ok(edge.includes('computeMonthPayroll'),"preliminary must use server engine");
assert.ok(edge.includes('payroll_snapshot'),"final must use immutable close");
assert.ok(edge.includes('MONTHLY_OWNER_REPORTS_ACTIVE'),"default off server");
assert.ok(gas.includes("_monthlyCheckOwner_"),"refetch before MailApp send");
assert.ok(gas.includes("sheet.copyTo(temp)"),"export only month");
assert.ok(gas.includes("getCell(0).editAsText().setBold"),"real Google Docs cell API");
assert.ok(gas.includes('everyMinutes(15)'),"post-close re-check cadence");
assert.ok(gas.includes("MONTHLY_OWNER_START_YM"),"historical mail guard");
assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/script.send_mail"));
assert.ok(!gas.includes('MONTHLY_OWNER_STORES_JSON'),'no stale recipient list');
console.log("PASS #1435 40+ safety checks: KST end-of-month, open preview, owner changes, final mail, email idempotency, missing payroll flags, stale sheet and disabled gates.");
