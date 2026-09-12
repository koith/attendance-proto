/* Quick Fix Pack 5: make cross-midnight contract times explicit without changing stored time semantics. */
(()=>{
  if(window.__baekeokContractOvernightV1)return;
  window.__baekeokContractOvernightV1=true;
  const baseRenderWorkdayRows=renderWorkdayRows;
  const isOvernight=(start,end)=>!!(start&&end&&end<start);
  function decorate(){
    const box=el('workdayRows');if(!box)return;
    box.querySelectorAll('.subcard.compact').forEach(row=>{
      const s=row.querySelector('[data-wstart]'),e=row.querySelector('[data-wend]');if(!s||!e)return;
      let note=row.querySelector('.contract-overnight-note');
      if(!note){note=document.createElement('span');note.className='contract-overnight-note hint';note.style.cssText='display:block;margin-top:6px;font-size:.76rem';row.appendChild(note)}
      note.textContent=isOvernight(s.value,e.value)?'종료: 익일 '+e.value:'당일 종료';
      note.style.visibility=(s.value&&e.value)?'visible':'hidden';
      if(!s.dataset.overnightBound){s.dataset.overnightBound='1';s.addEventListener('change',decorate)}
      if(!e.dataset.overnightBound){e.dataset.overnightBound='1';e.addEventListener('change',decorate)}
    });
  }
  renderWorkdayRows=function(){baseRenderWorkdayRows();decorate()};
  window.__contractOvernight={isOvernight,decorate};
})();
