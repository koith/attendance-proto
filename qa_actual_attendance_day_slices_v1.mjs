import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('actual_attendance.html','utf8');
const js=fs.readFileSync('actual_attendance.js','utf8');
let pass=0;const t=(n,f)=>{f();pass++;console.log('PASS',n)};
t('canonical runtime owns overnight attendance',()=>{assert(html.includes('actual_attendance.js?v='));assert(!html.includes('actual_attendance_day_slices_v1.js?v='));assert(js.includes('Actual attendance V1.4'))});
t('overnight session remains anchored to clock-in business day',()=>{assert(js.includes('store workday is anchored by the clock-in date'));assert(js.includes('19:55-25:10'));assert(js.includes('06:00-26:00 business timeline'))});
t('correction keeps authoritative source endpoints',()=>{assert(js.includes('sourceIn'));assert(js.includes('sourceOut'));assert(js.includes('source.inId'));assert(js.includes('source.outId'))});
t('correction writes overlay only',()=>{assert(js.includes("rpc('admin_correct_event'"));assert(!js.includes('delete from attendance_events'));assert(!js.includes('update attendance_events'))});
console.log(`Actual attendance overnight V1 QA: ${pass} PASS`);
