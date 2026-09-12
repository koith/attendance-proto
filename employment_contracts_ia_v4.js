/* UX V1.2: history is browse-first; lifecycle edit controls appear only after explicit drill-in. */
S.historyMode='list';

function historyContractSummary(c){
  if(!c)return '계약조건 없음';
  const pay=c.payroll_type==='HOURLY'
    ? `시급제 · ${Number(c.hourly_wage||0).toLocaleString()}원`
    : `월급제 · ${Number(c.monthly_salary||0).toLocaleString()}원`;
  return `${c.effective_from}${c.effective_to?' ~ '+c.effective_to:''} · ${pay}`;
}

historyCard=function(p,c){
  const ps=periods();
  const isNew=S.creatingPeriod;
  if(isNew){
    return `<section class="card advanced" id="history">
      <h2>새 고용기간</h2>
      <div class="advanced-body lifecycle-editor">
        <div class="grid2">
          <div class="field"><label>입사일</label><input id="periodStart" type="date" value=""></div>
          <div class="field"><label>퇴사일</label><input id="periodEnd" type="date" value=""></div>
        </div>
        <div class="field"><label>메모</label><textarea id="periodNote" rows="2" placeholder="필요한 내용만 기록"></textarea></div>
        <div class="actions"><button class="btn" id="cancelPeriod">취소</button><button class="btn primary" id="savePeriod">등록</button></div>
      </div>
    </section>`;
  }

  if(S.historyMode==='periodDetail' && p){
    const cs=periodContracts();
    return `<section class="card advanced" id="history">
      <div class="history-title-row"><h2>고용기간 상세</h2><button class="linkbtn" id="closePeriodDetail">‹ 이력</button></div>
      <div class="advanced-body lifecycle-editor">
        <div class="grid2">
          <div class="field"><label>입사일</label><input id="periodStart" type="date" value="${p.started_on||''}"></div>
          <div class="field"><label>퇴사일</label><input id="periodEnd" type="date" value="${p.ended_on||''}"></div>
        </div>
        <div class="field"><label>메모</label><textarea id="periodNote" rows="2" placeholder="필요한 내용만 기록">${escapeHtml(p.note||'')}</textarea></div>
        <button class="btn full" id="savePeriod">고용기간 변경 저장</button>
        <h3>계약조건 이력</h3>
        <div class="history-contract-list">${cs.length?cs.map(x=>`<button class="history-contract ${Number(x.id)===Number(S.contractId)?'on':''}" data-contract-view="${x.id}"><span>${escapeHtml(historyContractSummary(x))}</span><b>보기</b></button>`).join(''):'<div class="hint">등록된 계약조건이 없습니다.</div>'}</div>
        <div class="hint">계약조건 이력은 과거 기록 확인용입니다. 현재 선택한 계약조건은 위 화면에서 확인·저장합니다.</div>
      </div>
    </section>`;
  }

  return `<section class="card advanced" id="history">
    <h2>고용·계약 이력</h2>
    <div class="advanced-body history-browse">
      ${ps.length?`<div class="history-period-list">${ps.map(x=>{
        const cs=(S.bundle.contracts||[]).filter(k=>Number(k.employment_period_id)===Number(x.id)).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)));
        const latest=cs[0]||null;
        return `<button class="history-period ${Number(x.id)===Number(S.periodId)?'on':''}" data-period-detail="${x.id}">
          <span><b>${x.started_on} ~ ${x.ended_on||'재직중'}</b><small>${escapeHtml(historyContractSummary(latest))}${cs.length>1?` · 이력 ${cs.length}건`:''}</small></span><strong>상세 ›</strong>
        </button>`;
      }).join('')}</div>`:'<div class="hint">등록된 고용기간이 없습니다.</div>'}
      <button class="btn full history-new-period" id="newPeriod">+ 새 고용기간</button>
    </div>
  </section>`;
};

