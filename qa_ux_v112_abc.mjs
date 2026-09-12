import fs from 'node:fs';
import assert from 'node:assert/strict';
const r=p=>fs.readFileSync(p,'utf8');
let pass=0;const t=(n,f)=>{f();pass++;console.log('PASS',n)};
const idx=r('index.html'),ec=r('employment_contracts_v3.js'),css=r('employment_contracts.css'),dj=r('daily_schedule.js'),mj=r('monthly_schedule.js');

t('finite employment period bounds a new contract end date',()=>{
  assert(ec.includes("p_effective_from:c?.effective_from??p.started_on"));
  assert(ec.includes("p_effective_to:c?.effective_to??p.ended_on??null"));
});

t('HOURLY save keeps workday and positive wage validation without 15h gate',()=>{
  assert(ec.includes("if(S.payrollType==='HOURLY'){workdays=collectWorkdays();if(!workdays.length)throw Error('근무요일을 선택해주세요.')"));
  assert(ec.includes("if(S.payrollType==='HOURLY'&&(!wage||wage<=0))"));
  assert(!ec.includes('15시간'));
  assert(!ec.includes('900'));
});

t('BUSINESS_INCOME percentage remains percent-to-rate conversion',()=>{
  assert(ec.includes("if(S.taxTreatment==='BUSINESS_INCOME')"));
  assert(ec.includes('rate=pct/100'));
  assert(ec.includes('p_business_deduction_rate:rate'));
});

t('server validation errors are no longer collapsed into generic input blame',()=>{
  assert(ec.includes('function contractSaveErrorMessage(code)'));
  assert(ec.includes("CONTRACT_OUTSIDE_EMPLOYMENT:'계약기간이 고용기간을 벗어났습니다. 고용기간을 확인해주세요.'"));
  assert(ec.includes("CONTRACT_OVERLAP:'같은 기간에 적용되는 계약이 이미 있습니다.'"));
  assert(ec.includes("console.error('[contract-save]',e)"));
  assert(!ec.includes("catch(e){toast('저장하지 못했습니다. 입력값을 확인해주세요.',true)}"));
});

t('successful save is read back from employment bundle',()=>{
  assert(ec.includes('await loadBundle()'));
  assert(ec.includes("if(!S.bundle.contracts.some(x=>Number(x.id)===Number(r.id)))throw Error('READBACK_FAILED')"));
});

t('employment date value is rendered by a deterministic centered overlay',()=>{
  assert(css.includes('.date-shell{position:relative;height:46px;min-height:46px'));
  assert(css.includes('.date-shell-value{position:absolute'));
  assert(css.includes('top:50%;transform:translateY(-50%)'));
  assert(css.includes('-webkit-text-fill-color:transparent!important'));
  assert(ec.includes('function enhanceDateInput(input)'));
  assert(ec.includes("enhanceDateInput(el('periodStart'))"));
  assert(ec.includes("enhanceDateInput(el('periodEnd'))"));
});

t('history heading uses the same card inset as its body',()=>{
  assert(css.includes('.advanced>h2{padding:14px 14px 0;margin-bottom:12px}'));
  assert(css.includes('.advanced-body{padding:0 14px 14px}'));
});

t('pending UX is one static section status plus the real cards',()=>{
  assert(idx.includes('<div class="admin-pending-head" id="attendanceAlert"><span>직원 정정요청</span><span class="pending-badge" id="attendanceAlertText">0건</span></div>'));
  assert(idx.includes('reqs=await BE.pendingRequests()'));
  assert(idx.includes('alertText.textContent=`${reqs.length}건`'));
  assert(idx.includes('for(const r of reqs)'));
  assert(!idx.includes('id="attendanceAlert" href='));
  assert(!idx.includes('sec.scrollIntoView({behavior:"smooth"'));
  assert(!idx.includes('sec.innerHTML=`<div class="section-t">직원 정정요청</div>`'));
});

t('zero pending remains non-actionable and creates no alternate count store',()=>{
  assert(idx.includes('if(!reqs||!reqs.length){ sec.innerHTML=""; return; }'));
  assert(idx.includes('alert.classList.toggle("quiet",!reqs.length)'));
  assert.equal((idx.match(/BE\.pendingRequests\(\)/g)||[]).length,1);
});

t('protected schedule RPC surfaces are unchanged',()=>{
  assert(dj.includes("rpc('admin_schedule_set'"));
  assert(dj.includes("rpc('admin_schedule_delete'"));
  assert(mj.includes('BE.scheduleBatch(payload)'));
});

console.log(`UX V1.1.2 ABC repair QA: ${pass} PASS`);
