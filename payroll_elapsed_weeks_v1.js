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
  if(typeof window!=='undefined'&&typeof document!=='undefined'){
    const append=(src,key)=>{if(document.querySelector(`script[data-${key}]`))return;const s=document.createElement('script');s.src=src;s.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]='1';document.body.appendChild(s)};
    const install=()=>{
      append('employee_identity_ux_v1.js?v=20260914b','employee-identity-ux');
      append('payroll_contract_authority_v1.js?v=20260913f','payroll-contract-authority');
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
    else install();
  }
})();
