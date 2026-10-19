import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

// Exercise the REAL deployed Edge googleWrite function in a sealed VM. All
// Google responses and credentials below are synthetic; no network or workbook.
const source=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const start=source.indexOf('async function googleWrite(');
const end=source.indexOf('\nasync function claim(',start);
assert.ok(start>0&&end>start,'Edge googleWrite source must remain extractable');
const code=source.slice(start,end);
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
let reply={status:200,body:{ok:false,error:'SHEET_SYNC_BUSY'}},fetchCount=0;
const requests=[];
const context=vm.createContext({
 HttpError,
 Deno:{env:{get:key=>key==='SHEET_WEBAPP_URL'?'https://script.google.com/qa-only':'qa-only-secret'}},
 seoulStamp:()=> '2026-10-20 01:00',
 fetch:async(url,options)=>{
  assert.equal(url,'https://script.google.com/qa-only');
  assert.equal(options.method,'POST');
  requests.push(JSON.parse(options.body));
  fetchCount++;
  return {ok:reply.status>=200&&reply.status<300,status:reply.status,
   text:async()=>typeof reply.body==='string'?reply.body:JSON.stringify(reply.body)};
 }
});
vm.runInContext(code+'\nthis.googleWrite=googleWrite;',context);
const run=(status,body)=>{reply={status,body};return context.googleWrite(
 '2026-10',{store_key:'QA_ONLY',store_name:'QA only',attendance:{header:[],rows:[]},
  sessions:{header:[],rows:[]},payroll:{header:[],rows:[]}},false,null,null
)};
for(const status of [200,409,502]){
 const prior=fetchCount;
 await assert.rejects(run(status,{ok:false,error:'SHEET_SYNC_BUSY'}),e=>
  e.status===409&&e.message==='SHEET_SYNC_BUSY','exact script lease busy => 409');
 assert.equal(fetchCount,prior+1,'handler must not silently repeat a Sheet write');
}
for(const [status,error] of [
 [200,'SHEET_SYNC_BUSY_OTHER'],[200,'BAD_STORE_KEY'],[403,'SHEET_SYNC_BUSY?'],
 [502,'SHEET_WRITE_FAILED'],[200,'SHEET_WRITE_FAILED: SHEET_SYNC_BUSY']
]){
 await assert.rejects(run(status,{ok:false,error}),e=>
  e.status!==409&&e.message.startsWith('SHEET_WRITE_FAILED:'),
  'only the EXACT script busy marker may map to 409');
}
await assert.rejects(run(200,'not valid JSON'),/SHEET_NON_JSON_RESPONSE/);
const success={ok:true,spreadsheet_id:'qa-sheet',spreadsheet_url:'https://example.invalid/qa',
 sheet_format:{column_resize_applied:true,resize_scope:'all_used_columns_after_write',
  width_source:'measured_display_text',column_width_readback_verified:true,
  verified_month_tabs:12,resized_columns:2,verified_column_widths:24}};
const result=await run(200,success);
assert.equal(result.spreadsheet_id,'qa-sheet');
assert.ok(requests.every(p=>p.store_key==='QA_ONLY'),'only an isolated QA fixture is used');
console.log('PASS QA-05 real Edge writer: exact GAS lock busy 409, all unrelated errors fail, successful proof preserved');
