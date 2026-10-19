import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const js=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const html=fs.readFileSync('actual_attendance.html','utf8');
const index=fs.readFileSync('index.html','utf8');
const start=js.indexOf('function monthlyCompletedByEmployee(');
const stop=js.indexOf('\nfunction isIssue(',start);
assert.ok(start>0&&stop>start,'monthly summary implementation must be present');
const part=js.slice(start,stop);
const employees=Array.from({length:10},(_,i)=>({id:i+1,name:i===0?'TEST':i===1?'<script>':('직원'+i)}));
const sessions=employees.map((e,i)=>({
 employee_id:e.id,status:'COMPLETE',sec:((i+1)*3600+44*60),
 in:new Date('2026-10-15T09:00:00Z')
}));
sessions.push({employee_id:1,status:'WORKING',sec:550000,in:new Date('2026-10-15T09:00:00Z')});
sessions.push({employee_id:1,status:'COMPLETE',sec:61200,in:new Date('2026-10-15T09:00:00Z')});
sessions.push({employee_id:1,status:'COMPLETE',sec:5000,in:new Date('2026-09-15T09:00:00Z')});
const S={staffMode:false,ym:'2026-10',employees,sessions,staffAuth:null};
const escapeHtml=x=>String(x).replace(/[&<>"']/g,y=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[y]);
const dur=n=>Math.floor(n/3600)+'시간 '+Math.floor(n%3600/60)+'분';
const context={S,Date,escapeHtml,dur,sessionAnchor:s=>s.in,
 dayKey:d=>d.toISOString().slice(0,10),
 isIssue:s=>s.status!=='COMPLETE'||s.sec>16*3600};
const methods=vm.runInNewContext(part+';({monthlyCompletedByEmployee,monthlyCompletedSummaryHtml})',context);
const result=methods.monthlyCompletedByEmployee(sessions,'2026-10');
assert.equal(result.get(1),6240,'only complete verified date-localized shifts contribute');
assert.equal(result.get(10),38640);
const manager=methods.monthlyCompletedSummaryHtml();
assert.match(manager,/monthly-work-summary manager" open/,'manager opens directly to visible cards');
assert.equal((manager.match(/class="monthly-person-total monthly-employee-card"/g)||[]).length,10);
assert.equal((manager.match(/role="listitem"/g)||[]).length,10);
assert.match(manager,/monthly-employee-avatar/);
assert.match(manager,/monthly-employee-head/);
assert.match(manager,/monthly-employee-body/);
assert.match(manager,/10명 · 전체/);
assert.doesNotMatch(manager,/<script>/,'employee names must be escaped');
assert.match(manager,/&lt;script&gt;/,'escaped names remain identifiable');
assert.doesNotMatch(manager,/직원별 2026년 10월 완료 근무시간/,'redundant date heading removed');
assert.doesNotMatch(manager,/<div class="monthly-person-total"><span>/,'legacy row-only UI eliminated');
assert.match(manager,/급여 산정 시간과 다를 수 있음/,'financial interpretation disclaimer remains');
S.staffMode=true;S.staffAuth={employee_id:1};
const staff=methods.monthlyCompletedSummaryHtml();
assert.match(staff,/내 월 근무시간/);
assert.match(staff,/1시간 44분/);
assert.doesNotMatch(staff,/monthly-employee-card/,'PIN-authenticated staff may not see manager list');
assert.doesNotMatch(staff,/직원9/,'staff data isolation preserved');
assert.match(css,/\.monthly-employee-card\s*\{/);
assert.match(css,/\.monthly-employee-avatar\s*\{/);
assert.match(css,/\.monthly-work-list\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s,
 'two-column compact phone cards must be explicit');
assert.match(css,/\.monthly-work-note\s*\{[^}]*position:absolute!important/s,
 'redundant disclaimer is offscreen but remains accessible');
assert.match(html,/actual_attendance\.css\?v=20261019below349/);
assert.match(html,/actual_attendance\.js\?v=20261019below349/);
assert.match(index,/const APP_VERSION="v0\.349"/);
assert.match(index,/aria-label="현재 앱 버전 v0\.349">v0\.349<\/button>/);
console.log('PASS v0.349 manager card UI, 10 active employees, 2-col mobile, safe XSS, staff PIN isolation, corrected-only totals');
