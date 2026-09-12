from pathlib import Path
import re


def sub_once(path, pattern, repl, flags=0):
    p=Path(path); s=p.read_text()
    ns,n=re.subn(pattern,repl,s,count=1,flags=flags)
    if n!=1: raise SystemExit(f'{path}: expected 1 replacement, got {n}: {pattern[:80]}')
    p.write_text(ns)


def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if s.count(old)!=1: raise SystemExit(f'{path}: expected one target, got {s.count(old)}: {old[:80]}')
    p.write_text(s.replace(old,new,1))

js='employment_contracts_v3.js'
css='employment_contracts.css'
wf='.github/workflows/ia-ux-regression.yml'

# Explicit new-employment-period mode. A new period is no longer simultaneously offered with its register action.
replace_once(js,
"const S={employees:[],employeeId:null,bundle:{periods:[],contracts:[],workdays:[]},periodId:null,contractId:null,payrollType:'HOURLY',taxTreatment:'BUSINESS_INCOME',nightEnabled:false,workdays:new Map(),loadedContractId:null,creatingContract:false,busy:false};",
"const S={employees:[],employeeId:null,bundle:{periods:[],contracts:[],workdays:[]},periodId:null,contractId:null,payrollType:'HOURLY',taxTreatment:'BUSINESS_INCOME',nightEnabled:false,workdays:new Map(),loadedContractId:null,creatingContract:false,creatingPeriod:false,busy:false};")

sub_once(js,
r"function selectDefaults\(\)\{.*?\}\nfunction weeklyMinutes",
"function selectDefaults(){const ps=periods();if(S.creatingPeriod)S.periodId=null;else if(!S.periodId||!ps.some(x=>Number(x.id)===Number(S.periodId)))S.periodId=ps[0]?.id?Number(ps[0].id):null;const cs=periodContracts();if(S.creatingPeriod){S.creatingContract=false;S.contractId=null}else if(S.creatingContract)S.contractId=null;else if(!S.contractId||!cs.some(x=>Number(x.id)===Number(S.contractId)))S.contractId=cs[0]?.id?Number(cs[0].id):null;const c=currentContract();if((c&&S.loadedContractId!==Number(c.id))||(!c&&S.loadedContractId!==null))hydrate(c)}\nfunction weeklyMinutes",
flags=re.S)

history = r'''function historyCard(p,c){const ps=periods(),cs=periodContracts(),isNew=S.creatingPeriod;const picker=!isNew&&ps.length?`<div class="field"><label>기간 선택</label><select id="periodSel">${ps.map(x=>`<option value="${x.id}" ${Number(x.id)===Number(S.periodId)?'selected':''}>${x.started_on} ~ ${x.ended_on||'재직중'}</option>`).join('')}</select></div>`:(!isNew?'<div class="hint">등록된 고용기간이 없습니다.</div>':'');const editor=(p||isNew)?`<div class="grid2"><div class="field"><label>입사일</label><input id="periodStart" type="date" value="${isNew?'':(p?.started_on||'')}"></div><div class="field"><label>퇴사일</label><input id="periodEnd" type="date" value="${isNew?'':(p?.ended_on||'')}"></div></div><div class="field"><label>메모</label><textarea id="periodNote" rows="2" placeholder="필요한 내용만 기록">${isNew?'':escapeHtml(p?.note||'')}</textarea></div><div class="actions">${isNew?'<button class="btn" id="cancelPeriod">취소</button><button class="btn primary" id="savePeriod">등록</button>':`<button class="btn" id="newPeriod">+ 새 고용기간</button><button class="btn" id="savePeriod">고용기간 저장</button>`}</div>`:`<div class="actions"><button class="btn primary" id="newPeriod">+ 새 고용기간</button></div>`;const contracts=!isNew&&p?`<h3>계약 이력</h3>${cs.length?`<div class="field"><label>계약 선택</label><select id="contractSel">${cs.map(x=>`<option value="${x.id}" ${Number(x.id)===Number(S.contractId)?'selected':''}>${x.effective_from} · ${x.payroll_type==='HOURLY'?'시급제':'월급제'}</option>`).join('')}</select></div>`:'<div class="hint">등록된 계약 이력이 없습니다.</div>'}<div class="actions"><button class="btn" id="newContract">새 계약 추가</button></div>`:'';return `<section class="card advanced" id="history"><h2>고용·계약 이력</h2><div class="advanced-body"><h3>고용기간</h3>${picker}${editor}${contracts}</div></section>`}'''
sub_once(js,r"function historyCard\(p,c\)\{.*?\}\nfunction render",history+"\nfunction render",flags=re.S)

