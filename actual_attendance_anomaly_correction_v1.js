/* Actual attendance V1.3: anomaly-first correction affordance + historical identity clarity. */
(()=>{
  let allEmployeesPromise=null;
  const getAllEmployees=()=>allEmployeesPromise||(allEmployeesPromise=rpc('admin_list_employees').catch(()=>[]));
  async function patchIdentity(day){
    const all=await getAllEmployees();
    const map=new Map((all||[]).map(e=>[Number(e.id),e]));
    document.querySelectorAll('.person,.calendar .line b').forEach(node=>{
      const m=(node.textContent||'').trim().match(/^#(\d+)$/);if(!m)return;
      const emp=map.get(Number(m[1]));if(emp?.name)node.textContent=emp.name;
    });
    if(day){
      const ss=sessionsForDay(day);
      document.querySelectorAll('.sessions .session').forEach((row,i)=>{
        const b=row.querySelector('b'),emp=map.get(Number(ss[i]?.employee_id));
        if(b&&emp?.name&&!b.textContent.trim())b.textContent=emp.name;
      });
    }
  }
  const previousRenderDay=renderDay;
  renderDay=function(day){
    previousRenderDay(day);
    const ss=sessionsForDay(day);
    const axis=document.querySelector('.axis-wrap');
    if(axis&&!document.querySelector('.timeline-legend')){
      const legend=document.createElement('div');
      legend.className='timeline-legend';
      legend.style.cssText='display:flex;gap:12px;flex-wrap:wrap;padding:10px 12px 0;font-size:.7rem;color:#66717e';
      legend.innerHTML='<span>🟢 정상 완료</span><span>🔵 근무 중</span><span>🟤 확인 필요</span>';
      axis.before(legend);
    }
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{
      const s=ss[i];
      const reason=window.actualAttendanceIssueReason?.(s,day)||'';
      if(!reason)return;
      const button=row.querySelector('.session-fix');
      if(!button)return;
      button.textContent='바로 정정';
      button.classList.add('urgent');
      button.setAttribute('aria-label',`${reason}: 바로 정정`);
      const hint=document.createElement('div');
      hint.className='session-fix-hint';
      hint.textContent=`${reason} · 확인 후 정정하세요.`;
      row.querySelector('.session-actions')?.prepend(hint);
    });
    patchIdentity(day);
  };
  const previousRenderMonth=renderMonth;
  renderMonth=function(){previousRenderMonth();patchIdentity(null)};
})();
