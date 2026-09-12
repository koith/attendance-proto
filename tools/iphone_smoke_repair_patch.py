from pathlib import Path


def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise SystemExit(f'missing target in {path}: {old[:100]!r}')
    if s.count(old)!=1: raise SystemExit(f'non-unique target in {path}: {s.count(old)}')
    p.write_text(s.replace(old,new,1))

# 1) Contract toast: successful confirmations should size to their content and stay one line.
replace_once('employment_contracts.css',
'.toast.show{opacity:1;transform:translate(-50%,0)}.toast.err{border-color:var(--danger)}.loading',
'.toast.show{opacity:1;transform:translate(-50%,0)}.toast.err{border-color:var(--danger)}.toast.one-line{width:max-content;min-width:0;white-space:nowrap;max-width:calc(100vw - 28px)}.loading')

# 2) iOS native date renderer is vertically inconsistent. Keep the real native input for the picker,
#    but render the visible value in a centered overlay so geometry is deterministic.
old_date='.field input[type="date"]{display:block;height:46px;min-height:46px;line-height:46px;padding-top:0;padding-bottom:0}.field input[type="date"]::-webkit-date-and-time-value{min-height:46px;line-height:46px;text-align:left;margin:0}.field input[type="date"]::-webkit-datetime-edit{padding:0}'
new_date='.date-shell{position:relative;height:46px;min-height:46px;border:1px solid var(--line);border-radius:11px;background:#fff;overflow:hidden}.date-shell-value{position:absolute;z-index:1;left:10px;right:42px;top:50%;transform:translateY(-50%);font-size:16px;line-height:1;color:var(--text);white-space:nowrap;pointer-events:none}.date-shell input[type="date"]{position:absolute;z-index:2;inset:0;width:100%;height:46px;min-height:46px;border:0!important;background:transparent!important;padding:0 10px!important;color:transparent!important;-webkit-text-fill-color:transparent!important;opacity:1}.date-shell input[type="date"]::-webkit-date-and-time-value,.date-shell input[type="date"]::-webkit-datetime-edit{color:transparent!important;-webkit-text-fill-color:transparent!important}.date-shell input[type="date"]::-webkit-calendar-picker-indicator{opacity:1}'
replace_once('employment_contracts.css',old_date,new_date)

p=Path('employment_contracts_v3.js'); s=p.read_text()
s=s.replace("function toast(msg,err=false){const x=el('toast');x.textContent=msg;x.className='toast show'+(err?' err':'');clearTimeout(toast.t);toast.t=setTimeout(()=>x.className='toast',2600)}",
"function toast(msg,err=false){const x=el('toast');x.textContent=msg;x.className='toast show'+(err?' err':' one-line');clearTimeout(toast.t);toast.t=setTimeout(()=>x.className='toast',2600)}",1)
anchor="function fmtMin(n){n=Math.round(Number(n)||0);const h=Math.floor(n/60),m=n%60;return m?`${h}시간 ${m}분`:`${h}시간`}"
helper=anchor+"\nfunction syncDateShell(input){const shell=input?.closest('.date-shell'),out=shell?.querySelector('.date-shell-value');if(out)out.textContent=input.value||''}\nfunction enhanceDateInput(input){if(!input||input.closest('.date-shell'))return;const shell=document.createElement('div'),out=document.createElement('span');shell.className='date-shell';out.className='date-shell-value';out.setAttribute('aria-hidden','true');input.parentNode.insertBefore(shell,input);shell.append(out,input);const sync=()=>syncDateShell(input);input.addEventListener('input',sync);input.addEventListener('change',sync);sync()}"
if anchor not in s: raise SystemExit('fmtMin anchor missing')
s=s.replace(anchor,helper,1)
s=s.replace("function bindHistory(p){const ps=el('periodSel');", "function bindHistory(p){enhanceDateInput(el('periodStart'));enhanceDateInput(el('periodEnd'));const ps=el('periodSel');",1)
s=s.replace("if(np)np.onclick=()=>{el('periodStart').value='';el('periodEnd').value='';el('periodNote').value='';", "if(np)np.onclick=()=>{el('periodStart').value='';el('periodEnd').value='';syncDateShell(el('periodStart'));syncDateShell(el('periodEnd'));el('periodNote').value='';",1)
p.write_text(s)

# 3) Shared double-tap guard on all operational pages. First tap remains a normal click; only the second
#    near-identical non-form touch is cancelled, which also protects punch/save from accidental double fire.
for name in ['index.html','employment_contracts.html','daily_schedule.html','monthly_schedule.html','attendance_review.html']:
    p=Path(name); s=p.read_text()
    tag='<script src="no_double_tap_zoom.js" defer></script>'
    if tag not in s:
        if '</head>' not in s: raise SystemExit(f'head close missing in {name}')
        s=s.replace('</head>',tag+'\n</head>',1)
        p.write_text(s)

print('iPhone smoke repair patch applied')
