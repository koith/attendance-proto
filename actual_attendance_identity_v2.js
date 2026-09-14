/* Actual attendance identity V2: preserve names for inactive historical staff and show employee No. consistently. */
(()=>{
  if(window.__baekeokActualIdentityV2)return;
  window.__baekeokActualIdentityV2=true;
  const no=id=>`No. ${String(Number(id)||0).padStart(2,'0')}`;
  let allPromise=null;
  const all=()=>allPromise||(allPromise=rpc('admin_list_employees').catch(()=>[]));
  function installStyle(){if(document.getElementById('actualIdentityStyle'))return;const s=document.createElement('style');s.id='actualIdentityStyle';s.textContent=`.employee-no-sub{display:block;margin-top:2px;font-size:.62rem;line-height:1.1;color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}.employee-no-inline{font-size:.58rem;color:var(--muted);font-weight:500;margin-left:4px;font-variant-numeric:tabular-nums}.timeline-legend{display:flex;gap:12px;flex-wrap:wrap;padding:10px 12px 0;font-size:.7rem;color:var(--sub)}.timeline-legend span{display:inline-flex;align-items:center;gap:5px}.bar-key{width:18px;height:8px;border-radius:999px;display:inline-block}.bar-key.normal{background:var(--ok)}.bar-key.working{background:var(--brand)}.bar-key.issue{background:var(--warn)}`;document.head.appendChild(s)}
  async function employeeMap(){const rows=await all();return new Map((rows||[]).map(e=>[Number(e.id),e]))}
  async function patchMonth(){installStyle();const map=await employeeMap();document.querySelectorAll('.calendar .line').forEach(line=>{const b=line.querySelector('b');if(!b)return;let id=null;const m=(b.textContent||'').trim().match(/^#(\d+)$/);if(m)id=Number(m[1]);if(id==null){const s=(line.textContent||'').trim();const emp=[...map.values()].find(e=>s.startsWith(String(e.name||'')));if(emp)id=Number(emp.id)}const e=map.get(id);if(!e)return;b.textContent=e.name;if(!line.querySelector('.employee-no-inline')){const n=document.createElement('small');n.className='employee-no-inline';n.textContent=no(e.id);b.after(n)}})}
  async function patchDay(day){installStyle();const map=await employeeMap();const ss=sessionsForDay(day);
    document.querySelectorAll('.person-row').forEach(row=>{const p=row.querySelector('.person');if(!p)return;let id=null;const raw=(p.textContent||'').trim();const m=raw.match(/^#(\d+)$/);if(m)id=Number(m[1]);if(id==null){const e=[...map.values()].find(x=>String(x.name||'')===raw);if(e)id=Number(e.id)}const e=map.get(id);if(!e)return;p.innerHTML=`<span>${e.name}</span><small class="employee-no-sub">${no(e.id)}</small>`});
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{const e=map.get(Number(ss[i]?.employee_id));const b=row.querySelector('b');if(!e||!b)return;b.innerHTML=`<span>${e.name}</span><small class="employee-no-sub">${no(e.id)}</small>`});
    const dayview=document.querySelector('.dayview');if(dayview&&!dayview.querySelector('.timeline-legend')){const l=document.createElement('div');l.className='timeline-legend';l.innerHTML='<span><i class="bar-key normal"></i>정상 완료</span><span><i class="bar-key working"></i>근무 중</span><span><i class="bar-key issue"></i>확인 필요</span>';dayview.querySelector('.axis-wrap')?.before(l)}
  }
  const m=renderMonth;renderMonth=function(){m();patchMonth()};
  const d=renderDay;renderDay=function(day){d(day);patchDay(day)};
})();