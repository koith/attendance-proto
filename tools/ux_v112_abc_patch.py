from pathlib import Path


def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'missing patch target in {path}: {old[:80]!r}')
    if s.count(old)!=1:
        raise SystemExit(f'non-unique patch target in {path}: {s.count(old)}')
    p.write_text(s.replace(old,new,1))

# A: contract layout / iOS native date geometry
replace_once('employment_contracts.css',
'.advanced{padding:0}.advanced summary{cursor:pointer;list-style:none;padding:15px 14px;font-weight:700}.advanced summary::-webkit-details-marker{display:none}.advanced summary::after{content:\'›\';float:right;color:var(--muted)}.advanced[open] summary{border-bottom:1px solid var(--line)}.advanced-body{padding:0 14px 14px}.advanced-body h3:first-child{margin-top:14px}',
'.advanced{padding:0}.advanced>h2{padding:14px 14px 0;margin-bottom:12px}.advanced summary{cursor:pointer;list-style:none;padding:15px 14px;font-weight:700}.advanced summary::-webkit-details-marker{display:none}.advanced summary::after{content:\'›\';float:right;color:var(--muted)}.advanced[open] summary{border-bottom:1px solid var(--line)}.advanced-body{padding:0 14px 14px}.advanced-body h3:first-child{margin-top:14px}.field input[type="date"]{display:block;height:46px;min-height:46px;line-height:46px;padding-top:0;padding-bottom:0}.field input[type="date"]::-webkit-date-and-time-value{min-height:46px;line-height:46px;text-align:left;margin:0}.field input[type="date"]::-webkit-datetime-edit{padding:0}')

