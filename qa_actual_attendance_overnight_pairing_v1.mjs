import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const text=fs.readFileSync('actual_attendance.js','utf8');
const from=text.indexOf('function applyCorrections('),to=text.indexOf('function monthShift(',from);
assert(from>=0&&to>from,'effective record projection and chronological pairing needed');
const sandbox=vm.createContext({Date,Math,Map,Number,String});
vm.runInContext(`function parseWall(v){const m=String(v).match(/^(\\d{4})-(\\d{2})-(\\d{2})[ T](\\d{2}):(\\d{2})(?::(\\d{2}))?/);return m?new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)):new Date(NaN)}\n`+text.slice(from,to)+'\nthis.project=applyCorrections;this.pair=pairEvents;',sandbox);
const project=sandbox.project,pair=sandbox.pair;
const raw=[
 {id:5474,employee_id:930,event_type:'IN',event_at:'2026-10-12T19:57:00'},
 {id:5477,employee_id:930,event_type:'OUT',event_at:'2026-10-13T01:28:00'}
];
const legacy=[
 {id:85,employee_id:930,event_id:5477,action:'EDIT_TIME',new_event_type:'OUT',new_event_at:'2026-10-13T01:00:00',created_at:'2026-10-13T03:00:46Z',created_by:'manager'},
 {id:86,employee_id:930,event_id:null,action:'ADD',new_event_type:'OUT',new_event_at:'2026-10-13T02:00:00',created_at:'2026-10-13T03:01:00Z',created_by:'system:auto-close',reason:'SYSTEM_STORE_CLOSE'}
];
let projected=project(raw,legacy),shifts=pair(projected);
assert.equal(projected.length,2,'irrelevant 26:00 synthetic close suppressed after corrected real OUT');
assert.equal(shifts.length,1,'overnight shift must remain one session');
assert.equal(shifts[0].status,'COMPLETE');
assert.equal(shifts[0].in.getDate(),12);
assert.equal(shifts[0].out.getDate(),13);
assert.equal(shifts[0].out.getHours(),1);
assert.equal(shifts[0].sec,5*3600+3*60);
assert.equal(shifts[0].inId,5474);
assert.equal(shifts[0].outId,5477);
const open=[raw[0]];
const onlyAuto=project(open,[legacy[1]]);
assert.equal(onlyAuto.length,2,'genuinely missing OUT must still be closed at 26:00');
assert.equal(pair(onlyAuto)[0].status,'COMPLETE');
assert.equal(pair(onlyAuto)[0].out.getHours(),2);
const orphan=pair(project([{id:9,employee_id:930,event_type:'OUT',event_at:'2026-10-13T02:00:00'}],[]));
assert.equal(orphan[0].status,'ORPHAN_OUT','actual missing IN must never be silently hidden');
const acrossMonth=pair(project([
 {id:1,employee_id:931,event_type:'IN',event_at:'2026-09-30T23:20:00'},
 {id:2,employee_id:931,event_type:'OUT',event_at:'2026-10-01T01:15:00'}
],[]));
assert.equal(acrossMonth.length,1);
assert.equal(acrossMonth[0].status,'COMPLETE');
assert.equal(acrossMonth[0].in.getMonth(),8);
assert.equal(acrossMonth[0].out.getMonth(),9);
const sameStore=project([...raw,{id:3,employee_id:931,event_type:'IN',event_at:'2026-10-12T19:00:00'}],legacy);
assert.equal(pair(sameStore).filter(x=>x.employee_id===931)[0].status,'WORKING','other employee untouched');
console.log('PASS actual midnight session: corrected OUT remains previous business day; redundant 26:00 suppressed; genuine OUT, cross-month, and other employees preserved');
