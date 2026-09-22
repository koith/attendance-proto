/* 매장운영 V1: UI/조회 계층. 원천수집기는 다음 단계에서 각 소스별 어댑터로 연결한다. */
(function(){
  const state={tab:"dashboard"};
  const won=n=>Number(n||0).toLocaleString("ko-KR")+"원";
  const esc=v=>window.safeHtml?window.safeHtml(v):String(v??"");
  function monthRange(){
    const d=window.kstNow?window.kstNow():new Date(),p=n=>String(n).padStart(2,"0");
    const from=`${d.getFullYear()}-${p(d.getMonth()+1)}-01`;
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    return [from,`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(last)}`];
  }
  function shell(){
    const [f,t]=monthRange();
    view.innerHTML=`<div class="ops-head"><div><h2>매장운영</h2><p>매출 · 매입 · 재고를 한 곳에서 관리합니다.</p></div></div>
    <div class="ops-tabs">
      <button class="ops-tab on" data-ops="dashboard">대시보드</button><button class="ops-tab" data-ops="sales">매출</button><button class="ops-tab" data-ops="purchase">매입</button><button class="ops-tab" data-ops="inventory">재고</button><button class="ops-tab" data-ops="connect">데이터 연동</button>
    </div>
    <div class="ops-filter"><div><label>시작일</label><input id="opsFrom" type="date" value="${f}"></div><div><label>종료일</label><input id="opsTo" type="date" value="${t}"></div><button class="btn btn-primary" id="opsRefresh">조회</button></div>
    <div id="opsBody"></div>`;
    document.querySelectorAll(".ops-tab").forEach(b=>b.onclick=()=>{state.tab=b.dataset.ops;document.querySelectorAll(".ops-tab").forEach(x=>x.classList.toggle("on",x===b));draw();});
    document.getElementById("opsRefresh").onclick=draw; draw();
  }
  async function draw(){
    const body=document.getElementById("opsBody"); if(!body)return;
    body.innerHTML='<div class="ops-empty">불러오는 중…</div>';
    try{
      const f=document.getElementById("opsFrom").value,t=document.getElementById("opsTo").value;
      if(!f||!t||t<f) throw new Error("조회 기간을 확인하세요.");
      if(state.tab==="dashboard"){
        const s=await BE.operationsSummary(f,t);
        body.innerHTML=`<div class="ops-kpis"><div class="ops-kpi primary"><span>매출</span><b>${won(s.sales)}</b></div><div class="ops-kpi"><span>매입</span><b>${won(s.purchases)}</b></div><div class="ops-kpi"><span>환불</span><b>${won(s.refunds)}</b></div><div class="ops-kpi"><span>등록 재고품목</span><b>${Number(s.active_items||0).toLocaleString()}개</b></div></div>
        <div class="ops-card"><div class="ops-card-head"><span class="ops-card-title">데이터 현황</span></div><div class="ops-row"><div class="ops-row-main"><b>표준 거래원장</b><small>선택 기간의 정규화 거래</small></div><strong>${Number(s.transaction_count||0).toLocaleString()}건</strong></div><div class="ops-row"><div class="ops-row-main"><b>가져오기 작업</b><small>원천 데이터 수집 배치</small></div><strong>${Number(s.import_count||0).toLocaleString()}건</strong></div></div>`;
      }else if(state.tab==="sales"||state.tab==="purchase"){
        const typ=state.tab==="sales"?"SALE":"PURCHASE", rows=await BE.operationsTransactions(f,t,typ);
        body.innerHTML=rows.length?rows.map(r=>`<div class="ops-card"><div class="ops-card-head"><span class="ops-card-title">${esc(r.counterparty||r.channel||r.source||"거래")}</span><span class="ops-status ${r.status==="CONFIRMED"?"ok":""}">${esc(r.status)}</span></div><div class="ops-row"><div class="ops-row-main"><b>${esc(r.business_date)}</b><small>${esc(r.channel||r.source||"-")}</small></div><span class="ops-amount">${won(r.total_amount)}</span></div></div>`).join(""):'<div class="ops-empty">조회된 거래가 없습니다.</div>';
      }else if(state.tab==="inventory"){
        const rows=await BE.inventoryItems();
        body.innerHTML='<div class="ops-note">입고·판매사용·로스·실사조정을 하나의 재고원장으로 누적합니다. BOM/레시피는 유효기간별 버전을 보존합니다.</div>'+ (rows.length?rows.map(r=>`<div class="ops-card"><div class="ops-card-head"><span class="ops-card-title">${esc(r.name)}</span><span class="ops-status ${r.is_active?"ok":""}">${r.is_active?"사용중":"중지"}</span></div><div class="ops-row"><div class="ops-row-main"><b>${esc(r.sku)}</b><small>기준 단위 ${esc(r.unit)}</small></div><span class="ops-amount">${Number(r.on_hand||0).toLocaleString()} ${esc(r.unit)}</span></div></div>`).join(""):'<div class="ops-empty">등록된 재고 품목이 없습니다.</div>');
      }else{
        const rows=await BE.operationsImports();
        body.innerHTML=`<div class="ops-note">BizReport의 업로드/배치 UX를 가져오되 실제 연결은 우리 원천에 맞춰 분리합니다. 같은 원천 레코드는 고유키로 중복 적재되지 않습니다.</div><div class="ops-source-grid"><div class="ops-source"><b>KIS POS</b><small>매출·결제 원천 연결 예정</small></div><div class="ops-source"><b>배민</b><small>주문/집계 연결 예정</small></div><div class="ops-source"><b>땡겨요</b><small>매출·매입 자료 연결 예정</small></div><div class="ops-source"><b>온리원푸드넷</b><small>매입 자료 연결 예정</small></div><div class="ops-source"><b>쿠팡이츠</b><small>확보 가능한 원천부터 연결</small></div><div class="ops-source"><b>파일 업로드</b><small>CSV/XLSX staging 방식 예정</small></div></div><div style="height:12px"></div>`+(rows.length?rows.map(r=>`<div class="ops-card"><div class="ops-card-head"><span class="ops-card-title">${esc(r.source)}</span><span class="ops-status ${r.status==="COMPLETED"?"ok":""}">${esc(r.status)}</span></div><div class="ops-meta">${esc(r.file_name||"직접 연동")} · ${Number(r.row_count||0).toLocaleString()}건</div></div>`).join(""):'<div class="ops-empty">아직 가져오기 기록이 없습니다.</div>');
      }
    }catch(e){body.innerHTML=`<div class="ops-empty">불러오기 실패<br><small>${esc(e.message)}</small></div>`;}
  }
  window.renderOperations=shell;
})();