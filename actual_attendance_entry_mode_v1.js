/* Senior IA: canonical daily/monthly schedule entries show actual attendance; planned editors are secondary. */
(()=>{
  if(globalThis.__baekeokActualAttendanceEntryModeV1)return;
  globalThis.__baekeokActualAttendanceEntryModeV1=true;
  const params=new URLSearchParams(location.search);
  const mode=params.get('view');
  const toolbar=document.querySelector('.toolbar');
  if(toolbar&&!document.getElementById('plannedScheduleLinks')){
    const box=document.createElement('div');
    box.id='plannedScheduleLinks';
    box.style.cssText='grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;padding-top:2px';
    box.innerHTML='<a href="planned_daily_schedule.html" style="font-size:.75rem;color:var(--text-muted);text-decoration:none">일별 계획 편집</a><a href="planned_monthly_schedule.html" style="font-size:.75rem;color:var(--text-muted);text-decoration:none">월간 계획 편집</a>';
    toolbar.appendChild(box);
  }
  if(mode==='day'){
    const t=kstToday(),day=dayKey(t),ym=day.slice(0,7);
    S.ym=ym;
    Promise.resolve(loadMonth()).then(()=>renderDay(day));
  }
})();
