import fs from 'node:fs';
const att=fs.readFileSync('actual_attendance.html','utf8');
const pay=fs.readFileSync('payroll_elapsed_weeks_v1.js','utf8');
if(!/actual_attendance\.js\?v=\d+/.test(att))throw new Error('actual attendance cache-bust missing');
if(!/payroll_contract_authority_v1\.js\?v=\d+/.test(pay))throw new Error('payroll cache-bust missing');
console.log('hotfix integration QA PASS');
