/* Actual Attendance runtime V2: attendance data is primary; employee labels are best-effort. */
(()=>{
  if(globalThis.__baekeokActualAttendanceRuntimeV2Loaded)return;
  globalThis.__baekeokActualAttendanceRuntimeV2Loaded=true;

  loadMonth=async function(){
    const app=el('app');
    app.innerHTML='<div class="loading">실근무 기록 불러오는 중…</div>';
    const {first,next}=monthBounds(S.ym);
    el('monthLabel').textContent=S.ym.replace('-','년 ')+'월';
    try{
      const results=await Promise.allSettled([
        rpc('admin_list_employees'),
        rpc('admin_events_with_corrections',{p_from:addDays(first,-7)+'T00:00:00',p_to:addDays(next,7)+'T00:00:00'})
      ]);
      const empResult=results[0], eventResult=results[1];
      if(eventResult.status!=='fulfilled')throw eventResult.reason;
      const employees=empResult.status==='fulfilled'?(empResult.value||[]):[];
      const data=eventResult.value||{};
      S.employees=employees.filter(e=>e.is_active!==false&&e.active!==false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko-KR'));
      S.sessions=pairEvents(applyCorrections(data.events||[],data.corrections||[]));
      renderMonth();
      if(empResult.status!=='fulfilled'){
        const note=document.createElement('div');
        note.className='runtime-note';
        note.textContent='직원 이름을 불러오지 못해 일부 기록은 번호로 표시됩니다.';
        app.prepend(note);
      }
    }catch(e){
      console.error('[actual-attendance-v2]',e);
      const msg=String(e&&e.message?e.message:e);
      if(/401|JWT|NOT_AUTHORIZED/.test(msg)){location.replace('index.html#admin');return;}
      app.innerHTML='<div class="empty">실근무 현황을 불러오지 못했습니다.<br><button id="retry">다시 시도</button><div class="runtime-error"></div></div>';
      const err=app.querySelector('.runtime-error');
      if(err)err.textContent=msg.slice(0,160);
      el('retry').onclick=loadMonth;
    }
  };

  if(S&&S.ym)loadMonth();
})();
