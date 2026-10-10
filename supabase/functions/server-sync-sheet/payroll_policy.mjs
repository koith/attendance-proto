// Pure policy helpers: amounts are integer won; approval history is server-owned.
export const truncateWon=value=>Math.trunc(Number(value)||0);
export function approvedWeeklyAdjustment(base,amount,reason,approver,approvedAt){
  if(amount==null)return {amount:truncateWon(base),adjusted:false};
  if(!Number.isFinite(Number(amount))||Number(amount)<0||!String(reason||'').trim()||!approver||!approvedAt)
    throw new Error('Approval and reason required');
  return {amount:truncateWon(amount),original:truncateWon(base),adjusted:true,reason,approver,approvedAt};
}
// weekdays follow PostgreSQL extract(dow): Sunday=0, Monday=1.
export function assessWeeklyRest({weeklyMinutes,workdays,sessions,substitutions=[],departureDate=null,weekStart}){
  const start=new Date(weekStart+'T00:00:00');
  if(!Number.isFinite(start.getTime()))throw new Error('Invalid weekStart');
  const planned=(workdays||[]).filter(x=>Number(x.contracted_minutes)>0);
  const actual=new Map();
  for(const s of sessions||[]){
    if(s.status!=='COMPLETE'||!s.in||!Number.isFinite(Number(s.sec))||Number(s.sec)<=0)continue;
    const d=s.in instanceof Date?s.in:new Date(s.in);
    if(!Number.isFinite(d.getTime()))continue;
    const monday=new Date(d);monday.setHours(0,0,0,0);monday.setDate(d.getDate()-((d.getDay()+6)%7));
    if(monday.getTime()!==start.getTime())continue;
    const dow=d.getDay();
    actual.set(dow,(actual.get(dow)||0)+Number(s.sec)/60);
  }
  // Do not count duplicate workday rows twice; they describe the same contracted day.
  const contractedByDay=new Map();
  for(const row of planned){
    const day=Number(row.weekday),minutes=Number(row.contracted_minutes);
    if(!Number.isInteger(day)||day<0||day>6)throw new Error('Invalid contracted weekday');
    contractedByDay.set(day,Math.max(contractedByDay.get(day)||0,minutes));
  }
  const missing=[...contractedByDay].filter(([day,minutes])=>(actual.get(day)||0)+0.00001<minutes).map(([day])=>day);
  const reasons=[];
  if(Number(weeklyMinutes)<900)reasons.push('계약상 주 15시간 미만');
  if(!planned.length)reasons.push('계약상 소정근로일 확인 필요');
  if(missing.length)reasons.push('소정근로일 근무 또는 승인된 교대 확인 필요: '+missing.join(','));
  if(substitutions.length)reasons.push('대타·교대 기록 양측 계약 및 승인 검토 필요');
  if(departureDate)reasons.push('퇴사 주간 추가 주휴 지급 전 관리자 검토 필요');
  return {completed:planned.length>0&&missing.length===0,automaticEligible:Number(weeklyMinutes)>=900&&planned.length>0&&!missing.length&&!substitutions.length&&!departureDate,
    requiresReview:!!reasons.length,reasons,missingDays:missing};
}
