const puppeteer=require('puppeteer'); const path=require('path');
// 재현 가능한 Visual QA: peer geometry / field intersection / text clip
function rectsOverlap(a,b){ return !(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top); }
(async()=>{
  const b=await puppeteer.launch({headless:'new',executablePath:'/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',args:['--no-sandbox','--disable-setuid-sandbox']});
  const viewports=[[390,844,'iphone390'],[430,932,'iphone430'],[1024,768,'pos1024']];
  let allPass=true;
  for(const [w,h,name] of viewports){
    const p=await b.newPage(); await p.setViewport({width:w,height:h});
    await p.goto('file://'+path.resolve('index.html'),{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,300));
    const res=await p.evaluate(()=>{
      // 급여 화면 핵심 컴포넌트를 primitive로 구성해 실제 렌더 검사
      const host=document.createElement('div');
      host.style.cssText='padding:16px;background:#fff';
      host.innerHTML=`
        <div class="form-grid-2">
          <div class="field"><label>정산 월</label><input id="qaMonth" type="month" value="2026-09"></div>
          <div class="field"><label>주휴 주 수</label><input id="qaWeeks" placeholder="4"></div>
        </div>
        <div class="kpi-row"><div class="kpi-label">세후 합계</div><div class="kpi-value">1,234,000원</div></div>
        <div class="btn-pair" id="qaPair1">
          <button class="btn btn-primary" id="qaClose">2026-09 급여 마감</button>
          <button class="btn btn-secondary" id="qaExport">Excel 미리 출력</button>
        </div>
        <div class="btn-pair" id="qaPair2" style="margin-top:8px">
          <button class="btn btn-secondary btn-sm" id="qaAdj">이달 조정</button>
          <button class="btn btn-secondary btn-sm" id="qaEdit">기본설정</button>
        </div>
        <button class="btn btn-secondary btn-block" id="qaSync" style="margin-top:8px">구글시트 갱신</button>`;
      document.body.appendChild(host);
      const R=id=>document.getElementById(id).getBoundingClientRect();
      const overlap=(a,b)=>!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
      const out={checks:[]};
      // 1. form field intersection (정산월 vs 주휴)
      const mo=R('qaMonth'), wk=R('qaWeeks');
      out.checks.push({name:'form field 비겹침', pass:!overlap(mo,wk), detail:`month.right=${mo.right.toFixed(0)} weeks.left=${wk.left.toFixed(0)}`});
      // 2. field가 부모 폭 안에 포함
      const host_r=host.getBoundingClientRect();
      out.checks.push({name:'field 부모폭 내포함', pass:wk.right<=host_r.right+1, detail:`weeks.right=${wk.right.toFixed(0)} host.right=${host_r.right.toFixed(0)}`});
      // 3. peer 버튼 geometry (마감 vs Excel) height 일치
      const c=R('qaClose'), e=R('qaExport');
      out.checks.push({name:'마감/Excel height 일치', pass:Math.abs(c.height-e.height)<0.5, detail:`close.h=${c.height.toFixed(1)} export.h=${e.height.toFixed(1)}`});
      out.checks.push({name:'마감/Excel width 일치', pass:Math.abs(c.width-e.width)<0.5, detail:`close.w=${c.width.toFixed(1)} export.w=${e.width.toFixed(1)}`});
      // 4. peer 버튼 top 정렬
      out.checks.push({name:'마감/Excel 수직정렬', pass:Math.abs(c.top-e.top)<0.5, detail:`close.top=${c.top.toFixed(1)} export.top=${e.top.toFixed(1)}`});
      // 5. 이달조정/기본설정 peer 일치
      const a=R('qaAdj'), ed=R('qaEdit');
      out.checks.push({name:'조정/설정 height 일치', pass:Math.abs(a.height-ed.height)<0.5, detail:`adj.h=${a.height.toFixed(1)} edit.h=${ed.height.toFixed(1)}`});
      // 6. text clipping (마감 버튼 내용 안 잘림): scrollWidth <= clientWidth
      const cb=document.getElementById('qaClose');
      out.checks.push({name:'마감버튼 텍스트 비잘림', pass:cb.scrollWidth<=cb.clientWidth+1, detail:`scroll=${cb.scrollWidth} client=${cb.clientWidth}`});
      host.remove();
      return out;
    });
    console.log(`\n=== ${name} (${w}x${h}) ===`);
    for(const c of res.checks){ const ok=c.pass?'✓':'✗ FAIL'; if(!c.pass)allPass=false; console.log(`  ${ok} ${c.name} [${c.detail}]`); }
    await p.close();
  }
  console.log('\n'+(allPass?'★ ALL VISUAL QA PASS':'✗ SOME FAILED'));
  await b.close();
})().catch(e=>console.error('FAIL',e.message));
