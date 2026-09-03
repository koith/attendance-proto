const puppeteer=require('puppeteer'); const path=require('path');
// 재현 가능한 Visual QA (백억커피 Design System V1 Phase 1)
// 검사: overlap / min-gap(spacing token) / peer geometry / text clip
// 판정 원칙: overlap=FAIL, gap<TOKEN=FAIL(붙어보임), token 이상=PASS
// scrollWidth<=viewport 단독 판정 금지. 실제 element geometry/gap/wrap/clip 검사.

const MIN_FIELD_GAP = 12; // --space-3 토큰. 두 form field 사이 최소 시각 간격.

(async()=>{
  const b=await puppeteer.launch({headless:'new',
    executablePath:'/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
    args:['--no-sandbox','--disable-setuid-sandbox']});
  const viewports=[[390,844,'iphone390'],[430,932,'iphone430'],[1024,768,'pos1024']];
  let allPass=true;
  for(const [w,h,name] of viewports){
    const p=await b.newPage(); await p.setViewport({width:w,height:h});
    await p.goto('file://'+path.resolve('index.html'),{waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,300));
    const res=await p.evaluate((MIN_FIELD_GAP)=>{
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
        <div class="btn-pair" id="qaPair3" style="margin-top:8px">
          <button class="btn btn-primary" id="qaApprove">승인</button>
          <button class="btn btn-danger" id="qaReject">반려</button>
        </div>`;
      document.body.appendChild(host);
      const R=id=>document.getElementById(id).getBoundingClientRect();
      const overlap=(a,b)=>!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
      const out={checks:[]};
      const mo=R('qaMonth'), wk=R('qaWeeks');
      const gap=+(wk.left-mo.right).toFixed(1);
      out.checks.push({name:'form field overlap 없음', pass:!overlap(mo,wk), detail:`gap=${gap}`});
      out.checks.push({name:`form field gap>=${MIN_FIELD_GAP}px(토큰)`, pass:gap>=MIN_FIELD_GAP, detail:`gap=${gap}px`});
      const host_r=host.getBoundingClientRect();
      out.checks.push({name:'field 부모폭 내포함', pass:wk.right<=host_r.right+1, detail:`weeks.right=${wk.right.toFixed(0)} host.right=${host_r.right.toFixed(0)}`});
      const c=R('qaClose'), e=R('qaExport');
      out.checks.push({name:'마감/Excel height 일치', pass:Math.abs(c.height-e.height)<0.5, detail:`${c.height.toFixed(1)} vs ${e.height.toFixed(1)}`});
      out.checks.push({name:'마감/Excel width 일치', pass:Math.abs(c.width-e.width)<0.5, detail:`${c.width.toFixed(1)} vs ${e.width.toFixed(1)}`});
      out.checks.push({name:'마감/Excel 수직정렬', pass:Math.abs(c.top-e.top)<0.5, detail:`${c.top.toFixed(1)} vs ${e.top.toFixed(1)}`});
      const a=R('qaAdj'), ed=R('qaEdit');
      out.checks.push({name:'조정/설정 height 일치', pass:Math.abs(a.height-ed.height)<0.5, detail:`${a.height.toFixed(1)} vs ${ed.height.toFixed(1)}`});
      const ap=R('qaApprove'), rj=R('qaReject');
      out.checks.push({name:'승인/반려 height 일치', pass:Math.abs(ap.height-rj.height)<0.5, detail:`${ap.height.toFixed(1)} vs ${rj.height.toFixed(1)}`});
      out.checks.push({name:'승인/반려 width 일치', pass:Math.abs(ap.width-rj.width)<0.5, detail:`${ap.width.toFixed(1)} vs ${rj.width.toFixed(1)}`});
      const cb=document.getElementById('qaClose');
      out.checks.push({name:'마감버튼 텍스트 비잘림', pass:cb.scrollWidth<=cb.clientWidth+1, detail:`scroll=${cb.scrollWidth} client=${cb.clientWidth}`});
      host.remove();
      return out;
    }, MIN_FIELD_GAP);
    console.log(`\n=== ${name} (${w}x${h}) ===`);
    for(const c of res.checks){ const ok=c.pass?'✓':'✗ FAIL'; if(!c.pass)allPass=false; console.log(`  ${ok} ${c.name} [${c.detail}]`); }
    await p.close();
  }
  console.log('\n'+(allPass?'★ ALL VISUAL QA PASS':'✗ SOME FAILED'));
  process.exit(allPass?0:1);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
