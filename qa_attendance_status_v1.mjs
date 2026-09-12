import fs from 'node:fs';import vm from 'node:vm';
let src=fs.readFileSync('attendance_status.js','utf8');
src=src.slice(0,src.indexOf("const S={"));
const ctx={window:{},globalThis:{},console};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
const L=ctx.__attendanceStatusV1;
function t(n,c,d=''){if(!c){console.error('FAIL',n,d);process.exitCode=1}else console.log('PASS',n)}
const ev=[{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-12T07:00:00'},{id:2,employee_id:1,event_type:'OUT',event_at:'2026-09-12T15:00:00'}];
let s=L.pairEvents(ev,'2026-09-12');t('pairs normal session',s.length===1&&s[0].status==='COMPLETE'&&s[0].minutes===480,JSON.stringify(s));
s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-12T17:00:00'},{id:2,employee_id:1,event_type:'OUT',event_at:'2026-09-13T01:00:00'}],'2026-09-13');t('pairs overnight session',s[0].minutes===480,JSON.stringify(s));
s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-12T07:00:00'},{id:2,employee_id:1,event_type:'OUT',event_at:'2026-09-13T07:30:00'}],'2026-09-13');t('flags over-16-hour session',s[0].status==='ISSUE',JSON.stringify(s));
s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-12T10:00:00'}],'2026-09-12');t('today open session is visible as working',s[0].status==='OPEN',JSON.stringify(s));
s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-11T10:00:00'}],'2026-09-12');t('old open session becomes review issue',s[0].status==='ISSUE',JSON.stringify(s));
const corrected=L.applyCorrections(ev,[{id:9,event_id:1,action:'EDIT_TIME',new_event_at:'2026-09-12T08:00:00',created_at:'2026-09-12T12:00:00'}]);t('correction is applied without mutating raw event',corrected[0].event_at==='2026-09-12T08:00:00'&&ev[0].event_at==='2026-09-12T07:00:00');
t('25:00 timeline maps next-day 01:00 to 1500 minutes',L.dayMinute('2026-09-13T01:00:00','2026-09-12')===1500);
