import fs from 'node:fs';
import assert from 'node:assert/strict';
const js=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const html=fs.readFileSync('actual_attendance.html','utf8');
// Current canonical month grid is compact: status dots + full timeline on date tap.
assert(js.includes('sessionsForDay(day)'));
assert(js.includes("ss.some(x=>x.status==='COMPLETE'||x.status==='WORKING')"));
assert(js.includes('worked-dot'));
assert(js.includes('issue-dot'));
assert(js.includes('data-day="${day}"'));
assert(js.includes('renderDay(b.dataset.day)'));
assert(css.includes('.worked-dot'));
assert(css.includes('.issue-dot'));
const cssVer=html.match(/actual_attendance\.css\?v=([^"']+)/)?.[1];
const jsVer=html.match(/actual_attendance\.js\?v=([^"']+)/)?.[1];
assert(cssVer&&jsVer&&cssVer===jsVer,'actual attendance CSS/JS cache versions must match');
console.log('monthly attendance summary v28: PASS');
