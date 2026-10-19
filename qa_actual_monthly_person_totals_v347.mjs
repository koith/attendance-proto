import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const html=fs.readFileSync('actual_attendance.html','utf8');
const index=fs.readFileSync('index.html','utf8');

const get=(a,b)=>{const start=js.indexOf(a),end=js.indexOf(b,start);assert.ok(start>=0&&end>start,'function source missing '+a);return js.slice(start,end)};
const state={ym:'2026-10',staffMode:false,staffAuth:null,
 employees:[{id:1,name:'동명이인'},{id:2,name:'동명이인'},{id:3,name:'<script>alert(1)</script>'}],
 sessions:[]};
// Execute the EXACT shipped work/summary functions (not a copied implementation).
const funcs=Function('state',
 'const S=state; const p2=n=>String(n).padStart(2,"0");\n'+
 get('function parseWall(v){','function applyCorrections(')+
 get('function applyCorrections(','function monthShift(')+
 get('function sessionAnchor(s){','async function loadMonth(')+
 'return {applyCorrections,pairEvents,monthlyCompletedByEmployee,monthlyCompletedSummaryHtml};'
)(state);
const t=(d,h)=>d+'T'+h+':00';
const events=[
 {id:1,employee_id:1,event_type:'IN',event_at:t('2026-10-01','08:00')},
 {id:2,employee_id:1,event_type:'OUT',event_at:t('2026-10-01','12:00')},
 {id:3,employee_id:1,event_type:'IN',event_at:t('2026-10-31','23:00')},
 {id:4,employee_id:1,event_type:'OUT',event_at:t('2026-11-01','02:00')},
 {id:5,employee_id:2,event_type:'IN',event_at:t('2026-10-02','09:00')},
 {id:6,employee_id:2,event_type:'OUT',event_at:t('2026-10-02','13:00')},
 {id:7,employee_id:2,event_type:'IN',event_at:t('2026-10-19','08:00')},
 {id:8,employee_id:3,event_type:'IN',event_at:t('2026-10-10','08:00')},
 {id:9,employee_id:3,event_type:'OUT',event_at:t('2026-10-10','09:00')},
 {id:10,employee_id:3,event_type:'IN',event_at:t('2026-10-12','10:00')},
 {id:11,employee_id:3,event_type:'OUT',event_at:t('2026-10-13','07:00')},
 {id:12,employee_id:3,event_type:'IN',event_at:t('2026-09-30','23:00')},
 {id:13,employee_id:3,event_type:'OUT',event_at:t('2026-10-01','01:00')},
 {id:14,employee_id:3,event_type:'IN',event_at:t('2026-11-01','10:00')},
 {id:15,employee_id:3,event_type:'OUT',event_at:t('2026-11-01','11:00')}
];
const corrections=[{id:101,event_id:2,action:'EDIT_TIME',
 new_event_at:t('2026-10-01','13:00'),created_at:'2026-10-14T11:00:00'}];
state.sessions=funcs.pairEvents(funcs.applyCorrections(events,corrections));
const totals=funcs.monthlyCompletedByEmployee(state.sessions,'2026-10');
assert.equal(totals.get(1),8*3600,'manager sees corrected 5h and overnight 3h in its starting month');
assert.equal(totals.get(2),4*3600,'unclosed work omitted');
assert.equal(totals.get(3),3600,'outlier >16h and previous-month cross-over are excluded');
let manager=funcs.monthlyCompletedSummaryHtml();
assert.match(manager,/직원별 2026년 10월 완료 근무시간/);
assert.match(manager,/3명 · 전체 13시간 0분/);
assert.match(manager,/8시간 0분/);
assert.equal((manager.match(/동명이인/g)||[]).length,2,'same-name employees are totaled by ID');
assert.doesNotMatch(manager,/<script>/);
assert.match(manager,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(manager,/급여 산정 시간과 다를 수 있습니다/);
state.staffMode=true;
state.staffAuth={employee_id:2,pin:'1234'};
const staff=funcs.monthlyCompletedSummaryHtml();
assert.match(staff,/내 2026년 10월 완료 근무시간/);
assert.match(staff,/4시간 0분/);
assert.doesNotMatch(staff,/8시간 0분/,'employee must not see other employee hours');
assert.doesNotMatch(staff,/13시간/,'employee must not see aggregate store hours');
assert.doesNotMatch(staff,/alert\(1\)/,'employee must not see other employee identity');
state.ym='2026-11';state.staffAuth={employee_id:3,pin:'4321'};
assert.match(funcs.monthlyCompletedSummaryHtml(),/1시간 0분/,'month navigation recomputes');
state.ym='2026-12';assert.match(funcs.monthlyCompletedSummaryHtml(),/0분/,'no completed source is shown as 0 with an explicit no-record status');
assert.equal(funcs.monthlyCompletedByEmployee([],state.ym).size,0,'empty month must not invent data');
// Rendering must be attached to the common month renderer; no extra RPC or PIN bypass.
assert.match(js,/previousRenderMonth=renderMonth;[\s\S]*?app\.insertAdjacentHTML\('afterbegin',monthlyCompletedSummaryHtml\(\)\)/);
assert.match(js,/staff_actual_attendance/,'staff mode maintains employee-specific PIN-gated RPC');
assert.match(js,/staffAuth\.employee_id/);
assert.match(css,/\.monthly-work-summary\.manager>summary/);
assert.match(css,/@media\(max-width:520px\)/);
assert.match(html,/actual_attendance\.js\?v=20261019monthly347/);
assert.match(html,/actual_attendance\.css\?v=20261019monthly347/);
assert.match(index,/const APP_VERSION="v0\.347";/);
new Function(js);
console.log('PASS #1193: month/employee isolation, corrected shift, overnight attribution, 16h anomaly, no-data, staff PIN, responsive HTML and version');
