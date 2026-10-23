// QA-05: actual shipped writer/lease functions, offline fault injection only.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const begin=source.indexOf('async function googleWrite('),end=source.indexOf('async function automaticCycle()',begin);
assert.ok(begin>0&&end>begin);
const code=source.slice(begin,end)+'\nthis.write=writeClaimed;';
const verified={ok:true,spreadsheet_id:'ISOLATED_ONLY',spreadsheet_url:'https://example.invalid/sheet',sheet_format:{column_resize_applied:true,resize_scope:'all_used_columns_after_write',width_source:'measured_display_text',column_width_readback_verified:true,verified_month_tabs:12,resized_columns:2,verified_column_widths:24}};
function harness(replies,{leased=true,finish=true,storeId=701}={}){
 const calls=[],acks=[],ctx={
  Deno:{env:{get(){throw Error('Operating secret access forbidden in isolated QA')}}},
  HttpError:class HttpError extends Error{constructor(status,message){super(message);this.status=status;}},
  hash:async x=>'hash:'+x,seoulStamp:()=> '2026-10-23',
  fetch:async(url,options)=>{assert.equal(url,'https://script.google.com/macros/s/QA_ONLY/exec');calls.push(JSON.parse(options.body));
   const x=replies.shift();assert.ok(x,'Unexpected extra write');return {ok:x.status===200,status:x.status,text:async()=>x.raw??JSON.stringify(x.value)};},
  client:{rpc:async(name,args)=>{
   assert.equal(args.p_store_id,storeId);
   if(name==='sheet_autosync_claim'){return {data:leased?'QA_CLAIM':null};}
   assert.equal(name,'sheet_autosync_finish');acks.push(args);return {data:finish};
  }},JSON,Number,Error,String
 };
 vm.runInNewContext(code,ctx);return {write:ctx.write,calls,acks};
}
const prepared={report:{store_key:'QA1243_SBX_AAAA1111',store_name:'Isolated',attendance:{rows:[]},sessions:{rows:[]},payroll:{rows:[]}},closed:false,closedPayroll:null,workingAttendance:{rows:[]}};
const route={url:'https://script.google.com/macros/s/QA_ONLY/exec',secret:'SYNTHETIC_ONLY',storeKey:'QA1243_SBX_AAAA1111'};
const invoke=h=>h.write('2026-10',701,prepared,{revision:'QA_ONLY'},false,route);
const results=[];const ok=name=>{results.push({name,result:'PASS'});console.log('PASS '+name);};
let h=harness([{status:200,value:{ok:false,error:'SHEET_SYNC_BUSY'}},{status:200,value:verified}]);
await assert.rejects(invoke(h),e=>e.status===409&&e.message==='SHEET_SYNC_BUSY');
assert.equal(h.acks[0].p_ok,false);assert.equal((await invoke(h)).written,true);
assert.equal(h.acks[1].p_ok,true);assert.deepEqual(h.calls[1],h.calls[0]);ok('Busy lease failure stays unacknowledged; same report retry succeeds');
h=harness([{status:200,raw:'<html>temporary</html>'},{status:200,value:verified}]);
await assert.rejects(invoke(h),/SHEET_NON_JSON_RESPONSE/);assert.equal(h.acks[0].p_ok,false);
await invoke(h);assert.equal(h.acks[1].p_ok,true);ok('Non-JSON upstream failure recovers without changing report');
h=harness([{status:200,value:{...verified,sheet_format:{...verified.sheet_format,column_width_readback_verified:false}}}]);
await assert.rejects(invoke(h),/SHEET_COLUMN_RESIZE_NOT_CONFIRMED/);assert.equal(h.acks[0].p_ok,false);ok('Missing remote readback cannot acknowledge a successful sync');
h=harness([{status:200,value:verified}],{finish:false});await assert.rejects(invoke(h),/SHEET_FINISH_FAILED/);assert.ok(h.acks.every(a=>a.p_claim==='QA_CLAIM'));ok('Stale completion token fails closed after upstream write');
h=harness([],{leased:false});assert.equal((await invoke(h)).skipped,true);assert.equal(h.calls.length,0);ok('Unclaimed unchanged report does not write twice');
h=harness([],{leased:false});await assert.rejects(h.write('2026-10',701,prepared,{},true,route),e=>e.status===409);assert.equal(h.calls.length,0);ok('Forced overlapping sync cannot bypass lease');
h=harness([],{storeId:702});await assert.rejects(h.write('2026-10',702,prepared,{},false,null),/QA_SHEET_ROUTE_NOT_APPROVED/);assert.equal(h.calls.length,0);ok('Unapproved branch cannot fall back to operating Sheet credentials');
mkdirSync('qa-results',{recursive:true});writeFileSync('qa-results/sheet-failure-recovery-1243.json',JSON.stringify({scope:'ACTUAL_WRITER_OFFLINE_FAULT_INJECTION',realGoogleRepeated:false,results},null,2));
