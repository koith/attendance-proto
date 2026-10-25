// Regression for actual screenshot: iPhone day records/status pills/action overlap.
// All records are synthetic; this never writes attendance or queries production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium,webkit} from 'playwright';

const js=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8')+'\n'+
  fs.readFileSync('actual_attendance_correction.css','utf8');
// Original one-line design: actions belong beside the person's time.
assert.match(js,/identity\.appendChild\(actions\)/);
assert.doesNotMatch(js,/actions\.parentElement!==row\)row\.appendChild\(actions\)/);
assert.match(css,/flex-direction:row!important;flex-wrap:nowrap!important/);
assert.match(js,/records-duplicate-notice/);
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

const sample=(name,time,badges,hint,buttons)=>`
  <div class="session${hint?' needs-review':''}">
    <div><b><span>${name}</span><small class="employee-no-sub">No. 08</small></b>
      <div class="meta">${time}</div>
      <div class="session-actions">
      ${hint?'<div class="session-fix-hint">'+hint+'</div>':''}
      ${buttons.map(b=>'<button type="button" class="session-fix '+b[0]+'">'+b[1]+'</button>').join('')}
      </div>
    </div>
    <div>${badges.map(b=>'<span class="pill '+b[0]+'">'+b[1]+'</span>').join('')}</div>
  </div>`;
const html=`<!doctype html><html lang="ko"><head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${css}</style></head><body><main class="wrap"><section class="dayview">
    <section class="records-group"><h3>근무 기록 및 정정
      <button class="session-fix">근무 기록 생성</button></h3>
      <p class="records-duplicate-notice" role="status">동일 직원의 같은 시각 출퇴근 기록이 중복돼 있습니다. 자동으로 삭제하지 않았으니 정정 이력을 확인하세요.</p>
      <div class="sessions">
        ${sample('정재우','07:00–15:00 · 8시간 0분',[['correction-status','정정됨']],
          '',[['','정정'],['session-delete','삭제']])}
        ${sample('직원08','출근 누락–04:08',[['correction-status','정정됨'],['warn','출근 누락']],
          '출근 누락 · 확인 후 정정하세요.',[['urgent','바로 정정'],['session-delete','삭제']])}
        ${sample('직원08','출근 누락–04:08',[['correction-status','정정됨'],['warn','출근 누락']],
          '출근 누락 · 확인 후 정정하세요.',[['urgent','바로 정정'],['session-delete','삭제']])}
        ${sample('직원08','07:02–퇴근 누락',[['warn','퇴근 누락']],
          '퇴근 누락 · 확인 후 정정하세요.',[['urgent','바로 정정'],['session-delete','삭제']])}
      </div><p class="records-note">정정 이력은 원본 출퇴근 기록을 변경하지 않습니다.</p>
    </section></section></main></body></html>`;

fs.mkdirSync('qa-results',{recursive:true});
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{
  for(const width of [320,375,393,430,768]){
   const page=await browser.newPage({viewport:{width,height:880},deviceScaleFactor:1});
   await page.setContent(html);
   const got=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('.records-group .session')];
    const container=document.querySelector('.records-group .sessions');
    const cr=container.getBoundingClientRect();
    const inside=(rect,outer)=>rect.left>=outer.left-1.1&&rect.right<=outer.right+1.1&&
       rect.top>=outer.top-1.1&&rect.bottom<=outer.bottom+1.1;
    return {
      bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth,
      scroller:getComputedStyle(container).overflowY,
      count:rows.length,
      entries:rows.map(row=>{
       const r=row.getBoundingClientRect(),items=[...row.querySelectorAll('.pill,.session-fix,.session-fix-hint')];
       const actions=row.querySelector('.session-actions');
       return {
        within:inside(r,cr),
        childrenWithin:items.every(el=>inside(el.getBoundingClientRect(),r)),
        nestedActions:actions?.parentElement===row.children[0],
        inlineNormal:innerWidth<393||row.classList.contains('needs-review')||
          (Math.abs(actions.getBoundingClientRect().top-row.querySelector('b').getBoundingClientRect().top)<16),
        normalHeight:row.classList.contains('needs-review')||r.height<80,
        badges:row.querySelectorAll('.pill').length,
        buttons:row.querySelectorAll('button').length,
        badgeText:[...row.querySelectorAll('.pill')].map(x=>x.textContent).join('/')
       };
      })
    };
   });
   assert.equal(got.count,4,'Historical distinct rows must not be hidden');
   assert.ok(got.bodyWidth<=got.viewport+1,`${engine} ${width} horizontal overflow: ${JSON.stringify(got)}`);
   assert.equal(got.scroller,'visible',`${engine} ${width} nested record scroll`);
   assert.ok(got.entries.every(e=>e.within&&e.childrenWithin&&e.nestedActions&&e.inlineNormal&&e.normalHeight),
    `${engine} ${width} clipped/overlapped controls: ${JSON.stringify(got)}`);
   assert.equal(got.entries[0].badges,1);
   assert.equal(got.entries[1].badges,2);
   assert.equal(got.entries[0].buttons,2);
   if(width===393)await page.screenshot({path:`qa-results/actual-attendance-day-record-${engine}-393-v357.png`,fullPage:true});
   console.log(`PASS ${engine} ${width}px mobile day records: no clipped pills/buttons or nested scrollbar`);
   await page.close();
  }
 }finally{await browser.close()}
}
console.log('PASS v0.358 restored normal inline rows and anomaly-safe wrapping, no production writes');
