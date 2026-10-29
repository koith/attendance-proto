import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const app=read('actual_attendance.js');
const sql=read('supabase/migrations/20261029134000_atomic_recorrect_admin_added_attendance.sql');
const html=read('actual_attendance.html');

assert(!app.includes('관리자가 추가한 기록은 삭제 후 다시 생성하세요.'));
assert(app.includes("rpc(replacing?'store_attendance_replace_added_event':'admin_correct_event'"));
assert(app.includes("p_action:'REPLACE_ADD'"));
assert(app.includes("Number(source.outCorrectionId||String(source.outId).slice(4))"));
assert(app.includes("Number(source.inCorrectionId||String(source.inId).slice(4))"));
assert(app.includes("const formerGone=args.p_action!=='REPLACE_ADD'"));
assert(app.includes("if(await loadMonth()!==true)"));
assert(app.includes("p_event_id:Number(source.outId)"));
assert(app.includes("p_event_id:Number(source.inId)"));
assert(html.includes('actual_attendance.js?v='));

assert(sql.includes('public.can_manage_store_attendance(v_store_id)'));
assert(sql.includes("pg_advisory_xact_lock"));
assert(sql.includes("FOR UPDATE"));
assert(sql.includes("'VOID_ADD',p_correction_id,p_employee_id,NULL,NULL,p_reason"));
assert(sql.includes("'ADD',NULL,p_employee_id,p_new_at,p_new_type"));
assert(!sql.includes('UPDATE public.attendance_events'));
assert(sql.includes('FROM PUBLIC, anon'));
assert(sql.includes('TO authenticated, service_role'));

// Exercise actual shipping event projection/pairing code using synthetic
// correction IDs. A second re-correction must leave one effective shift.
const start=app.indexOf('function applyCorrections(');
const stop=app.indexOf('function monthShift(',start);
assert(start>=0&&stop>start);
const context={};
vm.runInNewContext(
  "function parseWall(x){return new Date(String(x).replace(' ','T'))}\n"+
  app.slice(start,stop)+"\nglobalThis.project={applyCorrections,pairEvents};",context
);
const corr=(id,type,time,reason,action='ADD')=>({
  id,employee_id:42,action,new_event_type:type,new_event_at:time,
  reason,created_by:'manager',created_at:'2026-10-29T04:50:00Z'
});
const events=[
  corr(100,'IN','2026-10-24 07:02:00','manual IN'),
  corr(101,'OUT','2026-10-24 13:00:00','original [VOID_ADD:102]'),
  corr(102,null,null,'void original','VOID_ADD'),
  corr(103,'OUT','2026-10-24 13:10:00','[REPLACES_ADD:101] [VOID_ADD:104]'),
  corr(104,null,null,'void 13:10','VOID_ADD'),
  corr(105,'OUT','2026-10-24 13:15:00','[REPLACES_ADD:103]')
];
const projected=context.project.applyCorrections([],events);
assert.deepEqual(Array.from(projected.map(x=>String(x.id))),['add_100','add_105']);
const sessions=context.project.pairEvents(projected);
assert.equal(sessions.length,1);
assert.equal(sessions[0].status,'COMPLETE');
assert.equal(sessions[0].inId,'add_100');
assert.equal(sessions[0].outId,'add_105');
assert.equal(sessions[0].sec,6*3600+13*60);
console.log('PASS front-end synthetic ADD re-correction: single effective shift, second edit, audit, readback, permissions');
