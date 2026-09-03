const puppeteer=require('puppeteer'); const path=require('path');
// 재현 가능한 Visual QA (백억커피 Design System V1 Phase 1)
//
// ⚠ 한계 명시: headless Chrome은 iOS Safari의 native control(input[type=month] 등)
// intrinsic width 렌더를 정확히 대표하지 못한다. 이 QA가 PASS해도
// "iOS Safari에서 시각적으로 해결됨"을 보장하지 않는다. 반드시 Jay의 실기기 재검수로 확정한다.
// (2026-09 교훈: grid cell gap 12px 측정 PASS했으나 실기기 month input이 cell을 넘쳐 붙어보임)
//
// 측정 원칙: wrapper(.field)가 아니라 실제 사용자가 보는 <input> border box(getBoundingClientRect)를 측정.
// overlap=FAIL, gap<TOKEN=FAIL, input이 grid cell을 넘침(input.right>cell.right)=FAIL.

const MIN_FIELD_GAP = 16; // --space-4 토큰 (mobile 여유)

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
        <div class="form-grid-2" id="qaGrid">
          <div class="field" id="qaCell1"><label>정산 월</label><input id="qaMonth" type="month" value="2026-09"></div>
          <div class="field" id="qaCell2"><label>주휴 주 수</label><input id="qaWeeks" placeholder="4"></div>
        </div>
        <div class="btn-pair" id="qaPair1">
          <button class="btn btn-primary" id="qaClose">2026-09 급여 마감</button>
          <button class="btn btn-secondary" id="qaExport">Excel 미리 출력</button>
        </div>
        <div class="btn-pair" id="qaPair3" style="margin-top:8px">
          <button class="btn btn-primary" id="qaApprove">승인</button>
          <button class="btn btn-danger" id="qaReject">반려</button>
        </div>`;
      document.body.appendChild(host);
      const R=id=>document.getElementById(id).getBoundingClientRect();
      const overlap=(a,b)=>!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
      const out={checks:[]};
      // === 실제 <input> border box 측정 (wrapper 아님) ===
      const mo=R('qaMonth'), wk=R('qaWeeks');
      const cell1=R('qaCell1'), cell2=R('qaCell2');
      const gap=+(wk.left-mo.right).toFixed(1);
      out.checks.push({name:'input overlap 없음', pass:!overlap(mo,wk), detail:`gap=${gap}`});
      out.checks.push({name:`input border 간 gap>=${MIN_FIELD_GAP}px`, pass:gap>=MIN_FIELD_GAP, detail:`gap=${gap}px`});
      // 핵심: input이 자기 grid cell 안에 갇혔는지 (iOS 넘침 방지 검증)
      out.checks.push({name:'month input이 cell 안에 포함', pass:mo.right<=cell1.right+1, detail:`input.right=${mo.right.toFixed(0)} cell.right=${cell1.right.toFixed(0)}`});
      out.checks.push({name:'weeks input이 cell 안에 포함', pass:wk.right<=cell2.right+1, detail:`input.right=${wk.right.toFixed(0)} cell.right=${cell2.right.toFixed(0)}`});
      // peer 버튼 geometry (회귀 확인)
      const c=R('qaClose'), e=R('qaExport');
      out.checks.push({name:'마감/Excel geometry 일치', pass:Math.abs(c.height-e.height)<0.5&&Math.abs(c.width-e.width)<0.5, detail:`${c.width.toFixed(0)}x${c.height.toFixed(0)} vs ${e.width.toFixed(0)}x${e.height.toFixed(0)}`});
      const ap=R('qaApprove'), rj=R('qaReject');
      out.checks.push({name:'승인/반려 geometry 일치', pass:Math.abs(ap.height-rj.height)<0.5&&Math.abs(ap.width-rj.width)<0.5, detail:`${ap.width.toFixed(0)}x${ap.height.toFixed(0)} vs ${rj.width.toFixed(0)}x${rj.height.toFixed(0)}`});
      host.remove();
      return out;
    }, MIN_FIELD_GAP);
    console.log(`\n=== ${name} (${w}x${h}) ===`);
    for(const c of res.checks){ const ok=c.pass?'✓':'✗ FAIL'; if(!c.pass)allPass=false; console.log(`  ${ok} ${c.name} [${c.detail}]`); }
    await p.close();
  }
  console.log('\n'+(allPass?'★ VISUAL QA PASS (단 iOS 실기기 재검수 필수)':'✗ SOME FAILED'));
  process.exit(allPass?0:1);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
