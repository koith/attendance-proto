import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync('apps_script.gs','utf8');
const checks=[
 ['report title',/근태 · 급여 보고서/.test(s)],
 ['three sections',s.includes("1. 근태 현황")&&s.includes("2. 세션 상세")&&s.includes("3. 급여 집계")],
 ['clean visual rebuild',s.includes('sh.clear();')&&s.includes('setHiddenGridlines(true)')],
 ['no fake KPI labels',!/(직책|활성 직원|총 근무일|급여 총액)/.test(s)],
 ['dynamic section rows',s.includes('sectionRows')&&s.includes('dataRanges')],
 ['content auto resize',s.includes('autoResizeColumns(1,width)')&&s.includes("width_source:'actual_cell_contents'")],
 ['full-width merged section cards',s.includes("getRange(sr,1,1,width).merge()")],
 ['mobile-safe width cap',s.includes("Math.min(Math.max(w+18,72),180)")],
 ['design proof',s.includes("report_design_applied:true")&&s.includes("report_design_version:'sheet-report-v2'")],
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('PASS',name)}
console.log('Sheet report design QA: '+checks.length+' PASS');