# B: finite employment period contract payload + actionable error mapping
p=Path('employment_contracts_v3.js'); s=p.read_text()
old="async function saveContract(){if(S.busy)return;const p=currentPeriod(),c=currentContract();if(!p)return;let workdays=[];try{if(S.payrollType==='HOURLY'){workdays=collectWorkdays();if(!workdays.length)throw Error('근무요일을 선택해주세요.')}}catch(e){return toast(e.message,true)}const wage=S.payrollType==='HOURLY'?num(el('hourlyWage').value):null,salary=S.payrollType==='MONTHLY'?num(el('monthlySalary').value):null;if(S.payrollType==='HOURLY'&&(!wage||wage<=0))return toast('시급을 입력해주세요.',true);if(S.payrollType==='MONTHLY'&&(!salary||salary<=0))return toast('월급액을 입력해주세요.',true);let rate=null;if(S.taxTreatment==='BUSINESS_INCOME'){const pct=num(el('businessRate').value);if(pct==null||pct<0||pct>100)return toast('공제율을 확인해주세요.',true);rate=pct/100}const night=el('nightEnabled').checked,nmode=night?el('nightMode').value:null,nvalue=night?num(el('nightValue').value):null;if(night&&(nvalue==null||nvalue<0))return toast('야간수당 값을 입력해주세요.',true);S.busy=true;try{const r=await BE.contractSet({p_id:S.creatingContract?null:(c?.id||null),p_employment_period_id:p.id,p_effective_from:c?.effective_from||p.started_on,p_effective_to:c?.effective_to||null,p_payroll_type:S.payrollType,p_hourly_wage:wage,p_monthly_salary:salary,p_tax_treatment:S.taxTreatment,p_business_deduction_rate:rate,p_night_allowance_enabled:night,p_night_allowance_mode:nmode,p_night_allowance_value:nvalue,p_night_allowance_start:night?(el('nightStart').value||'22:00'):'22:00',p_memo:el('contractMemo').value.trim()||null,p_workdays:workdays});if(!r?.ok)throw Error(r?.error||'SAVE_FAILED');S.creatingContract=false;S.creatingContract=false;S.creatingContract=false;S.contractId=Number(r.id);S.loadedContractId=null;await loadBundle();toast('계약·급여조건을 저장했습니다.')}catch(e){toast('저장하지 못했습니다. 입력값을 확인해주세요.',true)}finally{S.busy=false}}"
new="function contractSaveErrorMessage(code){const map={PERIOD_NOT_FOUND:'고용기간을 다시 선택해주세요.',BAD_CONTRACT_DATES:'계약 적용기간을 확인해주세요.',CONTRACT_OUTSIDE_EMPLOYMENT:'계약기간이 고용기간을 벗어났습니다. 고용기간을 확인해주세요.',HOURLY_WAGE_REQUIRED:'시급을 입력해주세요.',MONTHLY_SALARY_REQUIRED:'월급액을 입력해주세요.',BAD_BUSINESS_RATE:'공제율을 확인해주세요.',WORKDAYS_REQUIRED:'근무요일을 선택해주세요.',BAD_WORKDAY_ROW:'근무시간을 확인해주세요.',CONTRACT_OVERLAP:'같은 기간에 적용되는 계약이 이미 있습니다.',DUPLICATE_WORKDAY:'중복된 근무요일이 있습니다.',READBACK_FAILED:'저장 결과를 다시 불러오지 못했습니다. 화면을 새로고침해주세요.'};return map[code]||'저장 중 오류가 발생했습니다. 다시 시도해주세요.'}\nasync function saveContract(){if(S.busy)return;const p=currentPeriod(),c=currentContract();if(!p)return;let workdays=[];try{if(S.payrollType==='HOURLY'){workdays=collectWorkdays();if(!workdays.length)throw Error('근무요일을 선택해주세요.')}}catch(e){return toast(e.message,true)}const wage=S.payrollType==='HOURLY'?num(el('hourlyWage').value):null,salary=S.payrollType==='MONTHLY'?num(el('monthlySalary').value):null;if(S.payrollType==='HOURLY'&&(!wage||wage<=0))return toast('시급을 입력해주세요.',true);if(S.payrollType==='MONTHLY'&&(!salary||salary<=0))return toast('월급액을 입력해주세요.',true);let rate=null;if(S.taxTreatment==='BUSINESS_INCOME'){const pct=num(el('businessRate').value);if(pct==null||pct<0||pct>100)return toast('공제율을 확인해주세요.',true);rate=pct/100}const night=el('nightEnabled').checked,nmode=night?el('nightMode').value:null,nvalue=night?num(el('nightValue').value):null;if(night&&(nvalue==null||nvalue<0))return toast('야간수당 값을 입력해주세요.',true);S.busy=true;try{const r=await BE.contractSet({p_id:S.creatingContract?null:(c?.id||null),p_employment_period_id:p.id,p_effective_from:c?.effective_from??p.started_on,p_effective_to:c?.effective_to??p.ended_on??null,p_payroll_type:S.payrollType,p_hourly_wage:wage,p_monthly_salary:salary,p_tax_treatment:S.taxTreatment,p_business_deduction_rate:rate,p_night_allowance_enabled:night,p_night_allowance_mode:nmode,p_night_allowance_value:nvalue,p_night_allowance_start:night?(el('nightStart').value||'22:00'):'22:00',p_memo:el('contractMemo').value.trim()||null,p_workdays:workdays});if(!r?.ok)throw Error(r?.error||'SAVE_FAILED');S.creatingContract=false;S.contractId=Number(r.id);S.loadedContractId=null;await loadBundle();if(!S.bundle.contracts.some(x=>Number(x.id)===Number(r.id)))throw Error('READBACK_FAILED');toast('계약·급여조건을 저장했습니다.')}catch(e){console.error('[contract-save]',e);toast(contractSaveErrorMessage(e?.message),true)}finally{S.busy=false}}"
if old not in s: raise SystemExit('saveContract target missing')
s=s.replace(old,new,1)
s=s.replace("S.creatingContract=false;S.creatingContract=false;S.creatingContract=false;S.periodId", "S.creatingContract=false;S.periodId",1)
p.write_text(s)

