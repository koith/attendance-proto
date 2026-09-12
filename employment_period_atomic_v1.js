/* Quick Fix Pack 2: new employment period is only persisted together with its first contract. */
(()=>{
  if(window.__baekeokAtomicEmploymentPeriod)return;
  window.__baekeokAtomicEmploymentPeriod=true;

  S.pendingNewPeriod=null;
  const baseCurrentPeriod=currentPeriod;
  const baseHistoryCard=historyCard;
  const baseBindHistory=bindHistory;
  const baseSavePeriod=savePeriod;
  const baseContractSet=BE.contractSet;

  currentPeriod=function(){
    return S.pendingNewPeriod||baseCurrentPeriod();
  };

  historyCard=function(p,c){
    if(S.pendingNewPeriod){
      const d=S.pendingNewPeriod;
      return `<section class="card advanced" id="history">
        <h2>새 고용기간</h2>
        <div class="advanced-body lifecycle-editor">
          <div class="status-line">${escapeHtml(d.started_on)} ~ ${escapeHtml(d.ended_on||'재직중')}</div>
          ${d.note?`<div class="hint">${escapeHtml(d.note)}</div>`:''}
          <div class="hint">위 계약조건을 입력하고 저장하면 고용기간과 첫 계약이 함께 등록됩니다.</div>
          <div class="actions"><button class="btn" id="cancelPendingPeriod">취소</button></div>
        </div>
      </section>`;
    }
    return baseHistoryCard(p,c);
  };

  bindHistory=function(p){
    if(S.pendingNewPeriod){
      const cancel=el('cancelPendingPeriod');
      if(cancel)cancel.onclick=()=>{
        S.pendingNewPeriod=null;
        S.creatingPeriod=false;
        S.creatingContract=false;
        S.periodId=null;
        S.contractId=null;
        S.loadedContractId=null;
        S.historyMode='list';
        hydrate(null);
        render();
      };
      return;
    }
    baseBindHistory(p);
  };

  savePeriod=async function(){
    if(!S.creatingPeriod)return baseSavePeriod();
    if(S.busy)return;
    const start=el('periodStart')?.value||'';
    const end=el('periodEnd')?.value||null;
    if(!start)return toast('입사일을 입력해주세요.',true);
    if(end&&end<start)return toast('퇴사일을 확인해주세요.',true);
    S.pendingNewPeriod={
      id:null,
      employee_id:S.employeeId,
      started_on:start,
      ended_on:end,
      note:el('periodNote')?.value.trim()||null,
      __pending:true
    };
    S.creatingPeriod=false;
    S.creatingContract=true;
    S.periodId=null;
    S.contractId=null;
    S.loadedContractId=null;
    S.historyMode='periodDetail';
    hydrate(null);
    render();
    toast('계약조건을 입력하면 등록이 완료됩니다.');
  };

  BE.contractSet=async function(args){
    const d=S.pendingNewPeriod;
    if(!d)return baseContractSet(args);
    const r=await rpc('admin_employment_period_contract_create',{
      p_employee_id:S.employeeId,
      p_started_on:d.started_on,
      p_ended_on:d.ended_on,
      p_period_note:d.note,
      p_effective_from:d.started_on,
      p_effective_to:d.ended_on,
      p_payroll_type:args.p_payroll_type,
      p_hourly_wage:args.p_hourly_wage,
      p_monthly_salary:args.p_monthly_salary,
      p_tax_treatment:args.p_tax_treatment,
      p_business_deduction_rate:args.p_business_deduction_rate,
      p_night_allowance_enabled:args.p_night_allowance_enabled,
      p_night_allowance_mode:args.p_night_allowance_mode,
      p_night_allowance_value:args.p_night_allowance_value,
      p_night_allowance_start:args.p_night_allowance_start,
      p_contract_memo:args.p_memo,
      p_workdays:args.p_workdays
    });
    if(!r?.ok)return r;
    S.periodId=Number(r.period_id);
    S.pendingNewPeriod=null;
    return {ok:true,id:Number(r.contract_id),weekly_contracted_minutes:r.weekly_contracted_minutes};
  };
})();
