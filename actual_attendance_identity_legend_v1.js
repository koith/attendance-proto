/* Actual attendance identity + timeline semantics.
   Historical attendance must keep the employee identity even when the employee is inactive. */
(()=>{
  if(window.__baekeokActualIdentityLegendV1)return;
  window.__baekeokActualIdentityLegendV1=true;
  let allEmployeesPromise=null;
  const allEmployees=()=>allEmployeesPromise||(allEmployeesPromise=rpc('admin_list_employees').catch(()=>[]));

  async function patchHistoricalIdentities(day){
    const all=await allEmployees();
    if(!Array.isArray(all)||!all.length)return;
    const map=new Map(all.map(e=>[Number(e.id),e]));
    let changed=false;
    for(const e of all){
      if(!S.employees.some(x=>Number(x.id)===Number(e.id))){S.employees.push(e);changed=true}
    }
    if(changed)S.employees.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko-KR'));

    document.querySelectorAll('.person').forEach(node=>{
      const m=(node.textContent||'').trim().match(/^#(\d+)$/);if(!m)return;
      const emp=map.get(Number(m[1]));if(emp?.name)node.textContent=emp.name;
    });
    document.querySelectorAll('.calendar .line b').forEach(node=>{
      const m=(node.textContent||'').trim().match(/^#(\d+)$/);if(!m)return;
      const emp=map.get(Number(m[1]));if(emp?.name)node.textContent=emp.name;
    });
    if(day){
      const ss=sessionsForDay(day);
      document.querySelectorAll('.sessions .session').forEach((row,i)=>{
        const emp=map.get(Number(ss[i]?.employee_id));const b=row.querySelector('b');
        if(b&&emp?.name&&!b.textContent.trim())b.textContent=emp.name;
      });
    }
  }

  const sourceMonth=renderMonth;
  renderMonth=function(){sourceMonth();patchHistoricalIdentities(null)};
  const sourceDay=renderDay;
  renderDay=function(day){
    sourceDay(day);
    const dayview=document.querySelector('.dayview');
    if(dayview&&!dayview.querySelector('.timeline-legend')){
      const legend=document.createElement('div');
      legend.className='timeline-legend';
      legend.innerHTML='<span><i class="bar-key normal"></i>정상 완료</span><span><i class="bar-key working"></i>근무 중</span><span><i class="bar-key issue"></i>확인 필요</span>';
      dayview.querySelector('.axis-wrap')?.before(legend);
    }
    patchHistoricalIdentities(day);
  };
})();
