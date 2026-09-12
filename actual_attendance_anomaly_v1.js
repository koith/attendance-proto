/* Actual attendance V1.2: explain anomaly reasons without mutating raw attendance. */
(()=>{
  const LONG_SESSION_SEC=16*3600;
  window.actualAttendanceIssueReason=function(s,day){
    if(!s)return '';
    if(s.status==='ORPHAN_OUT')return '출근 누락';
    if(s.status==='INCOMPLETE')return '퇴근 누락';
    if(s.status==='WORKING'){
      const today=dayKey(kstToday());
      if(day!==today)return '과거 미퇴근';
      if(s.in&&((kstToday()-s.in)/1000)>LONG_SESSION_SEC)return '16시간 초과 · 미퇴근';
      return '';
    }
    if(s.status==='COMPLETE'&&s.sec>LONG_SESSION_SEC)return '16시간 초과';
    return '';
  };

  isIssue=function(s,day){return !!window.actualAttendanceIssueReason(s,day)};

  const previousRenderMonth=renderMonth;
  renderMonth=function(){
    previousRenderMonth();
    document.querySelectorAll('[data-day]').forEach(btn=>{
      const day=btn.dataset.day;
      const reasons=sessionsForDay(day).map(s=>window.actualAttendanceIssueReason(s,day)).filter(Boolean);
      if(reasons.length){
        btn.setAttribute('aria-label',`${day} 확인 필요 ${reasons.length}건: ${[...new Set(reasons)].join(', ')}`);
        btn.title=`확인 필요 ${reasons.length}건 · ${[...new Set(reasons)].join(' · ')}`;
      }
    });
  };

  const previousRenderDay=renderDay;
  renderDay=function(day){
    previousRenderDay(day);
    const ss=sessionsForDay(day);
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{
      const reason=window.actualAttendanceIssueReason(ss[i],day);
      if(!reason)return;
      const badge=row.querySelector('.pill.warn');
      if(badge){badge.textContent=reason;badge.setAttribute('aria-label',`확인 필요: ${reason}`)}
      row.classList.add('needs-review');
    });
  };
})();