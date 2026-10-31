import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('gas/monthly-owner-report/Code.gs','utf8');
const endpoint=fs.readFileSync('supabase/functions/monthly-owner-report/index.ts','utf8');
const manifest=JSON.parse(fs.readFileSync('gas/monthly-owner-report/appsscript.json','utf8'));
const props=new Map();
const sent=[];
let remote={code:200,value:null},sheetRows,mailFail=false;
const blob=(n,size=60)=>({
  getBytes:()=>Array(size).fill(65),
  setName(name){this.name=name;return this;},
  setContentType(){return this;}
});
const storeDoc={getName:()=> '2026 근태',getSheetByName:()=>({getDataRange:()=>({getDisplayValues:()=>sheetRows})})};
const ctx={
  console,
  Date,JSON,Math,Number,String,Array,Object,RegExp,Error,isFinite,
  Utilities:{formatDate:(d)=>new Date(d.getTime()+9*3600_000).toISOString().slice(0,10)},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:k=>props.get(k)||null,
    setProperty:(k,v)=>{props.set(k,v);}
  })},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>{throw Error('TRIGGER_NOT_ALLOWED_IN_QA')}},
  UrlFetchApp:{fetch:(url,options)=>{
    if(url.includes('/monthly-owner-report')){
      assert.ok(options.headers['x-monthly-report-token'].length>=64);
      return {getResponseCode:()=>remote.code,getContentText:()=>JSON.stringify(remote.value)};
    }
    throw Error('NETWORK_BLOCKED');
  }},
  SpreadsheetApp:{openById:id=>{assert.equal(id,'x'.repeat(32));return storeDoc;}},
  MailApp:{
    getRemainingDailyQuota:()=>10,
    sendEmail:params=>{if(mailFail)throw Error('provider unknown');sent.push(params);}
  },
  DocumentApp:{
    ParagraphHeading:{HEADING1:'H1'},
    create:()=>({
      getId:()=> 'temp-id',
      getBody:()=>({
        appendParagraph:()=>({setHeading:()=>{}}),
        appendTable:()=>({getRow:()=>({editAsText:()=>({setBold:()=>{}})})})
      }),
      saveAndClose:()=>{}
    })
  },
  DriveApp:{getFileById:()=>({getAs:()=>blob('pdf'),setTrashed:()=>{}})},
  MimeType:{PDF:'application/pdf'}
};
vm.createContext(ctx);
vm.runInContext(source,ctx,{filename:'Code.gs'});
function run(expression){return vm.runInContext(expression,ctx);}
const store={name:'인하대학교점',gmail:'owner@gmail.com',bookId:'x'.repeat(32),verified:true,enabled:true};
props.set('MONTHLY_OWNER_REPORT_TOKEN','Z'.repeat(64));
props.set('MONTHLY_OWNER_ENABLED','true');
props.set('MONTHLY_OWNER_START_YM','2026-09');
props.set('MONTHLY_OWNER_STORES_JSON',JSON.stringify({1:store}));
const snapshot={
  ok:true,store_id:1,store_name:'인하대학교점',ym:'2026-09',status:'CLOSED',source_fingerprint:'a'.repeat(64),
  count:1,totals:{gross:100000,net:96700},
  rows:[{store_id:1,ym:'2026-09',employee_id:991,employee_name:'김민지',hours:8,wage:12500,
    base_pay:100000,juhyu_pay:0,night_allowance_won:0,break_compensation_won:0,
    substitution_pay_won:0,adjust:0,gross_pay:100000,net_pay:96700}]
};
sheetRows=[
 ['2026년 9월 근태 · 급여 보고서'],['마지막 동기화: 2026.10.01 | 상태: 마감완료'],[],
 ['급여 집계','세전 합계 100,000원'],['직원명','확정 세전급여'],['김민지','100,000원'],
 [],['근태 현황'],['날짜']
];
remote.value=snapshot;
assert.deepEqual(Array.from(run('_monthlyEligiblePeriods_(new Date("2026-10-31T14:45:00Z"))')),['2026-09','2026-10']);
assert.deepEqual(Array.from(run('_monthlyEligiblePeriods_(new Date("2026-11-01T00:00:00Z"))')),['2026-10']);
assert.deepEqual(Array.from(run('_monthlyEligiblePeriods_(new Date("2027-01-31T14:45:00Z"))')),['2026-12','2027-01']);
assert.throws(()=>run('_monthlyConfig_(1,{enabled:true,verified:true,gmail:"x@naver.com",name:"점포",bookId:"'+'x'.repeat(32)+'"})'),/OWNER_GMAIL_NOT_VERIFIED/);
assert.throws(()=>run('_monthlyConfig_(1,{enabled:true,verified:false,gmail:"x@gmail.com",name:"점포",bookId:"'+'x'.repeat(32)+'"})'),/OWNER_NOT_VERIFIED/);
assert.equal(run('_monthlyNumericCell_("1,234원")'),1234);
assert.throws(()=>run('_monthlyNumericCell_("안됨")'),/SHEET_GROSS_INVALID/);
assert.equal(run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],true)').status,'PREVIEW_OK');
assert.equal(sent.length,0,'preview must not send');
remote={code:409,value:{ok:false,error:'PAYROLL_NOT_CLOSED'}};
assert.equal(run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)').status,'PENDING');
assert.equal(sent.length,0,'no mail on unclosed payroll');
remote={code:200,value:snapshot};
const oldRow=sheetRows[1][0];sheetRows[1][0]='상태: 예상 · 미마감';
assert.throws(()=>run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)'),/SHEET_NOT_SYNCED_CLOSED/);
sheetRows[1][0]=oldRow;
sheetRows[5][1]='100,100원';
assert.throws(()=>run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)'),/SHEET_SNAPSHOT_TOTAL_MISMATCH/);
sheetRows[5][1]='100,000원';
remote.value={...snapshot,store_id:2};
assert.throws(()=>run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)'),/REPORT_SCOPE_MISMATCH/);
remote.value=snapshot;
props.set('MONTHLY_OWNER_START_YM','2026-10');
assert.equal(run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)').status,'BEFORE_START');
assert.equal(sent.length,0,'historical month must never be mailed on activation');
props.set('MONTHLY_OWNER_START_YM','2026-09');
// Generators are exercised independently. The send path sees tiny fixture blobs.
assert.equal(run('_monthlyStatement_(_monthlyFetchSnapshot_(_monthlyConfig_(1,_monthlyStores_()["1"]),"2026-09").rows[0],_monthlyConfig_(1,_monthlyStores_()["1"]),"2026-09").name'),'2026-09_급여명세서_김민지_991.pdf');
const bad={...snapshot.rows[0],night_allowance_won:120};
ctx.__bad=bad;
assert.throws(()=>run('_monthlyStatement_(__bad,_monthlyConfig_(1,_monthlyStores_()["1"]),"2026-09")'),/PAYROLL_COMPONENT_RECONCILIATION_FAILED/);
run('_monthlyExcel_=function(){return {getBytes:function(){return [1,2,3]},setName:function(n){this.name=n;return this;}}};');
run('_monthlyStatement_=function(){return {getBytes:function(){return [1,2,3]},setName:function(n){this.name=n;return this;}}};');
assert.equal(run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)').status,'SENT');
assert.equal(sent.length,1);
assert.equal(sent[0].to,'owner@gmail.com');
assert.equal(sent[0].attachments.length,2);
assert.match(sent[0].subject,/2026-09/);
assert.equal(props.get('MONTHLY_SENT_1_202609'),'SENT');
assert.equal(run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)').status,'SENT');
assert.equal(sent.length,1,'duplicate dispatch prohibited');
props.delete('MONTHLY_SENT_1_202609');mailFail=true;
assert.throws(()=>run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)'),/MAIL_SEND_UNCERTAIN/);
assert.equal(props.get('MONTHLY_SENT_1_202609'),'UNCERTAIN');
assert.equal(run('_monthlySendOne_(1,"2026-09",_monthlyStores_()["1"],false)').status,'REVIEW_REQUIRED');
assert.equal(sent.length,1,'ambiguous send must never auto-retry');
props.set('MONTHLY_OWNER_ENABLED','false');
assert.equal(run('monthlyOwnerDigestTick()')[0].status,'DISABLED');

assert.match(source,/sheet.copyTo\(temp\)/,'must export actual month from original sheet');
assert.match(source,/setTrashed\(true\)/,'temp files must be deleted');
assert.match(source,/MONTHLY_OWNER_ENABLED/,'disabled gate');
assert.match(source,/inTimezone\(MONTHLY_TZ\)/,'KST scheduling');
assert.match(endpoint,/MONTHLY_OWNER_REPORTS_ACTIVE/,'server disabled gate');
assert.match(endpoint,/payroll_period/,'only closed snapshots');
assert.match(endpoint,/store_id/,'store scope');
assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.send_mail'));
assert.ok(!source.includes('from:"') && !source.includes('to:"') && !source.includes('resend.com/emails'),'no hardcoded live recipients');
console.log('PASS monthly owner digest 20+ assertions: KST calendar, verified Gmail, CLOSED, sheet snapshot, PDF, duplicate, uncertain send, disabled gates');
