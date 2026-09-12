import fs from 'node:fs';
const js=fs.readFileSync('actual_attendance.js','utf8');
const html=fs.readFileSync('actual_attendance.html','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const index=fs.readFileSync('index.html','utf8');
function t(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
function a(v,m){if(!v)throw new Error(m)}
t('dashboard uses actual attendance with corrections',()=>{a(js.includes("admin_events_with_corrections"),'actual RPC missing');a(js.includes('applyCorrections'),'correction layer missing')});
t('monthly calendar drills into daily timeline',()=>{a(js.includes('data-day'),'month day target missing');a(js.includes('renderDay'),'daily drilldown missing');a(js.includes("[7,10,13,16,19,22,25]"),'07-25 axis missing')});
t('planned WorkSchedule is not dashboard source',()=>a(!js.includes('admin_schedule_list'),'planned schedule leaked into actual view'));
t('admin quick action enters actual dashboard',()=>{a(index.includes('<b>근무현황</b>'),'quick label missing');a(index.includes('location.href="actual_attendance.html"'),'quick route missing')});
t('planned schedule editors remain available',()=>{a(index.includes('monthly_schedule.html'),'monthly planner removed');a(index.includes('daily_schedule.html'),'daily planner removed')});
t('mobile files wired',()=>{a(html.includes('actual_attendance.css'),'css missing');a(html.includes('actual_attendance.js'),'js missing');a(css.includes('.calendar'),'calendar style missing');a(css.includes('.track'),'timeline style missing')});
t('correction and issue semantics visible',()=>{a(js.includes('corrected'),'corrected marker missing');a(js.includes('ORPHAN_OUT'),'orphan detection missing');a(js.includes('INCOMPLETE'),'incomplete detection missing')});