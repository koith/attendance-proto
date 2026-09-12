/* Actual attendance V1.3: anomaly-first correction affordance. */
(()=>{
  const previousRenderDay=renderDay;
  renderDay=function(day){
    previousRenderDay(day);
    const ss=sessionsForDay(day);
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
  };
})();
