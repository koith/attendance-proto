import fs from 'node:fs';
const all=fs.readFileSync('actual_attendance.js','utf8');
const js=all.slice(all.indexOf('Actual attendance V1.2'),all.indexOf('Actual attendance V1.3'));
const html=fs.readFileSync('actual_attendance.html','utf8');
const must=[
  "ORPHAN_OUT')return '출근 누락'",
  "INCOMPLETE')return '퇴근 누락'",
  "return '과거 미퇴근'",
  "return '16시간 초과'",
  'isIssue=function(s,day)',
  "row.querySelector('.pill.warn')"
];
for(const token of must){if(!js.includes(token))throw new Error(`missing anomaly behavior: ${token}`)}
if(!html.includes('actual_attendance.js?v='))throw new Error('canonical runtime not loaded');
if(html.includes('actual_attendance_anomaly_v1.js?v='))throw new Error('legacy anomaly patch must not load separately');
if(js.includes('admin_correct_event')||js.includes('attendance_events'))throw new Error('anomaly layer must remain read-only');
console.log('actual attendance anomaly QA PASS');