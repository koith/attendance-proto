import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('payroll_elapsed_weeks_v1.js','utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(src,ctx);
const f=ctx.__payrollElapsedWeeksV1.completedWeeksInMonth;
function t(name,actual,expected){if(actual!==expected){console.error('FAIL',name,actual,'!=',expected);process.exitCode=1}else console.log('PASS',name)}
t('past month preserves four-week legacy basis',f('2026-08',new Date(2026,8,12,16)),4);
t('future month does not pre-book allowance',f('2026-10',new Date(2026,8,12,16)),0);
t('current month counts only fully elapsed Sunday boundaries',f('2026-09',new Date(2026,8,12,16)),1);
t('Sunday itself is not complete until the following day',f('2026-09',new Date(2026,8,13,16)),1);
t('Monday includes the Sunday just completed',f('2026-09',new Date(2026,8,14,0,1)),2);
t('legacy cap stays at four',f('2026-11',new Date(2026,10,30,12)),4);
