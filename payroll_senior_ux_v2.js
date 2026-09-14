/* Payroll senior UX V2: gross-first totals, automatic elapsed-week UI, employee No. */
(()=>{
  if(window.__baekeokPayrollSeniorUxV2)return;
  window.__baekeokPayrollSeniorUxV2=true;
  if(typeof drawPay!=='function')return;
  const base=drawPay;
  const no=id=>`No. ${String(Number(id)||0).padStart(2,'0')}`;
  const money=s=>Number(String(s||'').replace(/[^0-9-]/g,''))||0;
  function style(){if(document.getElementById('payrollSeniorUxV2Style'))return;const x=document.createElement('style');x.id='payrollSeniorUxV2Style';x.textContent=`#payList .employee-no-sub{display:block;margin-top:2px;font-size:.64rem;line-height:1.1;color:var(--text-muted);font-weight:500;font-variant-numeric:tabular-nums}#payList .payroll-total-net{font-size:.7rem;color:var(--text-muted);margin-top:3px;text-align:right}.payroll-auto-week-note{font-size:.72rem;color:var(--text-muted);margin:-6px 2px 12px}`;document.head.appendChild(x)}
  function simplifyHeader(){const weeks=document.getElementById('payWeeks');const field=weeks?.closest('.field');if(field)field.style.display='none';const grid=field?.closest('.form-grid-2');if(grid)grid.style.gridTemplateColumns='1fr';let n=document.getElementById('payrollAutoWeekNote');if(!n&&grid){n=document.createElement('div');n.id='payrollAutoWeekNote';n.className='payroll-auto-week-note';n.textContent='주휴 주 수는 완료된 주만 자동 반영합니다.';grid.after(n)}}
  function annotateCards(){document.querySelectorAll('#payList .row').forEach(card=>{const b=card.querySelector('[data-month],[data-edit]');const id=Number(b?.dataset.month||b?.dataset.edit);const nm=card.querySelector('.nm');if(!id||!nm||nm.querySelector('.employee-no-sub'))return;const sub=document.createElement('small');sub.className='employee-no-sub';sub.textContent=no(id);nm.appendChild(sub)})}
  function grossFirstTotal(){const kpi=document.querySelector('#payList .kpi-row');if(!kpi)return;const oldLabel=kpi.querySelector('.kpi-label'),oldValue=kpi.querySelector('.kpi-value');if(!oldLabel||!oldValue)return;const netText=oldValue.textContent||'';let gross=0;document.querySelectorAll('#payList .payroll-gross-value').forEach(x=>gross+=money(x.textContent));oldLabel.textContent='세전 합계';oldValue.textContent=`${gross.toLocaleString()}원`;let n=kpi.querySelector('.payroll-total-net');if(!n){n=document.createElement('div');n.className='payroll-total-net';oldValue.parentElement?.appendChild(n)}n.textContent=`세후 합계 ${netText}`}
  drawPay=async function(...args){const r=await base.apply(this,args);style();simplifyHeader();annotateCards();grossFirstTotal();return r};
  style();simplifyHeader();
  const m=document.getElementById('payMonth');if(document.getElementById('payList')&&m)drawPay(m.value);
})();