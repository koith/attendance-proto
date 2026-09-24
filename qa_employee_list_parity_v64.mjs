import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('index.html','utf8');
const sub=fs.readFileSync('substitution_v2.js','utf8');
const subHtml=fs.readFileSync('substitution.html','utf8');
const daily=fs.readFileSync('daily_schedule.css','utf8');
const monthly=fs.readFileSync('monthly_schedule.js','utf8');
const actual=fs.readFileSync('actual_attendance.css','utf8');

assert(index.includes('.employee-scroll-surface{max-height:'),'shared bounded employee surface required');
assert(index.includes('class="grid employee-scroll-surface" id="empGrid"'),'POS employee list must be bounded');
assert(index.includes('payEmployees.className="employee-scroll-surface compact"'),'payroll employee cards must scroll independently');
assert(index.includes('payEmployees.appendChild(card)'),'payroll cards must render inside bounded region');
assert(index.includes('.employee-list-mask{height:300px;overflow-y:auto'),'admin active/retired list must remain bounded');

assert(sub.includes('class="employee-pick-scroll"'),'substitute candidate employees must be in bounded region');
assert(subHtml.includes('.employee-pick-scroll{max-height:'),'substitute employee region needs internal scroll');

assert(daily.includes('.employee-grid{max-height:'),'planned daily employee cards must be bounded');
assert(actual.includes('.axis-wrap{max-height:'),'actual-attendance employee timeline must be bounded');
assert(actual.includes('.sessions{max-height:'),'actual-attendance session employee list must be bounded');

assert(monthly.includes("const rec=recentShifts()"),'desktop monthly schedule must expose recent shifts like mobile');
assert(monthly.includes("document.querySelectorAll('[data-shift]')"),'desktop recent-shift actions must be bound');
assert(monthly.includes("document.querySelectorAll('[data-wd]')"),'desktop weekday bulk selection must be bound');

for(const [name,src] of [['substitution_v2.js',sub],['monthly_schedule.js',monthly]]){
  try{new Function(src)}catch(e){throw new Error(name+' syntax error: '+e.message)}
}
console.log('employee list + desktop/mobile parity v64 QA: PASS');
