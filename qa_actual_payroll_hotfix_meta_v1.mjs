import fs from 'node:fs';
const att=fs.readFileSync('actual_attendance.html','utf8');
const pay=fs.readFileSync('payroll_elapsed_weeks_v1.js','utf8');
if(!att.includes('20260913f'))throw new Error('actual attendance cache version stale');
if(!pay.includes('20260913f'))throw new Error('payroll cache version stale');
console.log('hotfix integration QA PASS');
