import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium} from 'playwright';
const source=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const a=source.indexOf('function monthlyCompletedByEmployee(');
const b=source.indexOf('\nfunction isIssue(',a);
assert.ok(a>0&&b>a);
const employees=Array.from({length:10},(_,i)=>({id:i+1,name:'테스트직원'+(i+1)}));
const sessions=employees.map((e,i)=>({
 employee_id:e.id,status:'COMPLETE',sec:(i+1)*3600+49*60,
 in:new Date('2026-10-14T09:00:00Z')
}));
const S={staffMode:false,ym:'2026-10',employees,sessions};
const escapeHtml=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dur=n=>Math.floor(n/3600)+'시간 '+Math.floor(n%3600/60)+'분';
const ctx={S,Date,escapeHtml,dur,
 dayKey:d=>d.toISOString().slice(0,10),
 sessionAnchor:s=>s.in,isIssue:()=>false};
const render=vm.runInNewContext(source.slice(a,b)+';monthlyCompletedSummaryHtml',ctx);
const markup=render();
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,375,390,768,1024]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  await page.setContent('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><main class="wrap">'+markup+'</main></body></html>');
  const measure=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.monthly-employee-card')];
   const boxes=cards.map(x=>x.getBoundingClientRect());
   const first=boxes[0],second=boxes[1];
   const title=document.querySelector('.monthly-work-heading');
   const total=document.querySelector('.monthly-work-heading strong');
   return {cardCount:cards.length,
    first:first?{x:first.x,y:first.y,width:first.width,height:first.height}:null,
    second:second?{x:second.x,y:second.y,width:second.width,height:second.height}:null,
    headingWidth:title?.scrollWidth,headingClient:title?.clientWidth,
    totalWidth:total?.scrollWidth,totalClient:total?.clientWidth,
    scroll:document.documentElement.scrollWidth,viewport:innerWidth,
    cols:getComputedStyle(document.querySelector('.monthly-work-list')).gridTemplateColumns.split(' ').length,
    bodyNoOverflow:cards.every(x=>x.scrollWidth<=x.clientWidth+1),
    cardNames:cards.map(x=>x.querySelector('.monthly-employee-name')?.textContent)
   };
  });
  assert.equal(measure.cardCount,10,'ten manager employee cards at '+width);
  assert.ok(measure.scroll<=measure.viewport+1,'horizontal page overflow at '+width+': '+JSON.stringify(measure));
  assert.ok(measure.bodyNoOverflow,'card content overflow at '+width);
  assert.ok(measure.totalWidth<=measure.totalClient+1,'summary badge squeezed at '+width);
  if(width<=390){
   assert.equal(measure.cols,2,'phone must have 2 employee columns');
   assert.ok(measure.second.x>measure.first.x&&Math.abs(measure.second.y-measure.first.y)<2,
    'phone cards must align on one row');
  }
  assert.ok(measure.cardNames.every(x=>x.startsWith('테스트직원')),'synthetic names only');
  if(width===390){
   fs.mkdirSync('qa-results',{recursive:true});
   await page.screenshot({path:'qa-results/attendance-manager-cards-v348-mobile.png',fullPage:true});
  }
  console.log('PASS month-cards Chromium '+width+'px: '+measure.cols+' cols, 10 names, no clipping');
  await page.close();
 }
 // Render the ACTUAL shipped month-wrapper, not a copied DOM reordering implementation.
 // The same mount runs for managers and PIN-authenticated staff.
 const mountStart=source.indexOf('/* #1193 v0.349:');
 assert.ok(mountStart>0,'missing v0.349 live month placement wrapper');
 const liveMount=source.slice(mountStart);
 assert.match(liveMount,/insertAdjacentHTML\\('beforeend'/,'summary must follow the calendar');
 S.staffMode=true;
 S.staffAuth={employee_id:1};
 const staffMarkup=render();
 for(const [role,roleMarkup] of [['manager',markup],['staff',staffMarkup]]){
  const page=await browser.newPage({viewport:{width:390,height:850},deviceScaleFactor:1});
  await page.setContent('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><main class="wrap"><div id="app"></div></main></body></html>');
  await page.addScriptTag({content:
   'var renderMonth=function(){document.getElementById("app").innerHTML=\'\x3cdiv class="weekhead">일 월 화 수 목 금 토\x3c/div>\x3cdiv class="calendar">\x3cbutton data-day="2026-10-14">14\x3c/button>\x3c/div>\x3cdiv class="legend">근무 완료\x3c/div>\x3cbutton class="today-fab" id="monthTodayBtn">오늘\x3c/button>\';};\n'+
   'var el=id=>document.getElementById(id);\n'+
   'var monthlyCompletedSummaryHtml=()=>'+JSON.stringify(roleMarkup)+';\n'+
   liveMount+'\nrenderMonth();'
  });
  const inspect=()=>page.evaluate(()=>{
   const app=document.getElementById('app');
   const calendar=app.querySelector('.calendar');
   const legend=app.querySelector('.legend');
   const today=app.querySelector('#monthTodayBtn');
   const summary=app.querySelector('.monthly-work-summary');
   const child=[...app.children];
   return {calendarIndex:child.indexOf(calendar),legendIndex:child.indexOf(legend),
    todayIndex:child.indexOf(today),summaryIndex:child.indexOf(summary),
    summaries:app.querySelectorAll('.monthly-work-summary').length,
    dayButtons:app.querySelectorAll('[data-day]').length,
    cards:app.querySelectorAll('.monthly-employee-card').length,
    total:summary?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  const m=await inspect();
  assert.ok(m.calendarIndex<m.legendIndex&&m.legendIndex<m.todayIndex&&m.todayIndex<m.summaryIndex,
   role+' summary must follow complete calendar, legend and today control: '+JSON.stringify(m));
  assert.equal(m.summaries,1,role+' has exactly one summary');
  assert.equal(m.dayButtons,1,role+' calendar remains interactive');
  assert.ok(!m.overflow,role+' must not introduce horizontal overflow');
  if(role==='staff'){assert.equal(m.cards,0,'staff never sees manager cards');assert.match(m.total,/내 월 근무시간/);}
  else{assert.equal(m.cards,10,'manager cards remain visible after calendar');}
  await page.evaluate(()=>renderMonth());
  assert.equal((await inspect()).summaries,1,role+' month switch must not duplicate summary');
  fs.mkdirSync('qa-results',{recursive:true});
  await page.screenshot({path:'qa-results/attendance-'+role+'-below-calendar-v349.png',fullPage:true});
  console.log('PASS v0.349 '+role+' real wrapper DOM order: calendar → legend → today → monthly total');
  await page.close();
 }
}finally{await browser.close();}
