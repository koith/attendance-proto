import fs from 'node:fs';
const monthly=fs.readFileSync('monthly_schedule.js','utf8');
const daily=fs.readFileSync('daily_schedule.js','utf8');
const css=fs.readFileSync('monthly_schedule_contract_guard.css','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(!/await BE\.isAdmin\(\)/.test(monthly),'monthly must not block on redundant isAdmin preflight');
ok(!/await BE\.isAdmin\(\)/.test(daily),'daily must not block on redundant isAdmin preflight');
ok(/contract-extra\.selected:before/.test(css)&&/content:'계약외'/.test(css),'selected contract exception needs orange 계약외 badge');
console.log('schedule auth + contract badge QA PASS');
