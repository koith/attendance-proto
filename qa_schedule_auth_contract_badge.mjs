import fs from 'node:fs';
const html=fs.readFileSync('monthly_schedule.html','utf8');
const bridge=fs.readFileSync('schedule_admin_preflight.js','utf8');
const daily=fs.readFileSync('daily_schedule.js','utf8');
const css=fs.readFileSync('monthly_calendar_state_v1.css','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.indexOf('schedule_admin_preflight.js')>html.indexOf('monthly_schedule_core.js')&&html.indexOf('schedule_admin_preflight.js')<html.indexOf('monthly_schedule.js'),'monthly auth bridge must load between core and page init');
ok(/BE\.isAdmin=async\(\)=>true/.test(bridge),'monthly redundant admin preflight must be bypassed; admin_* RPCs remain authoritative');
ok(!/await BE\.isAdmin\(\)/.test(daily),'daily must not block on redundant isAdmin preflight');
ok(/contract-extra\.selected:before/.test(css)&&/content:'계약외'/.test(css),'selected contract exception needs orange 계약외 badge');
console.log('schedule auth + contract badge QA PASS');
