/* Actual attendance V1.4: warning-only reference operating window (07:00–25:00). */
(()=>{
  const OPEN_HOUR=7;
  const CLOSE_HOUR=25;
  function axisHour(d,day){
    if(!d)return null;
    const [y,m,da]=day.split('-').map(Number);
    const base=new Date(y,m-1,da,0,0,0);
    return (d-base)/3600000;
  }
  window.actualAttendanceStoreWindowReason=function(s,day){
    if(!s||!day)return '';
    const inHour=axisHour(s.in,day),outHour=axisHour(s.out,day);
    if(inHour!=null&&inHour<OPEN_HOUR)return '운영 기준 07:00 이전 출근';
    if(outHour!=null&&outHour>CLOSE_HOUR)return '운영 기준 익일 01:00 이후 퇴근';
    return '';
  };

  const previousReason=window.actualAttendanceIssueReason;
  window.actualAttendanceIssueReason=function(s,day){
    return previousReason?.(s,day)||window.actualAttendanceStoreWindowReason(s,day);
  };
  isIssue=function(s,day){return !!window.actualAttendanceIssueReason(s,day)};
})();
