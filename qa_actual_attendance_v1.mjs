import fs from 'node:fs';
const js=fs.readFileSync('actual_attendance.js','utf8');
const html=fs.readFileSync('actual_attendance.html','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const index=fs.readFileSync('index.html','utf8');
function a(v,m){if(!v)throw new Error(m)}
a(js.includes('admin_events_with_corrections'),'correction-aware data missing');
a(js.includes('applyCorrections'),'correction layer missing');
a(js.includes('data-day')&&js.includes('renderDay'),'calendar drilldown missing');
a(js.includes('axisStart=')&&js.includes('axisEnd='),'dynamic timeline axis missing');
a(!js.includes('admin_schedule_list'),'planned schedule leaked into actual view');
a(index.includes('location.href="actual_attendance.html"'),'admin actual-attendance route missing');
a(html.includes('actual_attendance.css?v=')&&html.includes('actual_attendance.js?v='),'cache-busted runtime missing');
a(css.includes('.calendar')&&css.includes('.track'),'attendance layout missing');
a(js.includes('ORPHAN_OUT')&&js.includes('INCOMPLETE'),'issue semantics missing');
console.log('actual attendance PASS');