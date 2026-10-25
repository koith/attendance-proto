import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('actual_attendance.js','utf8');
const start=source.indexOf('function parseWall(');
const end=source.indexOf('function monthShift(',start);
assert.ok(start>=0&&end>start,'Canonical correction/pairing functions found');
const context={Date,Map,Number,String,Math};
vm.runInNewContext(source.slice(start,end)+
  ';globalThis.apply=applyCorrections;globalThis.pair=pairEvents;',context);
const baseEvents=[
  {id:5586,employee_id:932,event_type:'IN',event_at:'2026-10-24 07:02:00'},
  {id:5590,employee_id:932,event_type:'OUT',event_at:'2026-10-24 19:59:00'}
];
const corrected={
  id:107,employee_id:932,event_id:5590,action:'EDIT_TIME',
  new_event_type:'OUT',new_event_at:'2026-10-24 13:08:00',
  created_at:'2026-10-25T15:01:50Z',reason:'퇴근누락'
};
const repeated=makeId=>({
  id:makeId,employee_id:932,event_id:null,action:'ADD',
  new_event_type:'OUT',new_event_at:'2026-10-24 13:08:00',
  created_at:'2026-10-25T15:03:22Z',reason:'퇴근누락'
});
const erroneous=context.pair(context.apply(baseEvents,[corrected,repeated(108),repeated(109)]));
assert.equal(erroneous.length,3,'Actual historical repeated ADD produces phantom sessions');
assert.equal(erroneous.filter(x=>x.status==='ORPHAN_OUT').length,2,'Two extra orphan OUT entries');
const restored=context.pair(context.apply(baseEvents,[
  corrected,
  {...repeated(108),reason:'퇴근누락 [VOID_ADD:130]'},
  {...repeated(109),reason:'퇴근누락 [VOID_ADD:131]'}
]));
assert.equal(restored.length,1,'Voiding duplicated ADDs preserves one correct shift');
assert.equal(restored[0].status,'COMPLETE');
assert.equal(restored[0].in.getHours(),7);
assert.equal(restored[0].out.getHours(),13);
assert.equal(restored[0].out.getMinutes(),8);
assert.equal(restored[0].sec,6*3600+6*60);
const sql=fs.readFileSync('supabase/migrations/20261026001000_fix_manager_correction_double_utc.sql','utf8');
assert.match(sql,/VALUES\(p_event_id,p_employee_id,p_action,p_new_at,p_new_type,p_reason,v_actor\)/,
 'New human corrections store KST unchanged to match post-cutover reader');
assert.match(sql,/DUPLICATE_ATTENDANCE_CORRECTION/,'Server-side repeated ADD guard');
assert.match(source,/alreadyHas\('OUT',nextOut,source\.outId\)/,'Browser blocks existing effective OUT');
assert.match(source,/CORRECTION_TIME_MISMATCH/,'Post-write readback rejects nine-hour drift');
assert.doesNotMatch(source,/row\.querySelector\(':scope > div:first-child'\)\?\.appendChild\(actions\)/,
 'Buttons must remain directly under each session row');
const css=fs.readFileSync('actual_attendance.css','utf8')+'\n'+fs.readFileSync('actual_attendance_correction.css','utf8');
assert.match(css,/grid-column:1\/-1/,'Mobile action row spans both content columns');
assert.match(css,/flex-wrap:wrap/,'Badges and buttons can wrap on small screens');
const html=fs.readFileSync('actual_attendance.html','utf8');
assert.match(html,/actual_attendance\.js\?v=20261026records358/,'Safari must refresh fixed browser JS');
assert.match(html,/actual_attendance\.css\?v=20261026records358/,'Safari must refresh fixed layout CSS');
console.log('PASS attendance correction: real-shaped duplicate fixture, append-only VOID_ADD recovery, correct shift/clock, server/UI guards and iPhone layout/cache');
