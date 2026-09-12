import fs from 'node:fs';
import assert from 'node:assert/strict';
const r=p=>fs.readFileSync(p,'utf8');
const js=r('employment_contracts_v3.js'),css=r('employment_contracts.css');
let pass=0;const t=(n,f)=>{f();pass++;console.log('PASS',n)};

t('new employment period is an explicit mode, not simultaneous registration',()=>{
  assert(js.includes('creatingPeriod:false'));
  assert(js.includes("S.creatingPeriod=true;S.creatingContract=false;S.periodId=null"));
  assert(js.includes("isNew?'<button class=\"btn\" id=\"cancelPeriod\">취소</button><button class=\"btn primary\" id=\"savePeriod\">등록</button>'"));
  assert(js.includes("`<div class=\"actions\"><button class=\"btn primary\" id=\"newPeriod\">+ 새 고용기간</button></div>`"));
});

t('new period create uses null id and returns to normal mode after save',()=>{
  assert(js.includes('p_id:S.creatingPeriod?null:S.periodId'));
  assert(js.includes('S.creatingPeriod=false;S.periodId=Number(r.id)'));
});

t('cancel exits new period mode without writing data',()=>{
  assert(js.includes("const cp=el('cancelPeriod');if(cp)cp.onclick=()=>{S.creatingPeriod=false;S.periodId=null"));
});

t('contract workday time row reserves a dedicated separator track',()=>{
  assert(js.includes('class=\"timebox\"'));
  assert(js.includes('class=\"time-sep\">~</span>'));
  assert(css.includes('grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr)'));
  assert(css.includes('.timebox{display:flex;min-width:0;width:100%;max-width:100%;overflow:hidden}'));
  assert(css.includes('width:0!important;min-width:0!important;max-width:100%!important'));
});

t('mobile time row remains two shrinkable boxes plus non-overlapping separator',()=>{
  assert(css.includes('grid-template-columns:minmax(0,1fr) 22px minmax(0,1fr)'));
  assert(css.includes('.time-sep{width:22px}'));
});

console.log(`UX V1.1.2 period/time-row repair QA: ${pass} PASS`);
