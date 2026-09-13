import fs from 'node:fs';
const js=fs.readFileSync('actual_attendance.js','utf8');
const html=fs.readFileSync('actual_attendance.html','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const index=fs.readFileSync('index.html','utf8');
const dayEntry=fs.readFileSync('daily_schedule.html','utf8');
const monthEntry=fs.readFileSync('monthly_schedule.html','utf8');
const plannedDay=fs.readFileSync('planned_daily_schedule.html','utf8');
const plannedMonth=fs.readFileSync('planned_monthly_schedule.html','utf8');
const entryMode=fs.readFileSync('actual_attendance_entry_mode_v1.js','utf8');
function t(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
function a(v,m){if(!v)throw new Error(m)}
t('dashboard uses actual attendance with corrections',()=>{a(js.includes("admin_events_with_corrections"),'actual RPC missing');a(js.includes('applyCorrections'),'correction layer missing')});
t('monthly calendar drills into daily timeline',()=>{a(js.includes('data-day'),'month day target missing');a(js.includes('renderDay'),'daily drilldown missing');a(js.includes("[7,10,13,16,19,22,25]"),'07-25 axis missing')});
t('planned WorkSchedule is not dashboard source',()=>a(!js.includes('admin_schedule_list'),'planned schedule leaked into actual view'));
t('admin quick action enters actual dashboard',()=>{a(index.includes('<b>근무현황</b>'),'quick label missing');a(index.includes('location.href="actual_attendance.html"'),'quick route missing')});
t('canonical daily/monthly schedule entries are actual results, not planners',()=>{a(dayEntry.includes('actual_attendance.html?view=day'),'daily entry still planner');a(monthEntry.includes('actual_attendance.html?view=month'),'monthly entry still planner');a(entryMode.includes("mode==='day'"),'daily result entry mode missing')});
t('planned editors remain available only as explicit secondary screens',()=>{a(plannedDay.includes('계획 스케줄 편집'),'planned daily label missing');a(plannedMonth.includes('계획 스케줄 편집'),'planned monthly label missing');a(entryMode.includes('planned_daily_schedule.html'),'planned daily secondary link missing');a(entryMode.includes('planned_monthly_schedule.html'),'planned monthly secondary link missing')});
t('mobile files wired',()=>{a(html.includes('actual_attendance.css'),'css missing');a(html.includes('actual_attendance.js'),'js missing');a(html.includes('actual_attendance_entry_mode_v1.js'),'entry mode missing');a(css.includes('.calendar'),'calendar style missing');a(css.includes('.track'),'timeline style missing')});
t('correction and issue semantics visible',()=>{a(js.includes('corrected'),'corrected marker missing');a(js.includes('ORPHAN_OUT'),'orphan detection missing');a(js.includes('INCOMPLETE'),'incomplete detection missing')});
