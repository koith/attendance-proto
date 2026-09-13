/* Senior IA: canonical daily/monthly schedule entries show actual attendance. */
(()=>{
  if(globalThis.__baekeokActualAttendanceEntryModeV1)return;
  globalThis.__baekeokActualAttendanceEntryModeV1=true;
  const params=new URLSearchParams(location.search);
  const mode=params.get('view');
  if(mode==='day'){
    const today=dayKey(kstToday());
    const baseRenderMonth=renderMonth;
    let enterDay=true;
    renderMonth=function(){
      baseRenderMonth();
      if(!enterDay)return;
      enterDay=false;
      queueMicrotask(()=>renderDay(today));
    };
  }
})();
