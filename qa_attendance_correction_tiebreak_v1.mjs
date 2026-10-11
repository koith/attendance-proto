import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
const html=fs.readFileSync('index.html','utf8');
const signature='function applyCorrections(events, corrections)';
const start=html.indexOf(signature),end=html.indexOf('\n}\n',start);
assert.ok(start>=0&&end>start,'browser correction algorithm missing');
const browser=vm.runInNewContext(html.slice(start,end+2)+'\napplyCorrections');
const server=createPayrollEngine({BE:{},storeId:1}).applyCorrections;
const events=[{id:1,employee_id:7,event_type:'IN',event_at:'2026-10-10T09:00:00'},
 {id:2,employee_id:7,event_type:'OUT',event_at:'2026-10-10T18:00:00'}];
const t='2026-10-11T06:30:00Z';
const older={id:101,event_id:1,employee_id:7,action:'EDIT_TIME',new_event_at:'2026-10-10T09:05:00',reason:'first',created_at:t};
const newer={id:102,event_id:1,employee_id:7,action:'EDIT_TIME',new_event_at:'2026-10-10T09:10:00',reason:'second',created_at:t};
for(const corrections of [[older,newer],[newer,older]]){
 for(const [name,fn] of [['browser',browser],['server',server]]){
  const rows=JSON.parse(JSON.stringify(fn(events,corrections)));
  assert.equal(rows.find(e=>e.id===1).event_at,newer.new_event_at,name+' must select larger correction id when timestamp ties');
  assert.equal(rows.find(e=>e.id===1).correctionReason,'second',name+' must retain latest audit reason');
 }
}
const voided={...newer,id:103,action:'VOID',reason:'latest void'};
for(const fn of [browser,server]){
 const rows=fn(events,[voided,newer,older]);
 assert.equal(rows.some(e=>e.id===1),false,'latest VOID wins even when source array is reverse ordered');
 assert.equal(rows.some(e=>e.id===2),true,'unrelated event remains intact');
}
const latestTime={...older,id:99,created_at:'2026-10-12T00:00:00Z',new_event_at:'2026-10-10T09:20:00'};
for(const fn of [browser,server]){
 const rows=fn(events,[latestTime,newer]);
 assert.equal(rows.find(e=>e.id===1).event_at,latestTime.new_event_at,'newer timestamp outranks older timestamp with higher id');
}
console.log('PASS correction tie-break order, VOID precedence and source/server parity without mutation');
