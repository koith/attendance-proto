from pathlib import Path

def rep(path, old, new, count=1):
    p=Path(path); s=p.read_text()
    if old not in s: raise SystemExit(f'anchor missing: {path}: {old[:80]}')
    p.write_text(s.replace(old,new,count))

# 1) Admin pending alert: same BE.pendingRequests() data, jump to already-rendered pending cards.
p=Path('index.html'); s=p.read_text()
s=s.replace('<a class="admin-attendance-alert" id="attendanceAlert" href="attendance_review.html"><span id="attendanceAlertText">근태 확인</span><span>›</span></a>',
            '<a class="admin-attendance-alert" id="attendanceAlert" href="#admin"><span id="attendanceAlertText">근태 확인</span><span>›</span></a>',1)
s=s.replace('document.getElementById("quickContracts").onclick=()=>{ location.href="employment_contracts.html"; };',
            'document.getElementById("quickContracts").onclick=()=>{ location.href="employment_contracts.html?from=admin"; };',1)
s=s.replace('div.querySelector("[data-contract]").onclick=()=>{ location.href=`employment_contracts.html?employee=${e.id}`; };',
            'div.querySelector("[data-contract]").onclick=()=>{ location.href=`employment_contracts.html?employee=${e.id}&from=employees`; };',1)
