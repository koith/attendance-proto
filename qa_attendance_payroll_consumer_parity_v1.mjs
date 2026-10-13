import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime(path){
  const src=fs.readFileSync(path,'utf8');
  const start=src.indexOf('function fromIso(');
  const end=src.indexOf('function calcPayroll(',start);
  assert(start>=0 && end>start, 'shared payroll code must be present in '+path);
  const context=vm.createContext({Date,Number,String,Math,Map,Set,isNaN,console});
  vm.runInContext(src.slice(start,end)+'\nthis.apply=applyCorrections;this.pair=pairEvents;',context);
  return {apply:context.apply,pair:context.pair};
}
const html=runtime('index.html');
const edge=runtime('supabase/functions/server-sync-sheet/engine.mjs');
const deploy=runtime('edge-release/supabase/functions/server-sync-sheet/engine.mjs');
const raw=[
 {id:501,employee_id:15,event_type:'IN',event_at:'2026-10-12T19:57:00'},
 {id:502,employee_id:15,event_type:'OUT',event_at:'2026-10-13T01:28:00'}
];
const corrections=[
 {id:700,employee_id:15,event_id:502,action:'EDIT_TIME',new_event_type:'OUT',new_event_at:'2026-10-13T01:28:00',created_at:'2026-10-13T09:00:00Z',reason:'restore real checkout',created_by:'manager'},
 {id:701,employee_id:15,event_id:null,action:'ADD',new_event_type:'OUT',new_event_at:'2026-10-13T02:00:00',created_at:'2026-10-13T09:01:00Z',reason:'SYSTEM_STORE_CLOSE',created_by:'system:auto-close'}
];
for(const [name,rt] of [['browser',html],['canonical Edge',edge],['native release Edge',deploy]]){
 const result=rt.pair(rt.apply(raw,corrections));
 assert.equal(result.length,1,name+': spurious 26:00 OUT must be absent');
 assert.equal(result[0].status,'COMPLETE',name+': real OUT must close the shift');
 assert.equal(result[0].sec,5*3600+31*60,name+': actual 19:57–01:28 duration');
 const fallback=rt.pair(rt.apply([raw[0]],[corrections[1]]));
 assert.equal(fallback.length,1,name+': truly open shift retains auto close');
 assert.equal(fallback[0].sec,6*3600+3*60,name+': 26:00 fallback on genuinely open shift');
 const orphan=rt.pair(rt.apply([raw[1]],[]));
 assert.equal(orphan[0].status,'ORPHAN_OUT',name+': raw orphan must not disappear');
 const marked=rt.pair(rt.apply([raw[0]],[{...corrections[1],reason:'SYSTEM_STORE_CLOSE [VOID_ADD:703]'}]));
 assert.equal(marked.length,1,name+': deleted auto close must not reappear');
 assert.equal(marked[0].status,'WORKING',name+': VOID_ADD must not complete open shift');
}
const sql=fs.readFileSync('supabase/migrations/20261013195000_attendance_consumer_timezone_parity.sql','utf8');
for(const fn of ['sheet_server_payroll_source','staff_actual_attendance','admin_events_with_corrections','sheet_month_attendance_projection'])assert(sql.includes('FUNCTION public.'+fn+'('),fn+' migration missing');
assert(sql.includes("public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)"));
assert(sql.includes("public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at)"));
console.log('PASS browser and both Edge releases: real overnight OUT retained, synthetic duplicate suppressed, 26h fallback, orphan and VOID_ADD safe');
