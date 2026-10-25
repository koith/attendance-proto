// v0.358 screenshot regression: preserve original horizontal day records.
// All records synthetic. Never mutate operational attendance or payroll.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
const js=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8')+'\n'+fs.readFileSync('actual_attendance_correction.css','utf8');
const htmlSource=fs.readFileSync('actual_attendance.html','utf8');
assert.match(js,/identity\.appendChild\(actions\)/,'Actions must remain inside employee/time cell');
assert.doesNotMatch(js,/if\(actions&&actions\.parentElement!==row\)row\.appendChild\(actions\)/,'No forced second action row');
assert.match(css,/grid-template-columns:minmax\(0,1fr\) max-content!important/,'Original left info + right badges grid');
assert.doesNotMatch(css,/grid-column:1\/-1;grid-row:2/,'No full-width action row');
assert.match(css,/max-height:none!important;overflow:visible!important/,'No clipped inner list scrollbar');
const cv=htmlSource.match(/actual_attendance\.css\?v=([A-Za-z0-9_-]+)/)?.[1];
const jv=htmlSource.match(/actual_attendance\.js\?v=([A-Za-z0-9_-]+)/)?.[1];
assert.ok(cv&&cv===jv,'Matched uncached release assets');

function sample(name,no,time,badges,hint,staff){
 const buttons='<button type="button" class="session-fix">정정</button>'+(staff?'':'<button type="button" class="session-fix session-delete">삭제</button>');
 return '<div class="session'+(hint?' needs-review':'')+'"><div><b><span>'+name+'</span><small class="employee-no-sub">No. '+no+'</small></b>'+
   '<div class="meta">'+time+'</div><div class="session-actions">'+
   (hint?'<div class="session-fix-hint">'+hint+'</div>':'')+buttons+'</div></div><div>'+
   badges.map(b=>'<span class="pill '+b[0]+'">'+b[1]+'</span>').join('')+'</div></div>';
}
const fixture='<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+
 '</style></head><body><main class="wrap"><section class="dayview"><section class="records-group">'+
 '<h3>근무 기록 및 정정 <button class="session-fix">근무 기록 생성</button></h3><div class="sessions">'+
 sample('정재우','05','07:00–15:00 · 8시간 0분',[['correction-status','정정됨']],'',false)+
 sample('이서현','03','14:51–19:57 · 5시간 5분',[],'',false)+
 sample('이현진','07','19:57–25:28 · 5시간 31분',[['correction-status','정정됨']],'',false)+
 sample('이현서','08','출근 누락–04:08',[['correction-status','정정됨'],['warn','출근 누락']],'출근 누락 · 확인 후 정정하세요.',false)+
 sample('직원','09','08:00–09:00',[],'',true)+
 '</div><p class="records-note">원본 출퇴근 기록은 변경하지 않습니다.</p></section></section></main></body></html>';
fs.mkdirSync('qa-results',{recursive:true});
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{
  for(const width of [320,375,393,430,768]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   await page.setContent(fixture);
   const result=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('.records-group .session')],parent=document.querySelector('.records-group .sessions');
    const rect=e=>e.getBoundingClientRect();
    const within=(r,o)=>r.left>=o.left-1.5&&r.right<=o.right+1.5&&r.top>=o.top-1.5&&r.bottom<=o.bottom+1.5;
    const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
    return {scroll:document.documentElement.scrollWidth,viewport:innerWidth,overflow:getComputedStyle(parent).overflowY,
      rows:rows.map(row=>{
        const left=row.children[0],status=row.children[1],actions=left.querySelector('.session-actions'),meta=left.querySelector('.meta');
        const buttons=[...actions.querySelectorAll('button')],pills=[...status.querySelectorAll('.pill')];
        const parts=[...buttons,...pills], rr=rect(row),mr=rect(meta),nr=rect(left.querySelector('b'));
        return {inCell:actions.parentElement===left,
          clipped:![...parts,left.querySelector('b')].every(e=>within(rect(e),rr)),
          overlap:parts.some((e,i)=>parts.slice(i+1).some(f=>overlaps(rect(e),rect(f)))),
          sameLine:buttons.every(b=>Math.abs((rect(b).top+rect(b).bottom)/2-(mr.top+mr.bottom)/2)<18),
          badgeRight:pills.every(p=>rect(p).left>nr.right),
          visible:within(rr,rect(parent)),buttonCount:buttons.length,pillCount:pills.length};
      })};
   });
   assert.equal(result.rows.length,5,'Never silently hide historic records');
   assert.ok(result.scroll<=result.viewport+1,engine+' '+width+' horizontal overflow: '+JSON.stringify(result));
   assert.equal(result.overflow,'visible',engine+' '+width+' records inner clipping');
   assert.ok(result.rows.every(r=>r.inCell&&!r.clipped&&!r.overlap&&r.badgeRight&&r.visible),
     engine+' '+width+' button/pill clipped or misplaced: '+JSON.stringify(result));
   if(width>=393)assert.ok(result.rows.slice(0,3).every(r=>r.sameLine),
     engine+' '+width+' normal records MUST stay single-line: '+JSON.stringify(result));
   assert.equal(result.rows[0].buttonCount,2);
   assert.equal(result.rows[3].pillCount,2);
   assert.equal(result.rows[4].buttonCount,1);
   if(width===393)await page.screenshot({path:'qa-results/day-record-compact-'+engine+'-393-v358.png',fullPage:true});
   console.log('PASS '+engine+' '+width+'px compact row, status, correction controls');
   await page.close();
  }
 }finally{await browser.close()}
}
console.log('PASS preserved historic horizontal layout; no operating data writes');
