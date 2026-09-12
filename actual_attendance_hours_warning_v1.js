/* Actual attendance V1.4: display-window warning only. No automatic clock-out or data mutation. */
(()=>{
  const DISPLAY_START=7;
  const DISPLAY_END=25;
  function wallHour(d,day){
    if(!d)return null;
    const [y,m,da]=day.split('-').map(Number);
    return (d-new Date(y,m-1,da,0,0,0))/3600000;
  }
  window.actualAttendanceHoursWarning=function(s,day){
    if(!s||!day)return '';
    const start=wallHour(s.in||s.out,day);
    const end=s.out?wallHour(s.out,day):null;
    if(start!=null&&start<DISPLAY_START)return '표시 기준 07:00 이전 기록';
    if(start!=null&&start>DISPLAY_END)return '표시 기준 익일 01:00 이후 기록';
    if(end!=null&&end>DISPLAY_END)return '표시 기준 익일 01:00 이후 퇴근';
    return '';
  };

  const previousRenderDay=renderDay;
  renderDay=function(day){
    previousRenderDay(day);
    const ss=sessionsForDay(day);
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{
      const warning=window.actualAttendanceHoursWarning(ss[i],day);
      if(!warning)return;
      const meta=row.querySelector('.meta');
      if(!meta)return;
      const note=document.createElement('div');
      note.className='hours-window-note';
      note.textContent=warning;
      meta.after(note);
    });
  };
})();