old='''  if(alertText) alertText.textContent=reqs.length?`⚠ 확인할 근태 ${reqs.length}건`:"확인할 근태 없음";\n  if(alert) alert.classList.toggle("quiet",!reqs.length);\n  if(!reqs||!reqs.length){ sec.innerHTML=""; return; }'''
new='''  if(alertText) alertText.textContent=reqs.length?`⚠ 확인할 근태 ${reqs.length}건`:"확인할 근태 없음";\n  if(alert){\n    alert.classList.toggle("quiet",!reqs.length);\n    alert.setAttribute("aria-disabled",reqs.length?"false":"true");\n    alert.onclick=e=>{e.preventDefault();if(!reqs.length)return;sec.scrollIntoView({behavior:"smooth",block:"start"});};\n  }\n  if(!reqs||!reqs.length){ sec.innerHTML=""; return; }'''
if old not in s: raise SystemExit('pending alert anchor missing')
s=s.replace(old,new,1)
# focus employee section when returning from employee-context contract editor
old='''    empsEl.appendChild(div);\n  }\n}\n\n// 정정요청 대기 큐'''
new='''    empsEl.appendChild(div);\n  }\n  if(new URLSearchParams(location.search).get("focus")==="employees") empsEl.scrollIntoView({behavior:"auto",block:"start"});\n}\n\n// 정정요청 대기 큐'''
if old not in s: raise SystemExit('employee focus anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# 2/3) Contract history disclosure flatten + context-aware back.
p=Path('employment_contracts_v3.js'); s=p.read_text()
s=s.replace('<div class="status-line">고용정보를 등록하면 계약·급여조건을 설정할 수 있습니다.</div><button class="btn full" id="openHistory">고용·계약 이력 열기</button>',
            '<div class="status-line">고용정보를 등록하면 계약·급여조건을 설정할 수 있습니다.</div>',1)
s=s.replace('</div><button class="linkbtn" id="openHistory">고용·계약 이력 ›</button></div><h3>급여 형태</h3>',
            '</div></div><h3>급여 형태</h3>',1)
s=s.replace('return `<details class="card advanced" id="history"><summary>고용·계약 이력</summary><div class="advanced-body">',
            'return `<section class="card advanced" id="history"><h2>고용·계약 이력</h2><div class="advanced-body">',1)
s=s.replace("</div></details>`}\nfunction render()", "</div></section>`}\nfunction render()",1)
old="function bindMain(c){const open=el('openHistory');if(open)open.onclick=()=>{const d=el('history');d.open=true;d.scrollIntoView({behavior:'smooth',block:'start'})};if(!currentPeriod())return;"
new="function bindMain(c){if(!currentPeriod())return;"
if old not in s: raise SystemExit('bindMain disclosure anchor missing')
s=s.replace(old,new,1)
s=s.replace(";render();const d=el('history');if(d)d.open=true}}", ";render()}}",1)
old="const requested=Number(new URLSearchParams(location.search).get('employee'));el('back').onclick=()=>location.href='index.html#admin';"
new="const params=new URLSearchParams(location.search),requested=Number(params.get('employee')),from=params.get('from');el('back').textContent=from==='employees'?'‹ 직원':'‹ 관리';el('back').onclick=()=>location.href=from==='employees'?'index.html?focus=employees#admin':'index.html#admin';"
if old not in s: raise SystemExit('contract back anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# 4/5) Daily time wrappers + browser-independent symmetric dividers.
p=Path('daily_schedule.js'); s=p.read_text()
old='<div class="time-range" ${st===\'WORK\'?\'\':\'hidden\'}><input class="start" type="time" value="${ss}"><span>~</span><input class="end" type="time" value="${se}"></div>'
new='<div class="time-range" ${st===\'WORK\'?\'\':\'hidden\'}><div class="time-field"><input class="start" type="time" value="${ss}"></div><span class="time-sep">~</span><div class="time-field"><input class="end" type="time" value="${se}"></div></div>'
if old not in s: raise SystemExit('daily time DOM anchor missing')
p.write_text(s.replace(old,new,1))

p=Path('daily_schedule.css'); s=p.read_text()
s=s.replace('.period-nav .btn{border:0;border-radius:0;padding:8px 6px}.period-nav input{width:100%;height:44px;border:0;border-left:1px solid var(--line);border-right:1px solid var(--line);border-radius:0;background:#fff;padding:0 8px;font-size:16px}',
'''.period-nav .btn{border:0;border-radius:0;padding:8px 6px}.period-nav .btn:first-child{border-right:1px solid var(--line)}.period-nav .btn:last-child{border-left:1px solid var(--line)}.period-nav input{width:100%;height:44px;border:0;border-radius:0;background:#fff;padding:0 8px;font-size:16px}''',1)
s=s.replace('.field select,.time-range input{width:100%;height:46px;border:1px solid var(--line);border-radius:11px;background:#fff;padding:0 10px}',
'''.field select,.time-field input[type=time]{width:100%;height:46px;border:1px solid var(--line);border-radius:11px;background:#fff;padding:0 8px}.time-field{min-width:0;width:100%;max-width:100%;overflow:hidden}.time-field input[type=time]{display:block;box-sizing:border-box;min-width:0!important;max-width:100%!important;width:100%!important;inline-size:100%;min-inline-size:0}''',1)
s=s.replace('.time-range>span{display:flex;align-items:center;justify-content:center;width:20px;color:var(--muted);font-weight:700;line-height:1}',
            '.time-range>.time-sep{display:flex;align-items:center;justify-content:center;width:20px;color:var(--muted);font-weight:700;line-height:1}',1)
s=s.replace('.time-range input{padding:0 6px}', '.time-field input[type=time]{padding-left:4px;padding-right:4px}',1)
p.write_text(s)

# 4/5/6) Monthly wrappers, symmetric navigator, saved visual state.
p=Path('monthly_schedule.js'); s=p.read_text()
old='<div class="time-row"><input id="start" type="time" value="${S.start}"><span>~</span><input id="end" type="time" value="${S.end}"></div>'
new='<div class="time-row"><div class="time-field"><input id="start" type="time" value="${S.start}"></div><span class="time-sep">~</span><div class="time-field"><input id="end" type="time" value="${S.end}"></div></div>'
if s.count(old)<2: raise SystemExit('monthly time DOM anchors missing')
s=s.replace(old,new,2)
old='class="calday ${cellClass(effective(emp.id,d))} ${S.selected.has(d)?\'selected\':\'\'} ${S.draft.has(rowKey(emp.id,d))?\'dirty\':\'\'}"'
new='class="calday ${cellClass(effective(emp.id,d))} ${S.original.has(rowKey(emp.id,d))?\'saved\':\'\'} ${S.selected.has(d)?\'selected\':\'\'} ${S.draft.has(rowKey(emp.id,d))?\'dirty\':\'\'}"'
if old not in s: raise SystemExit('mobile saved class anchor missing')
s=s.replace(old,new,1)
old='class="daycell ${cellClass(effective(emp.id,d))} ${S.selected.has(d)?\'selected\':\'\'}"'
new='class="daycell ${cellClass(effective(emp.id,d))} ${S.original.has(rowKey(emp.id,d))?\'saved\':\'\'} ${S.selected.has(d)?\'selected\':\'\'}"'
if old not in s: raise SystemExit('desktop saved class anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('monthly_schedule.css'); s=p.read_text()
s=s.replace('.period-nav .btn{border:0;border-radius:0;padding:8px 6px}.period-nav #month{min-width:0;width:100%;height:44px;border:0;border-left:1px solid var(--line);border-right:1px solid var(--line);border-radius:0;background:#fff;padding:0 8px}',
'''.period-nav .btn{border:0;border-radius:0;padding:8px 6px}.period-nav .btn:first-child{border-right:1px solid var(--line)}.period-nav .btn:last-child{border-left:1px solid var(--line)}.period-nav #month{min-width:0;width:100%;height:44px;border:0;border-radius:0;background:#fff;padding:0 8px}''',1)
s=s.replace('.time-row{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);gap:10px;align-items:center;margin:12px 0}.time-row>span{display:flex;align-items:center;justify-content:center;width:20px;color:var(--muted);font-weight:700;line-height:1}',
'''.time-row{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);gap:10px;align-items:center;margin:12px 0}.time-field{min-width:0;width:100%;max-width:100%;overflow:hidden}.time-field input[type=time]{display:block;box-sizing:border-box;min-width:0!important;max-width:100%!important;width:100%!important;inline-size:100%;min-inline-size:0}.time-row>.time-sep{display:flex;align-items:center;justify-content:center;width:20px;color:var(--muted);font-weight:700;line-height:1}''',1)
s=s.replace('.daycell.selected{outline:3px solid #1d5d3a40;border-color:var(--brand)}',
            '.daycell.saved:not(.selected){background:var(--brand-bg);border-color:#b8d6c4}.daycell.selected{outline:3px solid #1d5d3a40;border-color:var(--brand)}',1)
s=s.replace('.calday.off small{color:var(--off)}.calday.selected{background:var(--brand);border-color:var(--brand);color:#fff}',
            '.calday.off small{color:var(--off)}.calday.saved:not(.selected){background:var(--brand-bg);border-color:#b8d6c4}.calday.selected{background:var(--brand);border-color:var(--brand);color:#fff}',1)
s=s.replace('.time-row input{padding-left:6px;padding-right:6px}', '.time-field input[type=time]{padding-left:4px;padding-right:4px}',1)
p.write_text(s)

# V1.1.1 regression expectation updated for intentionally changed operational destination.
p=Path('qa_ux_v111.mjs'); s=p.read_text()
s=s.replace("t('attendance operational alert routes to review',()=>assert(idx.includes('id=\"attendanceAlert\" href=\"attendance_review.html\"')));",
            "t('attendance operational alert remains operational action',()=>{assert(idx.includes('id=\"attendanceAlert\" href=\"#admin\"'));assert(idx.includes('sec.scrollIntoView'))});",1)
p.write_text(s)

# New V1.1.2 targeted regression.
Path('qa_ux_v112.mjs').write_text('''import fs from 'node:fs';import assert from 'node:assert/strict';\nconst r=p=>fs.readFileSync(p,'utf8');let pass=0;const t=(n,f)=>{f();pass++;console.log('PASS',n)};\nconst idx=r('index.html'),ec=r('employment_contracts_v3.js'),dj=r('daily_schedule.js'),dc=r('daily_schedule.css'),mj=r('monthly_schedule.js'),mc=r('monthly_schedule.css');\nt('pending alert targets existing pending cards, not generic review',()=>{assert(idx.includes('id="attendanceAlert" href="#admin"'));assert(idx.includes('reqs=await BE.pendingRequests()'));assert(idx.includes('sec.scrollIntoView'));assert(!idx.includes('id="attendanceAlert" href="attendance_review.html"'))});\nt('pending count and cards share one reqs source',()=>{assert(idx.includes('확인할 근태 ${reqs.length}건'));assert(idx.includes('for(const r of reqs)'))});\nt('contract duplicate disclosure removed',()=>{assert(!ec.includes('고용·계약 이력 열기'));assert(!ec.includes('<details class="card advanced"'));assert(ec.includes('<section class="card advanced" id="history"><h2>고용·계약 이력</h2>'))});\nt('contract back context is explicit',()=>{assert(idx.includes('from=employees'));assert(idx.includes('from=admin'));assert(ec.includes("from==='employees'?'‹ 직원':'‹ 관리'"));assert(ec.includes('index.html?focus=employees#admin'))});\nt('daily native time controls are wrapper-constrained',()=>{assert(dj.includes('class="time-field"><input class="start"'));assert(dc.includes('.time-field{min-width:0;width:100%;max-width:100%;overflow:hidden}'));assert(dc.includes('width:100%!important'))});\nt('monthly native time controls use same wrapper constraint',()=>{assert((mj.match(/class="time-field"><input id=/g)||[]).length>=2);assert(mc.includes('.time-field{min-width:0;width:100%;max-width:100%;overflow:hidden}'));assert(mc.includes('width:100%!important'))});\nt('navigator dividers are symmetric and browser-independent',()=>{for(const css of [dc,mc]){assert(css.includes('.period-nav .btn:first-child{border-right:1px solid var(--line)}'));assert(css.includes('.period-nav .btn:last-child{border-left:1px solid var(--line)}'))}});\nt('stored dates render a saved state class',()=>{assert(mj.includes("S.original.has(rowKey(emp.id,d))?'saved':''"));assert(mc.includes('.calday.saved:not(.selected)'));assert(mc.includes('.daycell.saved:not(.selected)'))});\nt('selected style has precedence over saved',()=>{assert(mc.indexOf('.calday.saved:not(.selected)')<mc.indexOf('.calday.selected{'));assert(mc.indexOf('.daycell.saved:not(.selected)')<mc.indexOf('.daycell.selected{'))});\nt('monthly projected payload logic unchanged',()=>{assert(mj.includes('function wizardProjectedPayload()'));assert(mj.includes('function wizardPayload(){return wizardProjectedPayload()}'))});\nt('daily Schedule RPC path unchanged',()=>{assert(dj.includes("rpc('admin_schedule_set'"));assert(dj.includes("rpc('admin_schedule_delete'"))});\nt('punch core untouched by V1.1.2 surface files',()=>assert(idx.includes('touch-action:manipulation')));\nconsole.log(`UX V1.1.2 QA: ${pass} PASS`);\n''')

# Add V1.1.2 to full CI and trigger this branch.
p=Path('.github/workflows/ia-ux-regression.yml'); s=p.read_text()
s=s.replace('branches: [chatgpt-ux-v1.1-mobile-repair, chatgpt-ux-v1.1.1-mobile-polish]', 'branches: [chatgpt-ux-v1.1-mobile-repair, chatgpt-ux-v1.1.1-mobile-polish, chatgpt-ux-v1.1.2-iphone-final-repair]',1)
s=s.replace('node --check qa_ux_v111.mjs\n', 'node --check qa_ux_v111.mjs\n          node --check qa_ux_v112.mjs\n',1)
s=s.replace('      - name: Contract V1 QA\n', '      - name: UX V1.1.2 QA\n        run: node qa_ux_v112.mjs\n      - name: Contract V1 QA\n',1)
p.write_text(s)