bindHistory=function(p){
  enhanceDateInput(el('periodStart'));enhanceDateInput(el('periodEnd'));
  document.querySelectorAll('[data-period-detail]').forEach(b=>b.onclick=()=>{
    S.creatingPeriod=false;S.creatingContract=false;S.periodId=Number(b.dataset.periodDetail);S.contractId=null;S.loadedContractId=null;S.historyMode='periodDetail';render();
  });
  document.querySelectorAll('[data-contract-view]').forEach(b=>b.onclick=()=>{
    S.creatingContract=false;S.contractId=Number(b.dataset.contractView);S.loadedContractId=null;render();window.scrollTo({top:0,behavior:'smooth'});
  });
  const close=el('closePeriodDetail');if(close)close.onclick=()=>{S.historyMode='list';render()};
  const np=el('newPeriod');if(np)np.onclick=()=>{S.historyMode='list';S.creatingPeriod=true;S.creatingContract=false;S.periodId=null;S.contractId=null;S.loadedContractId=null;render()};
  const cp=el('cancelPeriod');if(cp)cp.onclick=()=>{S.creatingPeriod=false;S.periodId=null;S.contractId=null;S.loadedContractId=null;S.historyMode='list';render()};
  const sp=el('savePeriod');if(sp)sp.onclick=savePeriod;
};

function returnToContractOrigin(){
  const from=new URLSearchParams(location.search).get('from');
  location.href=from==='employees'?'index.html?focus=employees#admin':'index.html#admin';
}

saveContract=async function(){
  if(S.busy)return;
  const p=currentPeriod(),c=currentContract();
  if(!p)return;
  const isFirstContract=!c?.id;
  let workdays=[];
  try{
    if(S.payrollType==='HOURLY'){
      workdays=collectWorkdays();
      if(!workdays.length)throw Error('근무요일을 선택해주세요.');
    }
  }catch(e){return toast(e.message,true)}
  const wage=S.payrollType==='HOURLY'?num(el('hourlyWage').value):null;
  const salary=S.payrollType==='MONTHLY'?num(el('monthlySalary').value):null;
  if(S.payrollType==='HOURLY'&&(!wage||wage<=0))return toast('시급을 입력해주세요.',true);
  if(S.payrollType==='MONTHLY'&&(!salary||salary<=0))return toast('월급액을 입력해주세요.',true);
  let rate=null;
  if(S.taxTreatment==='BUSINESS_INCOME'){
    const pct=num(el('businessRate').value);
    if(pct==null||pct<0||pct>100)return toast('공제율을 확인해주세요.',true);
    rate=pct/100;
  }
  const night=el('nightEnabled').checked,nmode=night?el('nightMode').value:null,nvalue=night?num(el('nightValue').value):null;
  if(night&&(nvalue==null||nvalue<0))return toast('야간수당 값을 입력해주세요.',true);
  S.busy=true;
  try{
    const r=await BE.contractSet({p_id:S.creatingContract?null:(c?.id||null),p_employment_period_id:p.id,p_effective_from:c?.effective_from??p.started_on,p_effective_to:c?.effective_to??p.ended_on??null,p_payroll_type:S.payrollType,p_hourly_wage:wage,p_monthly_salary:salary,p_tax_treatment:S.taxTreatment,p_business_deduction_rate:rate,p_night_allowance_enabled:night,p_night_allowance_mode:nmode,p_night_allowance_value:nvalue,p_night_allowance_start:night?(el('nightStart').value||'22:00'):'22:00',p_memo:el('contractMemo').value.trim()||null,p_workdays:workdays});
    if(!r?.ok)throw Error(r?.error||'SAVE_FAILED');
    S.creatingContract=false;S.contractId=Number(r.id);S.loadedContractId=null;
    await loadBundle();
    if(!S.bundle.contracts.some(x=>Number(x.id)===Number(r.id)))throw Error('READBACK_FAILED');
    toast('계약·급여조건을 저장했습니다.');
    if(isFirstContract)setTimeout(returnToContractOrigin,700);
  }catch(e){
    console.error('[contract-save]',e);toast(contractSaveErrorMessage(e?.message),true);
  }finally{S.busy=false}
};
