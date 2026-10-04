import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync('apps_script.gs','utf8');
const checks=[
 ['report title',/근태 · 급여 보고서/.test(s)],
 ['three sections',s.includes("title:'근태 현황'")&&s.includes("title:'세션 상세'")&&s.includes("title:'급여 집계'")],
 ['clean visual rebuild',s.includes("getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()).clear({contentsOnly:false})")&&s.includes('setHiddenGridlines(true)')],
 ['no fake KPI labels',!/(직책|활성 직원|총 근무일|급여 총액)/.test(s)],
 ['dynamic section rows',s.includes('sectionRows')&&s.includes('dataRanges')],
 ['content measured width',s.includes('getDisplayValues()')&&s.includes("width_source:'measured_display_text'")],
 ['no fixed width buckets',!s.includes('mobile-safe cap')&&!s.includes('widthBuckets')&&!s.includes('typeWidth')],
 ['no merged report cards',!s.includes("getRange(sr,1,1,width).merge()")&&!s.includes("getRange(1,1,1,width).merge()")],
 ['measured display text is final width authority',s.includes('setColumnWidth(cc+1,required)')&&!s.includes('Math.min(')],
 ['approved dark-green table header',s.includes("setBackground(headerGreen).setFontColor('#ffffff')")],
 ['vertical table separators',s.includes("setBorder(true,true,true,true,true,true,line")],
 ['semantic alignment',s.includes("setHorizontalAlignment('right')")&&s.includes("setHorizontalAlignment('center')")],
 ['human-readable date/time formats',s.includes("h==='날짜'")&&s.includes("setNumberFormat('yyyy-mm-dd')")&&s.includes("setNumberFormat('hh:mm')")&&s.includes("setNumberFormat('[h]:mm')")],
 ['continuous white body incl status',!s.slice(s.indexOf('var aStatus'),s.indexOf('var gross')).includes('setBackground(')],
 ['no detached payroll result blocks',!s.slice(s.indexOf('if(gross>0'),s.indexOf('var pStatus')).includes('setBackground(')&&!s.slice(s.indexOf('if(pStatus>0'),s.indexOf('// Native autofit')).includes('setBackground(')],
 ['design proof',s.includes("report_design_applied:true")&&s.includes("report_design_version:'sheet-report-v8'")],
 ['full-grid stale-format cleanup',s.includes("sh.getMaxRows(),sh.getMaxColumns()).clear({contentsOnly:false})")],
 ['no literal escaped newlines',!s.includes('\\n')],
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('PASS',name)}
console.log('Sheet report design QA: '+checks.length+' PASS');