# C: pending count is a section status, not a fake shortcut
replace_once('index.html',
'<a class="admin-attendance-alert" id="attendanceAlert" href="#admin"><span id="attendanceAlertText">근태 확인</span><span>›</span></a>',
'<div class="admin-pending-head" id="attendanceAlert"><span>직원 정정요청</span><span class="pending-badge" id="attendanceAlertText">0건</span></div>')
replace_once('index.html',
'.admin-attendance-alert{display:flex;align-items:center;justify-content:space-between;min-height:44px;margin-top:10px;padding:9px 10px;border-radius:10px;background:var(--surface-muted);color:var(--brand-700);text-decoration:none;font-size:.84rem;font-weight:650;}.admin-attendance-alert.quiet{color:var(--text-muted);font-weight:500;}',
'.admin-pending-head{display:flex;align-items:center;justify-content:space-between;min-height:36px;margin-top:14px;padding:2px;color:var(--text-muted);font-size:.8rem;font-weight:650;letter-spacing:.02em}.pending-badge{display:inline-flex;align-items:center;justify-content:center;min-width:34px;min-height:24px;padding:2px 8px;border-radius:999px;background:var(--brand-050);color:var(--brand-700);font-size:.74rem;font-weight:700;letter-spacing:0}.admin-pending-head.quiet .pending-badge{background:var(--surface-muted);color:var(--text-muted);font-weight:600}')
replace_once('index.html',
'  try{ reqs=await BE.pendingRequests(); }catch(e){ if(alertText) alertText.textContent="근태 확인"; return; }\n  if(alertText) alertText.textContent=reqs.length?`⚠ 확인할 근태 ${reqs.length}건`:"확인할 근태 없음";\n  if(alert){\n    alert.classList.toggle("quiet",!reqs.length);\n    alert.setAttribute("aria-disabled",reqs.length?"false":"true");\n    alert.onclick=e=>{e.preventDefault();if(!reqs.length)return;sec.scrollIntoView({behavior:"smooth",block:"start"});};\n  }',
'  try{ reqs=await BE.pendingRequests(); }catch(e){ if(alertText) alertText.textContent="—"; return; }\n  if(alertText) alertText.textContent=`${reqs.length}건`;\n  if(alert) alert.classList.toggle("quiet",!reqs.length);')
replace_once('index.html','  sec.innerHTML=`<div class="section-t">직원 정정요청</div>`;','  sec.innerHTML="";')

# Update presentation regressions that intentionally changed in C
p=Path('qa_ux_v11.mjs'); s=p.read_text()
s=s.replace("t('근태 확인 operational alert는 관리 pending queue를 가리킴',()=>{assert(idx.includes('id=\"attendanceAlert\" href=\"#admin\"'));assert(idx.includes('reqs=await BE.pendingRequests()'));assert(idx.includes('sec.scrollIntoView'));assert(!idx.includes('id=\"attendanceAlert\" href=\"attendance_review.html\"'))});",
"t('pending queue는 별도 shortcut 없이 실제 section status로 노출',()=>{assert(idx.includes('class=\"admin-pending-head\" id=\"attendanceAlert\"'));assert(idx.includes('reqs=await BE.pendingRequests()'));assert(!idx.includes('sec.scrollIntoView({behavior:\"smooth\"'));assert(!idx.includes('id=\"attendanceAlert\" href='))});")
p.write_text(s)

p=Path('qa_ux_v112.mjs'); s=p.read_text()
start=s.index("t('pending alert targets existing pending cards")
end=s.index("t('contract duplicate disclosure removed")
newtests="t('pending count is integrated with the real section, not a shortcut',()=>{assert(idx.includes('class=\"admin-pending-head\" id=\"attendanceAlert\"'));assert(idx.includes('reqs=await BE.pendingRequests()'));assert(idx.includes('alertText.textContent=`${reqs.length}건`'));assert(!idx.includes('sec.scrollIntoView({behavior:\"smooth\"'));assert(!idx.includes('id=\"attendanceAlert\" href='))});\nt('pending count and cards share one reqs source',()=>{assert(idx.includes('for(const r of reqs)'));assert(idx.includes('if(!reqs||!reqs.length){ sec.innerHTML=\"\"; return; }'))});\nt('zero pending renders a quiet non-actionable status',()=>{assert(idx.includes('alert.classList.toggle(\"quiet\",!reqs.length)'));assert(idx.includes('class=\"pending-badge\" id=\"attendanceAlertText\">0건'))});\n"
s=s[:start]+newtests+s[end:]
p.write_text(s)

print('ABC repair patch applied')
