import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync('apps_script.gs','utf8');
const checks=[
 ['report title',/근태 · 급여 보고서/.test(s)],
 ['three sections',s.includes("title:'근태 현황'")&&s.includes("title:'세션 상세'")&&s.includes("title:'급여 집계'")],
 ['clean visual rebuild',s.includes('sh.clear();')&&s.includes('setHiddenGridlines(true)')],
 ['no fake KPI labels',!/(직책|활성 직원|총 근무일|급여 총액)/.test(s)],
 ['dynamic section rows',s.includes('sectionRows')&&s.includes('dataRanges')],
 ['content auto resize',s.includes('autoResizeColumns(1,width)')&&s.includes("width_source:'actual_cell_contents'")],
 ['no fixed width buckets',!s.includes('mobile-safe cap')&&!/setColumnWidth\s*\(/.test(s)],
 ['no merged report cards',!s.includes("getRange(sr,1,1,width).merge()")&&!s.includes("getRange(1,1,1,width).merge()")],
 ['no post-autoresize width clamp',!s.includes('setColumnWidth(')&&!s.includes('Math.min(Math.max(w+18')],
 ['high contrast table header',s.includes("setBackground('#173f2d').setFontColor('#ffffff')")],
 ['vertical table separators',s.includes("setBorder(false,true,true,true,true,false,line")],
 ['semantic alignment',s.includes("setHorizontalAlignment('right')")&&s.includes("setHorizontalAlignment('center')")],
 ['no detached payroll result blocks',!s.slice(s.indexOf('if(gross>0'),s.indexOf('var pStatus')).includes('setBackground(')&&!s.slice(s.indexOf('if(pStatus>0'),s.indexOf('// Final column widths')).includes('setBackground(')],
 ['design proof',s.includes("report_design_applied:true")&&s.includes("report_design_version:'sheet-report-v4'")],
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('PASS',name)}
console.log('Sheet report design QA: '+checks.length+' PASS');
