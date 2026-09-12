/* Quick Fix: make cross-midnight contract workdays explicit without changing stored time semantics. */
(()=>{
  if(window.__baekeokContractOvernightUi)return;
  window.__baekeokContractOvernightUi=true;
  const originalRenderWorkdayRows=renderWorkdayRows;
  const minutes=v=>{const [h,m]=String(v||'').split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null};
  function decorate(){
    document.querySelectorAll('[data-wend]').forEach(end=>{
      const wd=end.dataset.wend,start=document.querySelector(`[data-wstart="${wd}"]`); if(!start)return;
      let badge=end.closest('.timebox')?.querySelector('.overnight-badge');
      if(!badge){badge=document.createElement('span');badge.className='overnight-badge';badge.style.cssText='display:none;margin-left:6px;font-size:.72rem;font-weight:700;color:#8a5b00;white-space:nowrap';badge.textContent='익일';end.closest('.timebox')?.appendChild(badge)}
      const a=minutes(start.value),b=minutes(end.value),overnight=a!=null&&b!=null&&b<a;
      badge.style.display=overnight?'inline':'none'; end.setAttribute('aria-label',overnight?'종료 시간, 익일':'종료 시간');
    });
  }
  renderWorkdayRows=function(){originalRenderWorkdayRows();decorate();document.querySelectorAll('[data-wstart],[data-wend]').forEach(x=>x.addEventListener('change',decorate))};
})();
