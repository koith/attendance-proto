/* Contract employee identity V1. */
(()=>{
  if(window.__baekeokContractEmployeeNumberV1)return;
  window.__baekeokContractEmployeeNumberV1=true;
  const no=id=>`No. ${String(Number(id)||0).padStart(2,'0')}`;
  function style(){if(document.getElementById('contractEmployeeNoStyle'))return;const s=document.createElement('style');s.id='contractEmployeeNoStyle';s.textContent='.employee-no-sub{display:block;margin-top:3px;font-size:.68rem;line-height:1.1;color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}';document.head.appendChild(s)}
  function annotate(){style();const select=document.getElementById('employee');if(select&&typeof S!=='undefined'){[...select.options].forEach(o=>{const e=S.employees?.find(x=>Number(x.id)===Number(o.value));if(e)o.textContent=`${e.name} · ${no(e.id)}`})}const id=Number(S?.employeeId);if(!id)return;const e=S.employees?.find(x=>Number(x.id)===id);if(!e)return;document.querySelectorAll('.contract-main h2').forEach(h=>{if(h.querySelector('.employee-no-sub'))return;const n=document.createElement('small');n.className='employee-no-sub';n.textContent=no(e.id);h.appendChild(n)})}
  const base=window.render;if(typeof base==='function')window.render=function(...args){const r=base.apply(this,args);annotate();return r};
  queueMicrotask(annotate);
})();