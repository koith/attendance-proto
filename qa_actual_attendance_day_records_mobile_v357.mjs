// Regression for actual screenshot: iPhone day records/status pills/action overlap.
// All records are synthetic; this never writes attendance or queries production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium,webkit} from 'playwright';

const js=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8')+'\n'+
  fs.readFileSync('actual_attendance_correction.css','utf8');
// The original V0.51 wrapper moved every action toolbar into the name field.
assert.doesNotMatch(js,/row\.querySelector\(':scope > div:first-child'\)\?\.appendChild\(actions\)/,
 'Actions must not be relocated inside employee names');
assert.match(js,/actions\.parentElement!==row\)row\.appendChild\(actions\)/);
assert.doesNotMatch(js,/records-duplicate-notice/,'No duplicate warning banner in day records');
assert.match(css,/max-height:none!important;overflow:visible!important/,
 'Day record history must scroll with the full page, not clip the first row');

// An additional correction ADD for an existing effective punch is blocked;
// real distinct history is never silently deduplicated.
const a=js.indexOf('  const duplicateEffectivePunch=');
const b=js.indexOf('\n  function closeCorrection()',a);
assert.ok(a>0&&b>a,'Guard exists in canonical day correction runtime');
const d=new Date(2026,9,24,4,8);
const context={S:{sessions:[{employee_id:932,in:null,out:d}]},Number,String,Date};
vm.runInNewContext(
  'const dtValue=d=>d&&!isNaN(d)?\u0060\u0024{d.getFullYear()}-\u0024{String(d.getMonth()+1).padStart(2,"0")}-\u0024{String(d.getDate()).padStart(2,"0")}T\u0024{String(d.getHours()).padStart(2,"0")}:\u0024{String(d.getMinutes()).padStart(2,"0")}\u0060:"";\n'+
  js.slice(a,b)+';globalThis.check=duplicateEffectivePunch;',context
);
assert.equal(context.check(932,'OUT','2026-10-24 04:08:00'),true);
assert.equal(context.check(932,'OUT','2026-10-24T04:08'),true);
assert.equal(context.check(932,'OUT','2026-10-24T04:09'),false);
assert.equal(context.check(932,'IN','2026-10-24T04:08'),false);
assert.equal(context.check(931,'OUT','2026-10-24T04:08'),false);

// Mirror the user's ORIGINAL good screenshot: identity, long time, actions and
// "정정됨" all on the SAME row, including missing IN / missing OUT.
const sample=(name,time,badges,hint,buttons,issue=false)=>`
  <div class="session${issue?' needs-review':''}">
    <div><b><span>${name}</span><small class="employee-no-sub">No. 05</small></b>
      <div class="meta">${time}</div></div>
    <div>${badges.map(b=>'<span class="pill '+b[0]+'">'+b[1]+'</span>').join('')}</div>
    <div class="session-actions">
      ${hint?'<div class="session-fix-hint">'+hint+'</div>':''}
      ${buttons.map(b=>'<button type="button" class="session-fix '+b[0]+'">'+b[1]+'</button>').join('')}
    </div>
  </div>`;
const html=`<!doctype html><html lang="ko"><head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${css}</style></head><body><main class="wrap"><section class="dayview">
    <section class="records-group"><h3>근무 기록 및 정정
      <button class="session-fix">근무 기록 생성</button></h3>
      <div class="sessions">
        ${sample('정재우','07:00–15:00 · 8시간 0분',
          [['correction-status','정정됨']],'',
          [['','정정'],['session-delete','삭제']])}
        ${sample('이서현','14:51–19:57 · 5시간 5분',
          [],'',[['','정정'],['session-delete','삭제']])}
        ${sample('이현진','19:57–25:28 · 5시간 31분',
          [['correction-status','정정됨']],'',
          [['','정정'],['session-delete','삭제']])}
        ${sample('이현서','출근 누락–04:08',
          [['correction-status','정정됨'],['warn','출근 누락']],
          '출근 누락 · 확인 후 정정하세요.',
          [['urgent','바로 정정'],['session-delete','삭제']],true)}
        ${sample('이현서','07:02–퇴근 누락',
          [['warn','퇴근 누락']],
          '퇴근 누락 · 확인 후 정정하세요.',
          [['urgent','바로 정정'],['session-delete','삭제']],true)}
      </div><p class="records-note">정정 이력은 원본 출퇴근 기록을 변경하지 않습니다.</p>
    </section></section></main></body></html>`;

