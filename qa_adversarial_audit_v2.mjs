import fs from 'node:fs';import assert from 'node:assert/strict';
const index=fs.readFileSync('index.html','utf8');
const payroll=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
const must=(v,m)=>assert.ok(v,m);

must(index.includes('function safeHtml(value)'), 'core HTML escaping boundary missing');
for(const raw of ['<span class="nm">${e.name}</span>','<div class="att-name">${e.name}</div>','>${seq}</span>${e.name}</div>','<div class="nm" style="flex:1">${eName}','📌 이달: ${ov.memo}','📝 ${e.memo}','사유: ${r.note}']) must(!index.includes(raw), 'raw stored text interpolation remains: '+raw);
must(index.includes('${safeHtml(e.name)}'), 'employee names are not escaped');
must(index.includes('${safeHtml(ov.memo)}')&&index.includes('${safeHtml(e.memo)}'), 'payroll memos are not escaped');
must(index.includes('t.replaceChildren()')&&index.includes('title.textContent=String(big??"")')&&index.includes('detail.textContent=String(sub??"")'), 'toast must be text-only');

must(index.includes('const prev=new Date(t);prev.setDate(prev.getDate()-1)'), 'Admin today query lacks previous-day boundary');
must(index.includes('const next=new Date(t);next.setDate(next.getDate()+2)'), 'Admin today query lacks next-day boundary');
must(index.includes('BE.eventsWithCorrections(`${dkey(prev)}T00:00:00`,`${dkey(next)}T00:00:00`)'), 'Admin today query does not use widened boundaries');

must(payroll.includes("mode:'MISSING_CONTRACT'"), 'missing-contract mode missing');
must(!payroll.includes("mode:'LEGACY'"), 'legacy wage fallback is still reachable');
must(payroll.includes("pick.mode==='BLOCKED'||pick.mode==='MISSING_CONTRACT'"), 'missing contract does not null pay');
must(payroll.includes("r.contractMode!=='CONTRACT'||Number(r.issues||0)>0"), 'close gate does not cover unresolved rows');
must(payroll.includes('close.disabled=true'), 'close button is not disabled on unresolved payroll');
console.log('adversarial audit V2 QA: PASS');