# Give the separator its own fixed track and wrap native time inputs so iOS intrinsic width cannot push outside the card.
replace_once(js,
"<div class=\"timepair\"><input type=\"time\" data-wstart=\"${wd}\" value=\"${x.start}\"><span>~</span><input type=\"time\" data-wend=\"${wd}\" value=\"${x.end}\"></div>",
"<div class=\"timepair\"><span class=\"timebox\"><input type=\"time\" data-wstart=\"${wd}\" value=\"${x.start}\"></span><span class=\"time-sep\">~</span><span class=\"timebox\"><input type=\"time\" data-wend=\"${wd}\" value=\"${x.end}\"></span></div>")

bind = r'''function bindHistory(p){enhanceDateInput(el('periodStart'));enhanceDateInput(el('periodEnd'));const ps=el('periodSel');if(ps)ps.onchange=()=>{S.creatingPeriod=false;S.creatingContract=false;S.periodId=Number(ps.value);S.contractId=null;S.loadedContractId=null;render()};const cs=el('contractSel');if(cs)cs.onchange=()=>{S.creatingContract=false;S.contractId=Number(cs.value);S.loadedContractId=null;render()};const np=el('newPeriod');if(np)np.onclick=()=>{S.creatingPeriod=true;S.creatingContract=false;S.periodId=null;S.contractId=null;S.loadedContractId=null;render()};const cp=el('cancelPeriod');if(cp)cp.onclick=()=>{S.creatingPeriod=false;S.periodId=null;S.contractId=null;S.loadedContractId=null;render()};const sp=el('savePeriod');if(sp)sp.onclick=savePeriod;const nc=el('newContract');if(nc)nc.onclick=()=>{S.creatingPeriod=false;S.creatingContract=true;S.contractId=null;hydrate(null);render()}}'''
sub_once(js,r"function bindHistory\(p\)\{.*?\}\nasync function savePeriod",bind+"\nasync function savePeriod",flags=re.S)

sub_once(js,
r"async function savePeriod\(\)\{.*?\}\nasync function loadBundle",
"async function savePeriod(){if(S.busy)return;const start=el('periodStart').value,end=el('periodEnd').value||null;if(!start)return toast('입사일을 입력해주세요.',true);if(end&&end<start)return toast('퇴사일을 확인해주세요.',true);S.busy=true;try{const r=await BE.periodSet({p_id:S.creatingPeriod?null:S.periodId,p_employee_id:S.employeeId,p_started_on:start,p_ended_on:end,p_note:el('periodNote').value.trim()||null});if(!r?.ok)throw Error(r?.error||'SAVE_FAILED');S.creatingPeriod=false;S.periodId=Number(r.id);S.contractId=null;S.loadedContractId=null;await loadBundle();toast('고용정보를 저장했습니다.')}catch(e){toast('고용정보를 저장하지 못했습니다.',true)}finally{S.busy=false}}\nasync function loadBundle",
flags=re.S)

replace_once(js,
"S.periodId=null;S.contractId=null;S.creatingContract=false;hydrate(null);",
"S.periodId=null;S.contractId=null;S.creatingContract=false;S.creatingPeriod=false;hydrate(null);")

