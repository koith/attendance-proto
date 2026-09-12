/* Contract schedule guard: WorkSchedule remains planned data, so contract-exception dates are allowed but explicit. */
BE.employmentBundle=id=>rpc('admin_employment_bundle',{p_employee_id:id});
S.contractBundles=new Map();
let contractGuardBusy=false;

async function ensureContractBundle(empId){
  empId=Number(empId||0);if(!empId)return null;
  if(S.contractBundles.has(empId))return S.contractBundles.get(empId);
  const b=await BE.employmentBundle(empId);
  const safe=b||{periods:[],contracts:[],workdays:[]};
  S.contractBundles.set(empId,safe);return safe;
}
function applicableContract(bundle,date){
  return [...(bundle?.contracts||[])].filter(c=>String(c.effective_from)<=date&&(!c.effective_to||String(c.effective_to)>=date)).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0]||null;
}
function contractIssue(bundle,date){
  const c=applicableContract(bundle,date);
  if(!c)return (bundle?.contracts||[]).length?'NO_APPLICABLE_CONTRACT':'NO_CONTRACT';
  if(c.payroll_type!=='HOURLY')return null;
  const allowed=new Set((bundle?.workdays||[]).filter(w=>Number(w.contract_id)===Number(c.id)).map(w=>Number(w.weekday)));
  return allowed.has(weekday(date))?null:'OUTSIDE_CONTRACT_WEEKDAY';
}
function contractWeekdayLabel(bundle,date){
  const c=applicableContract(bundle,date);if(!c||c.payroll_type!=='HOURLY')return'';
  const days=(bundle?.workdays||[]).filter(w=>Number(w.contract_id)===Number(c.id)).map(w=>Number(w.weekday)).sort((a,b)=>a-b);
  return days.map(x=>WD[x]).join('·');
}
async function issuesForPayload(payload){
  const work=(payload||[]).filter(x=>x&&x.op==='SET'&&x.status==='WORK');
  const ids=[...new Set(work.map(x=>Number(x.employee_id)))];
  await Promise.all(ids.map(ensureContractBundle));
  return work.map(x=>({row:x,issue:contractIssue(S.contractBundles.get(Number(x.employee_id)),x.work_date)})).filter(x=>x.issue);
}
function issueText(issues){
  const outside=issues.filter(x=>x.issue==='OUTSIDE_CONTRACT_WEEKDAY').length;
  const uncovered=issues.length-outside;
  const bits=[];if(outside)bits.push(`계약 외 요일 ${outside}일`);if(uncovered)bits.push(`계약 적용 밖 ${uncovered}일`);return bits.join(' · ');
}
async function decorateContractGuide(){
  if(mobile()&&S.step<3)return;
  const emp=currentEmp();if(!emp)return;
  let bundle;try{bundle=await ensureContractBundle(emp.id)}catch(_){return}
  const cal=document.querySelector('.calendar');
  if(cal){
    document.querySelectorAll('.calday[data-date]').forEach(b=>{
      const issue=contractIssue(bundle,b.dataset.date);
      b.classList.toggle('contract-extra',!!issue);
      b.classList.toggle('contract-day',!issue&&!!applicableContract(bundle,b.dataset.date));
    });
    const sample=monthDates(S.ym).find(d=>applicableContract(bundle,d)?.payroll_type==='HOURLY');
    if(sample){
      const head=document.querySelector('.weekday-head');
      let guide=document.getElementById('contractGuide');
      if(!guide&&head){guide=document.createElement('div');guide.id='contractGuide';guide.className='contract-guide';head.parentNode.insertBefore(guide,head)}
      if(guide){const guideHtml=`계약 근무요일 <b>${contractWeekdayLabel(bundle,sample)}</b><br><span>다른 요일도 대타·추가근무 일정으로 등록할 수 있습니다.</span>`;if(guide.innerHTML!==guideHtml)guide.innerHTML=guideHtml}
    }
    const selected=[...S.selected].map(d=>({d,issue:contractIssue(bundle,d)})).filter(x=>x.issue);
    let note=document.getElementById('contractExceptionNote');
    const count=document.querySelector('.selected-count');
    if(selected.length&&count){if(!note){note=document.createElement('div');note.id='contractExceptionNote';note.className='contract-exception-note';count.after(note)}const text=`⚠ ${issueText(selected.map(x=>({row:{},issue:x.issue})))} 포함 — 저장 시 확인합니다.`;if(note.textContent!==text)note.textContent=text}
    else if(note)note.remove();
  }
  const review=document.querySelector('.review');
  if(review){
    const payload=wizardProjectedPayload();
    const issues=await issuesForPayload(payload);
    let row=document.getElementById('contractReviewException');
    if(issues.length&&!row){row=document.createElement('div');row.id='contractReviewException';row.className='contract-review-exception';review.after(row)}
    if(row){if(issues.length){const text=`⚠ ${issueText(issues)} · 계약과 다른 예정근무입니다.`;if(row.textContent!==text)row.textContent=text}else row.remove()}
  }
}

/* Decorate only after the app's own render has completed. Do not observe app DOM mutations:
   the observer previously coupled contract decoration to wizard navigation and could interfere with
   the step-2 `날짜 선택` transition on iOS Safari. */
const baseRender=render;
render=function(){baseRender();if(!mobile()||S.step>=3)requestAnimationFrame(()=>{decorateContractGuide()})};
if(!mobile()||S.step>=3)requestAnimationFrame(()=>{decorateContractGuide()});

document.addEventListener('click',async e=>{
  const save=e.target.closest?.('#saveWizard');
  if(!save)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(contractGuardBusy)return;contractGuardBusy=true;
  try{
    const issues=await issuesForPayload(wizardProjectedPayload());
    if(issues.length&&!confirm(`${issueText(issues)}이 포함되어 있습니다.\n\n계약 근무요일은 주휴 기준이 되는 계약조건이고, 월간 스케줄은 대타·추가근무를 포함한 실제 예정근무입니다.\n\n이대로 일정으로 저장할까요?`))return;
    await saveWizard();
  }finally{contractGuardBusy=false}
},true);

document.addEventListener('click',async e=>{
  const save=e.target.closest?.('#saveDraft');
  if(!save||mobile())return;
  e.preventDefault();e.stopImmediatePropagation();
  if(contractGuardBusy)return;contractGuardBusy=true;
  try{
    const issues=await issuesForPayload(draftPayload());
    if(issues.length&&!confirm(`${issueText(issues)}이 포함되어 있습니다. 계약과 다른 예정근무로 저장할까요?`))return;
    await saveDraft();
  }finally{contractGuardBusy=false}
},true);