fs.mkdirSync('qa-results',{recursive:true});
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{
  for(const width of [320,375,393,414,430,768]){
   const page=await browser.newPage({viewport:{width,height:880},deviceScaleFactor:1});
   await page.setContent(html);
   const got=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('.records-group .session')];
    const container=document.querySelector('.records-group .sessions');
    const cr=container.getBoundingClientRect();
    const center=r=>(r.top+r.bottom)/2;
    const inside=(r,o)=>r.left>=o.left-1.1&&r.right<=o.right+1.1&&
       r.top>=o.top-1.1&&r.bottom<=o.bottom+1.1;
    const noOverlap=(a,b)=>a.right<=b.left+1.1||b.right<=a.left+1.1||
       a.bottom<=b.top+1.1||b.bottom<=a.top+1.1;
    return {
      bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth,
      scroller:getComputedStyle(container).overflowY,count:rows.length,
      entries:rows.map(row=>{
       const r=row.getBoundingClientRect(),b=row.querySelector('b').getBoundingClientRect(),
         meta=row.querySelector('.meta').getBoundingClientRect(),
         badges=[...row.querySelectorAll('.pill')].map(x=>x.getBoundingClientRect()),
         buttons=[...row.querySelectorAll('button')].map(x=>x.getBoundingClientRect()),
         hint=row.querySelector('.session-fix-hint')?.getBoundingClientRect(),
         actions=row.querySelector('.session-actions');
       const items=[b,meta,...badges,...buttons,...(hint?[hint]:[])];
       return {
        issue:row.classList.contains('needs-review'),
        within:inside(r,cr)&&items.every(item=>inside(item,r)),
        directActions:actions?.parentElement===row,
        identityToTime:b.right<=meta.left+1,
        timeToButtons:meta.right<=buttons[0].left+1||
          buttons[0].top>=meta.bottom-1,
        timeButtonGap:buttons[0].left-meta.right,
        buttonsNoOverlap:buttons.every((v,i)=>i===0||noOverlap(buttons[i-1],v)),
        buttonsToBadges:badges.every(v=>buttons.every(q=>noOverlap(q,v))),
        inline:Math.abs(center(b)-center(meta))<16&&
          Math.abs(center(meta)-center(buttons[0]))<16&&
          badges.every(v=>Math.abs(center(meta)-center(v))<16),
        actionsBelow:buttons[0].top>=meta.bottom-1,
        metaWidth:meta.width,rowHeight:r.height
       };
      })
    };
   });
   assert.equal(got.count,5,'No shift may be lost or merged for visual reasons');
   assert.ok(got.bodyWidth<=got.viewport+1,
     `${engine} ${width}px page horizontal overflow: ${JSON.stringify(got)}`);
   assert.equal(got.scroller,'visible',`${engine} ${width}px nested scroll`);
   assert.ok(got.entries.every(e=>e.within&&e.directActions&&e.buttonsNoOverlap&&e.buttonsToBadges),
     `${engine} ${width}px clipping or action/badge overlap: ${JSON.stringify(got)}`);
   assert.ok(got.entries.slice(0,3).every(e=>e.identityToTime&&e.timeToButtons),
     `${engine} ${width}px failed preserved identity/time/actions order: ${JSON.stringify(got)}`);
   if(width>=375){
     assert.ok(got.entries.every(e=>e.timeButtonGap>=-1&&e.timeButtonGap<=15),
       `${engine} ${width}px buttons must sit immediately beside the time, never right-aligned: ${JSON.stringify(got)}`);
     assert.ok(got.entries.slice(0,3).every(e=>e.inline&&e.rowHeight<70),
       `${engine} ${width}px NORMAL rows must remain one line with right-side badge: ${JSON.stringify(got)}`);
   } else {
     assert.ok(got.entries.slice(0,3).every(e=>e.actionsBelow),
       `${engine} ${width}px narrow-phone fallback must fit: ${JSON.stringify(got)}`);
   }
   if(width>=375){
     assert.ok(got.entries.slice(3).every(e=>e.issue&&e.inline&&!e.actionsBelow&&e.rowHeight<76),
       `${engine} ${width}px MISSING-PUNCH rows must retain original one-line layout: ${JSON.stringify(got)}`);
   }else{
     assert.ok(got.entries.slice(3).every(e=>e.issue&&e.actionsBelow),
       `${engine} ${width}px extreme-narrow fallback must not overlap: ${JSON.stringify(got)}`);
   }
   assert.ok(got.entries.every(e=>e.metaWidth>=28),
     `${engine} ${width}px time content must keep meaningful visible space: ${JSON.stringify(got)}`);
   if(width===414)await page.screenshot({
     path:`qa-results/actual-attendance-restored-inline-${engine}-414-v359.png`,fullPage:true
   });
   console.log(`PASS ${engine} ${width}px: normal and anomalous records single-row preserved, no clipping`);
   await page.close();
  }
 }finally{await browser.close()}
}
console.log('PASS inline layout visual regression and duplicate-effective-punch guard, no production writes');