# CSS: fixed separator column + shrinkable wrappers. Keep the native text legible; only constrain its box.
replace_once(css,
".timepair{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px}.timepair input{padding:8px 6px}",
".timepair{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);align-items:center;gap:4px;min-width:0;overflow:hidden}.timebox{display:flex;min-width:0;width:100%;max-width:100%;overflow:hidden}.timebox input{display:block;box-sizing:border-box;flex:1 1 0%;width:0!important;min-width:0!important;max-width:100%!important;inline-size:0;min-inline-size:0;padding:8px 4px}.time-sep{display:block;width:24px;text-align:center;justify-self:center;position:relative;z-index:2}")
replace_once(css,
".timepair{gap:4px}.timepair input{font-size:16px;padding-left:4px;padding-right:4px}",
".timepair{gap:3px;grid-template-columns:minmax(0,1fr) 22px minmax(0,1fr)}.timebox input{font-size:16px;padding-left:3px;padding-right:3px}.time-sep{width:22px}")

qa = '''import fs from 'node:fs';\nimport assert from 'node:assert/strict';\nconst r=p=>fs.readFileSync(p,'utf8');\nconst js=r('employment_contracts_v3.js'),css=r('employment_contracts.css');\nlet pass=0;const t=(n,f)=>{f();pass++;console.log('PASS',n)};\n\nt('new employment period is an explicit mode, not simultaneous registration',()=>{\n  assert(js.includes('creatingPeriod:false'));\n  assert(js.includes("S.creatingPeriod=true;S.creatingContract=false;S.periodId=null"));\n  assert(js.includes("isNew?'<button class=\\\"btn\\\" id=\\\"cancelPeriod\\\">취소</button><button class=\\\"btn primary\\\" id=\\\"savePeriod\\\">등록</button>'"));\n  assert(js.includes("`<div class=\\\"actions\\\"><button class=\\\"btn primary\\\" id=\\\"newPeriod\\\">+ 새 고용기간</button></div>`"));\n});\n\nt('new period create uses null id and returns to normal mode after save',()=>{\n  assert(js.includes('p_id:S.creatingPeriod?null:S.periodId'));\n  assert(js.includes('S.creatingPeriod=false;S.periodId=Number(r.id)'));\n});\n\nt('cancel exits new period mode without writing data',()=>{\n  assert(js.includes("const cp=el('cancelPeriod');if(cp)cp.onclick=()=>{S.creatingPeriod=false;S.periodId=null"));\n});\n\nt('contract workday time row reserves a dedicated separator track',()=>{\n  assert(js.includes('class=\\\"timebox\\\"'));\n  assert(js.includes('class=\\\"time-sep\\\">~</span>'));\n  assert(css.includes('grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr)'));\n  assert(css.includes('.timebox{display:flex;min-width:0;width:100%;max-width:100%;overflow:hidden}'));\n  assert(css.includes('width:0!important;min-width:0!important;max-width:100%!important'));\n});\n\nt('mobile time row remains two shrinkable boxes plus non-overlapping separator',()=>{\n  assert(css.includes('grid-template-columns:minmax(0,1fr) 22px minmax(0,1fr)'));\n  assert(css.includes('.time-sep{width:22px}'));\n});\n\nconsole.log(`UX V1.1.2 period/time-row repair QA: ${pass} PASS`);\n'''
Path('qa_ux_v112_period_time.mjs').write_text(qa)

# Wire QA into branch + PR regression.
p=Path(wf); w=p.read_text()
w=w.replace('chatgpt-ux-v1.1.2-iphone-smoke-repair]','chatgpt-ux-v1.1.2-iphone-smoke-repair, chatgpt-ux-v1.1.2-period-time-row-repair]',1)
w=w.replace('          node --check qa_ux_v112_smoke.mjs\n','          node --check qa_ux_v112_smoke.mjs\n          node --check qa_ux_v112_period_time.mjs\n',1)
w=w.replace('      - name: Contract V1 QA\n','      - name: UX V1.1.2 period/time-row repair QA\n        run: node qa_ux_v112_period_time.mjs\n      - name: Contract V1 QA\n',1)
p.write_text(w)

print('period/time-row repair applied')
