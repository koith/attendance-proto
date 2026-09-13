/* Payroll V1.1: contract is authoritative for recurring payroll terms.
   Existing payroll formula is preserved. Monthly salary / four-insurance semantics remain blocked until policy is finalized. */
(()=>{
  if(globalThis.__baekeokPayrollContractAuthorityV1)return;
  globalThis.__baekeokPayrollContractAuthorityV1=true;
  if(typeof computeMonthPayroll!=='function'||typeof drawPay!=='function'||typeof calcPayroll!=='function')return;

  const baseComputeMonthPayroll=computeMonthPayroll;
  const baseDrawPay=drawPay;
  const baseOpenMonthAdjust=openMonthAdjust;
  const cache=new Map();
  let lastResult=null,refreshBusy=false;

  const p2=n=>String(n).padStart(2,'0');
  const dayKey=d=>d?`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`:'';
  const monthBounds=ym=>{const [y,m]=String(ym).split('-').map(Number);return {first:`${ym}-01`,last:`${y}-${p2(m)}-${p2(new Date(y,m,0).getDate())}`}};
  const overlaps=(c,b)=>String(c.effective_from)<=b.last&&(!c.effective_to||String(c.effective_to)>=b.first);
  const covers=(c,d)=>d&&String(c.effective_from)<=d&&(!c.effective_to||String(c.effective_to)>=d);
  const termsKey=c=>[c.payroll_type,c.hourly_wage,c.monthly_salary,c.weekly_contracted_minutes,c.tax_treatment,c.business_deduction_rate,c.night_allowance_enabled,c.night_allowance_mode,c.night_allowance_value,c.night_allowance_start].join('|');
  async function bundle(empId){
    const key=Number(empId);if(cache.has(key))return cache.get(key);
    const v=await rpc('admin_employment_bundle',{p_employee_id:key},true);cache.set(key,v||{contracts:[],periods:[],workdays:[]});return cache.get(key);
  }
  function safeOverride(ov){
    if(!ov)return null;
    const out={};
    if(ov.juhyu_weeks_override!=null)out.juhyu_weeks_override=ov.juhyu_weeks_override;
    if(ov.adjust_amount!=null)out.adjust_amount=ov.adjust_amount;
    if(ov.memo!=null)out.memo=ov.memo;
    return Object.keys(out).length?out:null;
  }
  function chooseContract(row,ym,b){
    const contracts=(b.contracts||[]).filter(c=>overlaps(c,monthBounds(ym))).sort((a,z)=>String(z.effective_from).localeCompare(String(a.effective_from)));
    if(!contracts.length)return {mode:'LEGACY',issue:'계약조건 미등록 · 기존 급여설정으로 임시 계산'};
    const complete=(row.sessions||[]).filter(s=>s.status==='COMPLETE'&&s.in);
    const used=contracts.filter(c=>complete.some(s=>covers(c,dayKey(s.in))));
    const candidates=used.length?used:contracts;
    const displayContract=candidates[0]||contracts[0]||null;
    if(candidates.some(c=>c.payroll_type==='MONTHLY'))return {mode:'BLOCKED',contract:displayContract,issue:'월급제 급여 계산정책 미확정'};
    if(candidates.some(c=>c.tax_treatment==='FOUR_INSURANCE'))return {mode:'BLOCKED',contract:displayContract,issue:'4대보험 공제 계산정책 미확정'};
    if(candidates.some(c=>c.payroll_type!=='HOURLY'||c.tax_treatment!=='BUSINESS_INCOME'))return {mode:'BLOCKED',contract:displayContract,issue:'급여 계약조건 확인 필요'};
    const uncoveredDays=[...new Set(complete.filter(s=>!contracts.some(c=>covers(c,dayKey(s.in)))).map(s=>dayKey(s.in)))];
    if(uncoveredDays.length)return {mode:'BLOCKED',contract:displayContract,issue:`계약기간 밖 실근무 ${uncoveredDays.join(', ')} · 급여 확인 필요`};
    const keys=new Set(candidates.map(termsKey));
    if(keys.size>1)return {mode:'BLOCKED',contract:displayContract,issue:'월중 계약조건 변경 · 구간별 급여 계산 확인 필요'};
    return {mode:'CONTRACT',contract:candidates[0]};
  }
  function contractEmployee(emp,c){
    return {...emp,
      wage:Number(c.hourly_wage||0),
      juhyu_hours:Number(c.weekly_contracted_minutes||0)/60/5,
      tax_rate:Number(c.business_deduction_rate||0)
    };
  }
  function contractSummary(c){
    if(!c)return '';
    const period=`${c.effective_from}${c.effective_to?' ~ '+c.effective_to:''}`;
    if(c.payroll_type==='HOURLY')return `계약 시급 ${Number(c.hourly_wage||0).toLocaleString()}원 · ${period}`;
    return `계약 월급 ${Number(c.monthly_salary||0).toLocaleString()}원 · ${period}`;
  }

  computeMonthPayroll=async function(ym){
    const R=await baseComputeMonthPayroll(ym);
    if(!LIVE){lastResult=R;return R;}
    cache.clear();
    let totalNet=0,totalGross=0;
    await Promise.all(R.rows.map(async row=>{
      try{
        const b=await bundle(row.employee_id),pick=chooseContract(row,ym,b);
        row.contractMode=pick.mode;row.contractIssue=pick.issue||null;row.contract=pick.contract||null;
        if(pick.mode==='CONTRACT'){
          const ov=safeOverride(row.ov),emp=contractEmployee(row.emp,pick.contract);
          row.ov=ov;row.pay=calcPayroll(emp,row.hours,R.weeks,ov);row.hasWage=!!row.pay?.wage;
          row.memo=(ov&&ov.memo)||row.emp.memo||'';
        }else if(pick.mode==='BLOCKED'){
          row.pay=null;row.hasWage=false;
        }
      }catch(e){console.error('[payroll-contract-authority]',row.employee_id,e);row.contractMode='ERROR';row.contractIssue='계약조건을 불러오지 못했습니다.';}
      if(row.pay){totalNet+=row.pay.net;totalGross+=row.pay.gross;}
    }));
    R.totalNet=totalNet;R.totalGross=totalGross;lastResult=R;return R;
  };

  function annotatePayroll(){
    const box=document.getElementById('payList');if(!box||!lastResult)return;
    const rows=[...box.children].filter(x=>x.classList?.contains('row')).slice(0,lastResult.rows.length);
    rows.forEach((card,i)=>{
      const rec=lastResult.rows[i];if(!rec)return;
      const edit=card.querySelector('[data-edit]');
      if(edit){
        if(rec.contractMode==='LEGACY'){
          edit.textContent='계약 등록';
          edit.onclick=()=>{location.href=`employment_contracts.html?employee=${rec.employee_id}&from=admin`};
        }else edit.remove();
      }
      const head=card.querySelector('.nm');
      if(head&&rec.contractMode==='CONTRACT'&&!head.querySelector('.contract-source-badge')){
        const b=document.createElement('span');b.className='badge contract-source-badge';b.style.cssText='margin-left:6px;color:var(--accent);border-color:var(--accent)';b.textContent='계약 기준';head.appendChild(b);
      }
      if(rec.contract){
        const s=document.createElement('div');s.className='payroll-contract-summary';s.style.cssText='font-size:.8rem;color:var(--text);font-weight:650;margin-top:2px';s.textContent=contractSummary(rec.contract);card.appendChild(s);
      }
      if(rec.contractIssue){
        const n=document.createElement('div');n.className='payroll-contract-note';n.style.cssText='font-size:.78rem;color:var(--warning);font-weight:650;margin-top:2px';n.textContent=rec.contractIssue;card.appendChild(n);
      }
    });
    const old=document.getElementById('payrollContractSourceNote');old?.remove();
    const note=document.createElement('div');note.id='payrollContractSourceNote';note.style.cssText='font-size:.76rem;color:var(--text-muted);margin:0 2px 12px';
    note.textContent='시급·계약 주당시간·세금 방식은 직원 계약조건을 기준으로 계산합니다. 계약기간 밖 실근무가 있으면 계약정보는 표시하되 급여 확정은 막습니다.';
    box.parentElement?.insertBefore(note,box);
  }

  drawPay=async function(ym){await baseDrawPay(ym);annotatePayroll()};

  openMonthAdjust=function(emp,ym,ov){
    baseOpenMonthAdjust(emp,ym,ov);
    const modal=document.getElementById('addVeil')?.querySelector('.modal');if(!modal)return;
    ['maWage','maJh','maTax'].forEach(id=>{const f=document.getElementById(id)?.closest('.field');if(f)f.style.display='none'});
    const title=modal.querySelector('h3');if(title){const n=document.createElement('div');n.style.cssText='font-size:.78rem;color:var(--text-muted);margin:-8px 0 12px';n.textContent='시급·주휴시간·세율은 계약조건에서 가져옵니다. 기존 중복 override 값은 보존되지만 계산에는 사용하지 않습니다.';title.after(n)}
  };

  if(document.getElementById('payList')){const m=document.getElementById('payMonth');if(m)drawPay(m.value)}
  const refresh=async()=>{
    const list=document.getElementById('payList'),m=document.getElementById('payMonth');
    if(!list||!m||document.visibilityState!=='visible'||refreshBusy)return;
    if(document.getElementById('addVeil')?.classList.contains('show'))return;
    refreshBusy=true;try{await drawPay(m.value)}finally{refreshBusy=false}
  };
  setInterval(refresh,60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
})();
