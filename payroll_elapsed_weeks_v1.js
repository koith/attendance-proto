/* Quick Fix Pack 7: do not pre-book weekly holiday allowance for future weeks. */
(()=>{
  function completedWeeksInMonth(ym,now){
    const m=String(ym||'');
    if(!/^\d{4}-\d{2}$/.test(m))return 0;
    const [y,mo]=m.split('-').map(Number);
    const cur=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(m<cur)return 4;
    if(m>cur)return 0;
    let completed=0;
    for(let d=1;d<now.getDate();d++){
      if(new Date(y,mo-1,d).getDay()===0)completed++;
    }
    return Math.min(4,completed);
  }
  globalThis.__payrollElapsedWeeksV1={completedWeeksInMonth};

  // Browser-only loader. DOMContentLoaded is deterministic here because index.html's inline app
  // has already declared the payroll functions before this event fires. Do not wait for window.load.
  if(typeof window!=='undefined'&&typeof document!=='undefined'){
    const install=()=>{
      if(document.querySelector('script[data-payroll-contract-authority]'))return;
      const s=document.createElement('script');
      s.src='payroll_contract_authority_v1.js?v=20260913b';
      s.dataset.payrollContractAuthority='1';
      document.body.appendChild(s);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
    else install();
  }
})();
