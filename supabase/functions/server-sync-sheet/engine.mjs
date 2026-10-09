import {assessWeeklyRest,approvedWeeklyAdjustment,truncateWon} from './payroll_policy.mjs';
/* Server runtime mirrors the browser's payroll and sheet report algorithms.
   SOURCE SNAPSHOT: index.html v0.181, payroll_contract_authority_v1.js,
   payroll_night_allowance_v1.js. Never add independent payroll policy here.
   Tests compare the extracted browser source to these functions. */
export function createPayrollEngine({BE,storeId=1,storeName="인하대학교점",now=new Date()}){
  const LIVE=true,CURRENT_STORE_ID=Number(storeId),CONFIG={STORE_NAME:storeName},
    STORE_NAME_BY_ID=new Map([[Number(storeId),storeName]]);
  // Represent KST local wall-time as UTC Date for deterministic Edge/Node execution.
  const kt=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const kp=Object.fromEntries(kt.map(x=>[x.type,x.value]));
  const nowWall=new Date(Date.UTC(+kp.year,+kp.month-1,+kp.day,+kp.hour,+kp.minute,+kp.second));
  function kstNow(){return new Date(nowWall.getTime());}
  function won(n){return (n||0).toLocaleString("ko-KR")+"원";}
  function weeksInMonth(ym){const [y,m]=ym.split("-").map(Number),cur=`${nowWall.getFullYear()}-${String(nowWall.getMonth()+1).padStart(2,"0")}`;if(ym<cur)return 4;if(ym>cur)return 0;let n=0;for(let d=1;d<nowWall.getDate();d++)if(new Date(y,m-1,d).getDay()===0)n++;return Math.min(4,n)}
  function secToHours(sec){ return sec/3600; }
  function xround(x,n){ // ROUND(x,10^-n): n=-1 → 10원 반올림
  const step=Math.pow(10,-n); return Math.round(x/step)*step;
}
  function xrounddown(x,n){ const step=Math.pow(10,-n); return Math.floor(x/step)*step; }
  function sheetCorrectionReason(reason){
  const labels={SYSTEM_STORE_CLOSE:"영업 종료 자동 보정",SYSTEM_AUTO_CLOSE:"시스템 자동 퇴근",AUTO_CLOSE:"시스템 자동 퇴근"};
  return String(reason||"").split(/\s*\/\s*/).map(part=>labels[part]||part).filter(Boolean).join(" / ");
}
  function sheetDuration(sec){sec=Math.max(0,Math.round(Number(sec)||0));const mins=Math.floor(sec/60);return `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;}
  function sheetClock(value){const d=value instanceof Date?value:fromIso(value);if(!Number.isFinite(d.getTime()))return "—";return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
  function _statusLabel(s){ return {COMPLETE:"정상",WORKING:"근무중",INCOMPLETE:"퇴근누락",ORPHAN_OUT:"출근누락"}[s]||s; }
  function fromIso(s){
  if(s instanceof Date) return s;
  if(s==null) return new Date(NaN);
  const str=String(s).trim();
  // TZ 명시가 있으면 표준 파싱에 맡김 (Z 또는 +09:00/-05:00 등)
  if(/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  // TZ 없는 로컬 벽시계: 공백/T 구분 모두 허용, 초·소수초 선택
  const m=str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if(!m) return new Date(NaN);
  const [_,Y,Mo,D,H,Mi,S]=m;
  // new Date(y,mo-1,...) = 브라우저 로컬시간대 기준 생성 = KST 벽시계 값 보존(서버가 KST로 기록해온 의미)
  return new Date(+Y, +Mo-1, +D, +H, +Mi, S?+S:0, 0);
}
  function applyCorrections(events, corrections){
  const corrByEvent={}; const added=[];
  for(const c of (corrections||[])){
    if(c.action==="ADD"){ added.push(c); continue; }
    // 같은 event_id의 보정 중 최신만 유효
    if(c.event_id!=null){ const prev=corrByEvent[c.event_id];
      if(!prev || new Date(c.created_at)>new Date(prev.created_at)) corrByEvent[c.event_id]=c; }
  }
  const eff=[];
  for(const e of (events||[])){
    const c=corrByEvent[e.id];
    if(c){
      if(c.action==="VOID") continue; // 무효화된 이벤트 제외
      eff.push({ id:e.id, employee_id:e.employee_id,
        event_type: c.action==="EDIT_TYPE"&&c.new_event_type ? c.new_event_type : e.event_type,
        event_at: c.action==="EDIT_TIME"&&c.new_event_at ? c.new_event_at : e.event_at,
        corrected:true, correctionReason:String(c.reason||c.correction_reason||"") });
    } else {
      eff.push({ id:e.id, employee_id:e.employee_id, event_type:e.event_type, event_at:e.event_at });
    }
  }
  // 관리자가 추가(ADD)한 누락분
  for(const c of added){
    eff.push({ id:"add_"+c.id, employee_id:c.employee_id, event_type:c.new_event_type,
      event_at:c.new_event_at, corrected:true, correctionReason:String(c.reason||c.correction_reason||""), addedByAdmin:true });
  }
  return eff;
}
  function pairEvents(rows){
  // 정렬: effective 시간값 우선, 동일 시각이면 event id로 deterministic tie-break
  //  (문자열 사전식 비교 제거 — 형식 혼재 시 순서 역전 방지. correction 후에도 원본 id 유지됨)
  const s=[...rows].sort((a,b)=>{
    const ta=fromIso(a.event_at).getTime(), tb=fromIso(b.event_at).getTime();
    const na=isNaN(ta), nb=isNaN(tb);
    if(na||nb){ if(na&&nb) return 0; return na?1:-1; }  // Invalid는 뒤로
    if(ta!==tb) return ta-tb;
    // 동일 시각 → id 차선 (raw 생성순서 보존). id는 숫자 또는 "add_N"
    return idOrder(a.id) - idOrder(b.id);
  });
  const out=[]; let openIn=null, openInId=null, openInRaw=null, openInCorrected=false, openInReason="";
  for(const r of s){
    const when=fromIso(r.event_at);
    if(r.event_type==="IN"){
      if(openIn!==null) out.push({in:openIn,out:null,sec:null,status:"INCOMPLETE",inId:openInId,outId:null,inRaw:openInRaw,outRaw:null,corrected:!!openInCorrected, correctionReason:openInReason});
      openIn=when; openInId=r.id; openInRaw=r.event_at; openInCorrected=!!r.corrected; openInReason=r.correctionReason||"";
    }else if(r.event_type==="OUT"){
      if(openIn!==null){
        // Invalid Date 방어: 어느 한쪽이라도 파싱 실패면 sec=null(합산 제외), status로 표시
        const sec=(isNaN(openIn)||isNaN(when))?null:(when-openIn)/1000;
        out.push({in:openIn,out:when,sec,status:sec==null?"INVALID_TIME":"COMPLETE",inId:openInId,outId:r.id,inRaw:openInRaw,outRaw:r.event_at,corrected:!!(openInCorrected||r.corrected), correctionReason:[openInReason,r.correctionReason].filter(Boolean).join(" / ")}); openIn=null; openInId=null; openInRaw=null; openInCorrected=false; openInReason="";
      }
      else out.push({in:null,out:when,sec:null,status:"ORPHAN_OUT",inId:null,outId:r.id,inRaw:null,outRaw:r.event_at,corrected:!!r.corrected, correctionReason:r.correctionReason||""});
    }
  }
  if(openIn!==null) out.push({in:openIn,out:null,sec:null,status:"WORKING",inId:openInId,outId:null,inRaw:openInRaw,outRaw:null,corrected:!!openInCorrected});
  return out;
}
  function idOrder(id){
  if(typeof id==="number") return id;
  const m=String(id).match(/^add_(\d+)$/);
  if(m) return 1e15 + (+m[1]);   // add는 동일시각 시 raw 다음
  const n=Number(id); return isNaN(n)?0:n;
}
  function calcPayroll(emp, monthHours, weeks, ov){
  ov = ov||{};
  // 기본값 + 이번 달 override 병합
  const wage = (ov.wage_override!=null) ? ov.wage_override : (emp.wage||0);
  const jh   = (ov.juhyu_hours_override!=null) ? ov.juhyu_hours_override : (emp.juhyu_hours||0);
  const jweeks = (ov.juhyu_weeks_override!=null) ? ov.juhyu_weeks_override : (weeks||0);
  const rate = (ov.tax_rate_override!=null) ? ov.tax_rate_override : ((emp.tax_rate!=null)?emp.tax_rate:0.033);
  const adjust = ov.adjust_amount||0;

  const base=Math.trunc(wage*monthHours);              // 기본급 10원 반올림
  let juhyu=0, weekly=0;
  if(jh>0){
    weekly = (emp.juhyu_round!=null) ? xround(wage*jh, emp.juhyu_round) : Math.round(wage*jh);
    juhyu = Math.round(weekly*jweeks);               // 원 단위 정수화 (부동소수점 오차 제거)
  }
  const gross=Math.round(base+juhyu+adjust);         // 임의 가감액 포함
  const net=xrounddown(gross*(1-rate),-1);           // 세후 10원 버림
  return {base, weekly, juhyu, adjust, gross, net, rate, wage, jweeks, usedOverride:Object.keys(ov).length>0};
}
  function isHiddenInhaTestEmployee(e){
  if(Number(CURRENT_STORE_ID)!==1||!e)return false;
  const memo=String(e.memo||"").trim();
  const name=String(e.name||"").trim().toLowerCase();
  return memo==="데모 지점 직원"||memo.includes("테스트")||name.startsWith("test")||name.startsWith("테스트");
}
  async function computeMonthPayroll(ym){
  let emps=[], events=[];
  emps=await BE.allEmployees();
  if(LIVE){
    const [y,m]=ym.split("-").map(Number); const p=n=>String(n).padStart(2,"0");
    const start=new Date(y,m-1,1); start.setDate(start.getDate()-1);
    const end=new Date(y,m,1); end.setDate(end.getDate()+2);
    const sd=`${start.getFullYear()}-${p(start.getMonth()+1)}-${p(start.getDate())}`;
    const ed=`${end.getFullYear()}-${p(end.getMonth()+1)}-${p(end.getDate())}`;
    const data=await BE.eventsWithCorrections(`${sd}T00:00:00`,`${ed}T00:00:00`);
    events=applyCorrections(data.events, data.corrections);
  } else {
    events=await BE.monthEvents(ym);
  }
  const isActive=e=>e.is_active!==false && e.active!==false;
  const active=emps.filter(isActive);
  const eventEmployeeIds=new Set(events.map(x=>Number(x.employee_id)));
  const payrollCandidates=emps.filter(e=>isActive(e)||eventEmployeeIds.has(Number(e.id)));
  let periodWeeks=null, overrides={}, contracts={}, contractWorkdays={}, substitutions=[], weeklyApprovals=[], employmentPeriods=[];
  if(LIVE){
    try{
      const pd=await BE.payrollPeriod(ym);
      periodWeeks = pd.period && pd.period.weeks;
      (pd.overrides||[]).forEach(o=>{ overrides[o.employee_id]=o; });
    }catch(e){ console.warn("payroll period load failed",e); }
    try{
      const cs=await BE.payrollContracts(ym);
      (cs||[]).forEach(c=>{ contracts[Number(c.employee_id)]=c; });
      const ws=await BE.payrollContractWorkdays(ym);
      (ws||[]).forEach(w=>{
        const id=Number(w.employee_id); if(!contractWorkdays[id]) contractWorkdays[id]={weeklyMinutes:Number(w.weekly_contracted_minutes||0),days:{}};
        if(w.weekday!=null) contractWorkdays[id].days[Number(w.weekday)]=Number(w.contracted_minutes||0);
      });
    }catch(e){ console.warn("payroll contract load failed",e); }
    try{ substitutions=await BE.payrollSubstitutions(ym)||[]; }catch(e){ console.warn("payroll substitution load failed",e); }
    if(typeof BE.payrollWeeklyApprovals==='function')weeklyApprovals=await BE.payrollWeeklyApprovals(ym)||[];
    if(typeof BE.payrollEmploymentPeriods==='function')employmentPeriods=await BE.payrollEmploymentPeriods(ym)||[];
  }
  const weeks = periodWeeks || weeksInMonth(ym);
  const p2=n=>String(n).padStart(2,"0");
  const rows=[]; let totalNet=0, totalGross=0;
  for(const e of payrollCandidates){
    const evs=events.filter(x=>Number(x.employee_id)===Number(e.id));
    const allSess=pairEvents(evs);
    const sess=allSess.filter(s=>{ const a=s.in||s.out; if(!a)return false;
      const payrollAnchor=s.in||s.out; // 말일 심야근무도 출근한 달 급여에 전부 귀속
      return `${payrollAnchor.getFullYear()}-${p2(payrollAnchor.getMonth()+1)}`===ym; });
    // Deactivation is a current roster state, not a reason to erase historical payroll.
    if(!isActive(e)&&!sess.length) continue;
    const completedSec=sess.filter(s=>s.status==="COMPLETE").reduce((a,s)=>a+(s.sec||0),0);
    const liveSec=sess.filter(s=>s.status==="WORKING"&&s.in).reduce((a,x)=>a+Math.max(0,(kstNow()-x.in)/1000),0);
    const sec=completedSec+liveSec;
    const hours=secToHours(sec);
    const nightMinutes=sess.filter(s=>s.status==="COMPLETE"&&s.in&&s.out).reduce((sum,s)=>{
      let cur=new Date(s.in), end=new Date(s.out), mins=0;
      while(cur<end){ const h=cur.getHours(); if(h>=22||h<6) mins++; cur=new Date(cur.getTime()+60000); }
      return sum+mins;
    },0);
    const eligibleBreakSessions=sess.filter(s=>s.status==="COMPLETE"&&Number(s.sec||0)>4*3600);
    const breakEligibleCount=eligibleBreakSessions.length;
    const issues=sess.filter(s=>s.status==="INCOMPLETE"||s.status==="ORPHAN_OUT").length;
    const ov=overrides[e.id]||null;
    const contract=contracts[Number(e.id)]||null;
    // Contract-level rule: over 4h + break provided => no allowance.
    // Over 4h + break not provided => automatically add 30 minutes (= 50% of hourly wage) per eligible shift.
    const breakMode=contract?.break_provision_mode||(contract?.break_time_provided===true?'PROVIDED':'NOT_PROVIDED');
    const breakTimeProvided=breakMode==='PROVIDED';
    const breakConfirmedCount=breakTimeProvided?breakEligibleCount:0;
    const breakNotProvidedCount=breakMode==='NOT_PROVIDED'?breakEligibleCount:0;
    const breakCompensateCount=breakNotProvidedCount;
    // Per completed shift: >4h earns 30m; >=8h earns 60m (not cumulative).
    const breakBonusMinutes=breakMode!=='NOT_PROVIDED'?0:eligibleBreakSessions.reduce((sum,shift)=>sum+(Number(shift.sec||0)>=8*3600?60:30),0);
    // Provided break: first 30m is bounded by time beyond 4h; next 30m beyond 8h30.
    // 4:20 => 4:00 payable, 8:40 => 8:00 payable, 9:00 => 8:00 payable.
    const breakDeductSeconds=breakTimeProvided?sess.filter(s=>s.status==="COMPLETE").reduce((sum,shift)=>{const t=Math.max(0,Number(shift.sec||0));return sum+Math.min(1800,Math.max(0,t-4*3600))+Math.min(1800,Math.max(0,t-8.5*3600));},0):0;
    const paidHours=secToHours(Math.max(0,sec-breakDeductSeconds));
    const payrollType=contract?.payroll_type||((e.wage||0)>0?"HOURLY":null);
    const substituteRows=substitutions.filter(x=>Number(x.substitute_employee_id)===Number(e.id));
    const substituteMinutes=substituteRows.reduce((sum,x)=>sum+Math.max(0,Number(x.actual_minutes||0)),0);
    let substitutePay=0;
    for(const sr of substituteRows){
      const requesterContract=contracts[Number(sr.requester_employee_id)]||null;
      const requesterEmp=emps.find(x=>Number(x.id)===Number(sr.requester_employee_id));
      const substituteWage=Number(requesterContract?.hourly_wage||requesterEmp?.wage||0);
      if(substituteWage>0) substitutePay+=xround(substituteWage*(Math.max(0,Number(sr.actual_minutes||0))/60),-1);
    }
    const contractWage=payrollType==="HOURLY"?Number(contract?.hourly_wage||0):0;
    const effWage=(ov&&ov.wage_override!=null)?Number(ov.wage_override):(contractWage||Number(e.wage||0));
    let pay=null;
    if(payrollType==="MONTHLY"&&Number(contract?.monthly_salary||0)>0){
      // 월급제 대표값은 정상 출퇴근이 완료된 날짜만 일할 누적한다.
      // 예: 260만원 / 30일 × 정상 출퇴근 1일.
      const [yy,mm]=ym.split("-").map(Number);
      const daysInMonth=new Date(yy,mm,0).getDate();
      const monthlySalary=Number(contract.monthly_salary);
      const completedDayKeys=new Set(sess.filter(x=>x.status==="COMPLETE"&&x.in&&x.out).map(x=>`${x.in.getFullYear()}-${p2(x.in.getMonth()+1)}-${p2(x.in.getDate())}`));
      const accruedDays=completedDayKeys.size;
      const accruedBase=Math.trunc(monthlySalary/daysInMonth*accruedDays);
      const gross=Math.round(accruedBase+substitutePay+(ov?.adjust_amount||0));
      const rate=(ov?.tax_rate_override!=null)?Number(ov.tax_rate_override):(contract.tax_treatment==="BUSINESS_INCOME"?Number(contract.business_deduction_rate||0.033):0);
      pay={base:accruedBase,weekly:0,juhyu:0,substitutePay,substituteMinutes,adjust:ov?.adjust_amount||0,gross,net:xrounddown(gross*(1-rate),-1),rate,wage:0,jweeks:0,usedOverride:!!ov,payrollType:"MONTHLY",monthlySalary,accruedDays,daysInMonth};
    }else if(effWage>0){
      const payrollEmp=contract?{...e,wage:effWage,juhyu_hours:0}:{...e,wage:effWage};
      const payrollOv=contract?{...ov,juhyu_hours_override:0,juhyu_weeks_override:0}:ov;
      pay=calcPayroll(payrollEmp,paidHours,weeks,payrollOv); pay.payrollType="HOURLY";
      // Never preload a month's holiday allowance. Holiday pay is earned only
      // from weeks that actually satisfy the contracted weekly minutes.
      pay.weekly=0; pay.juhyu=0; pay.jweeks=0;
      if(contract){
        // A contract-based hourly employee with no completed work must never receive prefilled/legacy holiday pay.
        if(hours<=0){pay.base=0;pay.weekly=0;pay.juhyu=0;pay.adjust=0;pay.gross=0;pay.net=0;pay.jweeks=0;}
        const cw=contractWorkdays[Number(e.id)];
        const weeklyContractMin=Number(cw?.weeklyMinutes||0);
        let qualifiedWeeks=0, juhyuHours=0;
        const weeklyReviewComments=[];
        const weeklyAmounts=new Map();
        if(weeklyContractMin>=900 && cw){
          const weekMap={};
          for(const ss of sess.filter(x=>x.status==="COMPLETE")){
            if(!ss.in) continue;
            const d=new Date(ss.in); const day=(d.getDay()+6)%7;
            const monday=new Date(d); monday.setHours(0,0,0,0); monday.setDate(d.getDate()-day);
            const key=`${monday.getFullYear()}-${p2(monday.getMonth()+1)}-${p2(monday.getDate())}`;
            const mins=ss.status==="WORKING"?Math.max(0,(kstNow()-ss.in)/60000):Math.max(0,(ss.sec||0)/60);
            weekMap[key]=(weekMap[key]||0)+mins;
          }
          const weeklyHolidayHours=Math.min(8,weeklyContractMin/300);
          const [py,pm]=ym.split("-").map(Number);
          const monthStart=new Date(py,pm-1,1); monthStart.setHours(0,0,0,0);
          const monthEnd=new Date(py,pm,0); monthEnd.setHours(23,59,59,999);
          const nowLimit=kstNow();
          for(const [weekKey,mins] of Object.entries(weekMap)){
            const monday=new Date(weekKey+"T00:00:00");
            // 인하대점 운영일은 일요일 심야근무(26:00 = 월요일 02:00)까지 포함해 주간을 마감한다.
            // 진행 중 세션은 위에서 제외했으므로, 주휴는 완료된 근무만으로 확정된다.
            const settleAt=new Date(monday); settleAt.setDate(monday.getDate()+7); settleAt.setHours(2,0,0,0);
            const weekClosed=(ym<`${nowLimit.getFullYear()}-${p2(nowLimit.getMonth()+1)}`) || settleAt<=nowLimit;
            if(weekClosed && mins>=weeklyContractMin){
              const mondayKey=weekKey;
              const weeklySubstitutions=substitutions.filter(z=>{
                const d=new Date(z.work_start);if(!Number.isFinite(d.getTime()))return false;
                const start=new Date(mondayKey+'T00:00:00');return d>=start&&d<new Date(start.getTime()+7*86400000)&&
                  (Number(z.requester_employee_id)===Number(e.id)||Number(z.substitute_employee_id)===Number(e.id));
              });
              const weeklyWorkdays=Object.entries(cw.days).map(([weekday,contracted_minutes])=>({weekday,contracted_minutes}));
              const weekEnd=new Date(mondayKey+'T00:00:00');weekEnd.setDate(weekEnd.getDate()+6);
              const endKey=`${weekEnd.getFullYear()}-${p2(weekEnd.getMonth()+1)}-${p2(weekEnd.getDate())}`;
              const departureDate=employmentPeriods.filter(p=>Number(p.employee_id)===Number(e.id)&&
                p.ended_on&&p.ended_on>=mondayKey&&p.ended_on<=endKey)
                .map(p=>p.ended_on)[0]||null;
              const review=assessWeeklyRest({weeklyMinutes:weeklyContractMin,workdays:weeklyWorkdays,departureDate,
                sessions:sess,substitutions:weeklySubstitutions,weekStart:mondayKey});
              if(review.automaticEligible){qualifiedWeeks++;juhyuHours+=weeklyHolidayHours;weeklyAmounts.set(mondayKey,truncateWon(effWage*weeklyHolidayHours));}
              else {weeklyReviewComments.push(...review.reasons.map(reason=>mondayKey+': '+reason));if(review.completed&&departureDate)weeklyReviewComments.push(mondayKey+': 퇴사 주간 추가 지급 검토액 '+truncateWon(effWage*weeklyHolidayHours)+'원');}
            }
          }
        }
        pay.weeklyReviewComments=weeklyReviewComments;
        const employeeApprovals=weeklyApprovals.filter(a=>Number(a.employee_id)===Number(e.id));
        const approvedWeeks=new Set();
        let approvalDelta=0;
        for(const a of employeeApprovals){
          if(approvedWeeks.has(a.week_start))continue;
          approvedWeeks.add(a.week_start);
          const original=weeklyAmounts.get(a.week_start)||0;
          const decision=approvedWeeklyAdjustment(original,a.approved_won,a.reason,a.approved_by,a.approved_at);
          approvalDelta+=decision.amount-original;
          weeklyReviewComments.push(a.week_start+': 관리자 승인 '+original+'원 → '+decision.amount+'원 ('+a.reason+')');
        }
        pay.weeklyCalculatedAmounts=Object.fromEntries(weeklyAmounts);
        pay.weeklyApprovalDelta=approvalDelta;
        pay.jweeks=qualifiedWeeks;
        pay.weekly=Math.round(effWage*Math.min(8,weeklyContractMin/300));
        pay.juhyu=Math.trunc(effWage*juhyuHours)+Number(pay.weeklyApprovalDelta||0);
        if(hours<=0){pay.base=0;pay.weekly=0;pay.juhyu=0;pay.adjust=0;pay.gross=0;pay.net=0;pay.jweeks=0;}
        else {const breakCompPay=Math.trunc((effWage||0)*breakBonusMinutes/60);pay.breakCompPay=breakCompPay;pay.gross=Math.round(pay.base+pay.juhyu+pay.adjust+breakCompPay);pay.net=xrounddown(pay.gross*(1-pay.rate),-1);}
      }
    }
    if(pay && sec<=0 && payrollType!=="MONTHLY"){ pay.base=0; pay.weekly=0; pay.juhyu=0; pay.adjust=0; pay.gross=0; pay.net=0; pay.jweeks=0; }
    // Final payroll invariant: no completed work in the selected month means no earned pay
    // for wage-based employees, regardless of legacy juhyu/override data.
    if(sec<=0 && Number(e.wage||0)>0){
      const zeroWage=Number(effWage||e.wage||0);
      pay={base:0,weekly:0,juhyu:0,adjust:0,gross:0,net:0,rate:0,wage:zeroWage,jweeks:0,usedOverride:false,payrollType:"HOURLY"};
    }
    const hasWage=!!pay;
    // Contract-specific night premium is earned only on completed shifts and only when enabled.
    // RATE is a percentage of the employee's hourly wage; FLAT is won per night hour.
    let nightAllowance=0, nightAllowanceLabel="미적용";
    if(contract?.night_allowance_enabled===true){
      const mode=String(contract.night_allowance_mode||"RATE").toUpperCase();
      const value=Math.max(0,Number(contract.night_allowance_value||0));
      const timeMin=(v,fallback)=>{const m=String(v||"").match(/^([0-9]{1,2}):([0-9]{2})/);return m?Number(m[1])*60+Number(m[2]):fallback;};
      const startMin=timeMin(contract.night_allowance_start,1320),endMin=timeMin(contract.night_allowance_end,360);
      const nightWorkedMin=sess.filter(x=>x.status==="COMPLETE"&&x.in&&x.out).reduce((sum,shift)=>{
        let t=new Date(shift.in),stop=new Date(shift.out),minutes=0;
        while(t<stop){const minute=t.getHours()*60+t.getMinutes();if(startMin<endMin?(minute>=startMin&&minute<endMin):(minute>=startMin||minute<endMin))minutes++;t=new Date(t.getTime()+60000);}
        return sum+minutes;
      },0);
      const hourlyBase=payrollType==="HOURLY"?Number(effWage||0):0;
      if(mode==="FLAT"||hourlyBase>0){
        nightAllowance=Math.trunc(nightWorkedMin/60*(mode==="FLAT"?value:hourlyBase*value/100));
        nightAllowanceLabel=mode==="FLAT"?`정액 ${won(value)}/시간`:`정률 ${value}%`;
      }else nightAllowanceLabel="시급 기준 확인 필요";
      if(pay&&nightAllowance>0){pay.nightAllowance=nightAllowance;pay.gross=Math.round(Number(pay.gross||0)+nightAllowance);pay.net=xrounddown(pay.gross*(1-Number(pay.rate||0)),-1);}
    }
    if(pay){pay.nightAllowance=nightAllowance;pay.nightAllowanceLabel=nightAllowanceLabel;}
    if(pay){ totalNet+=Number(pay.net||0); totalGross+=Number(pay.gross||0); }
    rows.push({employee_id:e.id, employee_name:e.name, emp:e, hours, sec, sessions:sess, issues, ov,
      hasWage, pay, contract, payrollType, substitutePay, substituteMinutes, nightMinutes, breakEligibleCount, breakConfirmedCount, breakNotProvidedCount, breakCompensateCount, breakBonusMinutes, breakDeductSeconds, breakTimeProvided, breakMode, breakDecisions:[], memo:(ov&&ov.memo)||e.memo||""});
  }
  const payrollEmployees=rows.map(r=>r.emp);
  return {active:payrollEmployees, events, weeks, overrides, rows, totalNet, totalGross};
}
  async function buildSheetSyncPayload(ym){
  const calculated=await computeMonthPayroll(ym);
  // Test employees remain in the app and database, but never enter exported reports.
  const R={...calculated,rows:calculated.rows.filter(rec=>String(rec.employee_name||'').trim().toUpperCase()!=='TEST')};
  const p2=n=>String(n).padStart(2,"0");
  const dstr=d=>`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  // 근태 일별요약 + 세션상세
  const attRows=[], sessRows=[];
  for(const rec of R.rows){
    // 날짜별 그룹핑 (출근일 기준)
    const byDay={};
    for(const s of rec.sessions){
      const anchor=s.in||s.out; if(!anchor) continue;
      const day=dstr(anchor);
      (byDay[day]=byDay[day]||[]).push(s);
    }
    for(const day of Object.keys(byDay).sort()){
      const daySess=byDay[day];
      let daySec=0, hasCorrected=false, issue=false;
      daySess.forEach((s,i)=>{
        if(s.status==="COMPLETE") daySec+=(s.sec||0);
        if(s.status==="INCOMPLETE"||s.status==="ORPHAN_OUT") issue=true;
        if(s.corrected) hasCorrected=true;
        const sessionAnchor=s.in||s.out;
        sessRows.push([day, rec.employee_name, i+1,
          s.in?sheetClock(s.in):"—", s.out?sheetClock(s.out):"—",
          s.status==="COMPLETE"?sheetDuration(s.sec):(s.status==="WORKING"?"근무중":"—"),
          _statusLabel(s.status), s.corrected?"정정":"", sheetCorrectionReason(s.correctionReason)]);
      });
      const firstIn=daySess.find(s=>s.in), lastOut=[...daySess].reverse().find(s=>s.out);
      attRows.push([day, rec.employee_name,
        firstIn?sheetClock(firstIn.in):"—", lastOut?sheetClock(lastOut.out):"—",
        daySec?sheetDuration(daySec):"—", daySess.length,
        issue?"확인필요":"정상", hasCorrected?"정정":"", [...new Set(daySess.map(s=>sheetCorrectionReason(s.correctionReason)).filter(Boolean))].join(" / ")]);
    }
  }
  // 급여 (마감 전 예상; 마감 후엔 Edge Function이 snapshot으로 대체)
  const payRows=[];
  for(const rec of R.rows){
    if(!rec.pay){ payRows.push([rec.employee_name, sheetDuration(rec.sec), sheetDuration(rec.nightMinutes*60), "미설정","—","—",rec.breakMode==="IGNORED"?"미고려":rec.breakTimeProvided?"제공":"미제공",rec.breakNotProvidedCount,rec.breakCompensateCount,"—","—","—","시급 설정 필요"]); continue; }
    const p=rec.pay;
    payRows.push([rec.employee_name, sheetDuration(rec.sec), sheetDuration(rec.nightMinutes*60), won(p.wage), won(p.base),
      won(p.juhyu), rec.breakMode==="IGNORED"?"미고려":rec.breakTimeProvided?"제공":"미제공", rec.breakNotProvidedCount, rec.breakCompensateCount, won(p.breakCompPay||0), won(p.adjust), won(p.gross), "예상"]);
  }
  // Google Sheet is a human-facing report. Avoid duplicating the same one-session day in a second table.
  // If a day contains multiple sessions, expand only that day into individual session rows.
  const sessionCount=new Map();
  for(const r of sessRows){const k=r[0]+"|"+r[1];sessionCount.set(k,(sessionCount.get(k)||0)+1);}
  const humanAttendance=[];
  for(const r of attRows){
    const k=r[0]+"|"+r[1];
    if((sessionCount.get(k)||0)<=1) humanAttendance.push([r[0],r[1],r[2],r[3],r[4],r[6],r[7],r[8]]);
    else for(const s of sessRows.filter(x=>x[0]===r[0]&&x[1]===r[1])) humanAttendance.push([s[0],s[1],s[3],s[4],s[5],s[6],s[7],s[8]]);
  }
  // Preserve the authoritative calculation: these are reporting columns, not a new pay policy.
  const humanPayroll=payRows.map((r,i)=>{
    const rec=R.rows[i];
    const base=rec.pay?.payrollType==="MONTHLY"?won(rec.pay.monthlySalary):r[4];
    return [r[0],r[1],r[2],r[3],base,r[5],r[6],
      sheetDuration(rec.breakDeductSeconds||0),
      rec.breakMode==="IGNORED"?"미고려":rec.breakTimeProvided?"제공":"미제공",
      r[9],r[10],r[11],r[12],sheetDuration((rec.breakBonusMinutes||0)*60),sheetDuration(Math.max(0,rec.sec-(rec.breakDeductSeconds||0))+(rec.breakBonusMinutes||0)*60),rec.pay?.nightAllowanceLabel||"미적용",won(rec.pay?.nightAllowance||0)];
  });
  // Senior workbook: show the source-backed break setting and 22:00-06:00 overlap
  // in the attendance table. These are reporting fields only; never invent a
  // paid-hours or break-compensation policy from the workbook examples.
  function nightSeconds(start,end){
    if(!(start instanceof Date)||!(end instanceof Date)||end<=start)return 0;
    let total=0;
    const cursor=new Date(start.getFullYear(),start.getMonth(),start.getDate()-1);
    for(let d=0;d<40&&cursor<end;d++,cursor.setDate(cursor.getDate()+1)){
      const from=new Date(cursor);from.setHours(22,0,0,0);
      const until=new Date(cursor);until.setDate(until.getDate()+1);until.setHours(6,0,0,0);
      total+=Math.max(0,Math.min(end.getTime(),until.getTime())-Math.max(start.getTime(),from.getTime()))/1000;
    }
    return total;
  }
  // The sheet must receive payable time from the same completed sessions used by payroll.
  // Never re-derive it from the rounded human-readable '실근무' column in Apps Script.
  function payableSeconds(shift,mode){
    const provided=mode==='PROVIDED';
    const ignored=mode==='IGNORED';
    if(shift.status!=="COMPLETE")return 0;
    const sec=Math.max(0,Number(shift.sec||0));
    const deduct=provided?Math.min(1800,Math.max(0,sec-14400))+Math.min(1800,Math.max(0,sec-30600)):0;
    const bonus=(provided||ignored)?0:(sec>=28800?3600:sec>14400?1800:0);
    return Math.max(0,sec-deduct)+bonus;
  }
  const detailLookup=new Map();
  for(const rec of R.rows){
    const days=new Map();
    for(const session of rec.sessions){
      const anchor=session.in||session.out;if(!anchor)continue;
      const day=dstr(anchor),items=days.get(day)||[];items.push(session);days.set(day,items);
    }
    for(const [day,items] of days){
      const complete=items.filter(x=>x.status==="COMPLETE");
      const night=complete.reduce((n,x)=>n+nightSeconds(x.in,x.out),0);
      detailLookup.set(day+"|"+rec.employee_name,{night:sheetDuration(night),breakSetting:rec.breakMode==="IGNORED"?"미고려":rec.breakTimeProvided?"제공":"미제공",
        payable:sheetDuration(complete.reduce((n,x)=>n+payableSeconds(x,rec.breakMode),0)),sessions:items.map(x=>sheetDuration(x.status==="COMPLETE"?nightSeconds(x.in,x.out):0)),payableSessions:items.map(x=>sheetDuration(payableSeconds(x,rec.breakMode)))});
    }
  }
  const detailIndexes=new Map();
  const detailedAttendance=humanAttendance.map(row=>{
    const key=row[0]+"|"+row[1],detail=detailLookup.get(key);
    const multi=(sessionCount.get(key)||0)>1;
    const idx=detailIndexes.get(key)||0;detailIndexes.set(key,idx+1);
    const night=multi?detail?.sessions?.[idx]:detail?.night;
    return [...row,night||"00:00",detail?.breakSetting||"—",multi?detail?.payableSessions?.[idx]||"0:00":detail?.payable||"0:00"];
  });
  return {
    store_key:String(CURRENT_STORE_ID||1),
    store_name:STORE_NAME_BY_ID.get(Number(CURRENT_STORE_ID))||CONFIG.STORE_NAME,
    attendance:{ header:["날짜","직원명","출근","퇴근","실근무","상태","정정","정정사유","야간근무","휴게 제공 여부","급여산정시간"], rows:detailedAttendance },
    sessions:{ header:[], rows:[] },
    payroll:{ header:["직원명","총근무","야간근무","시급","기본급","주휴","휴게","휴게 기준시간(참고)","휴게 제공 여부","휴게수당","조정","예상 세전급여","상태","휴게 미제공 가산시간","가산 포함 급여산정시간","야근수당적용여부","야근수당"], rows:humanPayroll },
  };
}
  function hhmmBusiness(value,anchor){
  const d=value instanceof Date?value:fromIso(value),a=anchor instanceof Date?anchor:fromIso(anchor);
  if(!Number.isFinite(d.getTime())||!Number.isFinite(a.getTime()))return "—";
  const dm=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const am=new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const dayOffset=Math.max(0,Math.round((dm-am)/86400000));
  return `${String(d.getHours()+dayOffset*24).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
  const p2=n=>String(n).padStart(2,'0');
  const dayKey=d=>d?`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`:'';
  const monthBounds=ym=>{const [y,m]=String(ym).split('-').map(Number);return {first:`${ym}-01`,last:`${y}-${p2(m)}-${p2(new Date(y,m,0).getDate())}`}};
  const overlaps=(c,b)=>String(c.effective_from)<=b.last&&(!c.effective_to||String(c.effective_to)>=b.first);
  const covers=(c,d)=>d&&String(c.effective_from)<=d&&(!c.effective_to||String(c.effective_to)>=d);
  const termsKey=c=>[c.payroll_type,c.hourly_wage,c.monthly_salary,c.weekly_contracted_minutes,c.tax_treatment,c.business_deduction_rate,c.night_allowance_enabled,c.night_allowance_mode,c.night_allowance_value,c.night_allowance_start,c.night_allowance_end].join('|');
  function chooseContract(row,ym,b){const contracts=(b.contracts||[]).filter(c=>overlaps(c,monthBounds(ym))).sort((a,z)=>String(z.effective_from).localeCompare(String(a.effective_from)));if(!contracts.length)return {mode:'MISSING_CONTRACT',issue:'계약조건 미등록 · 급여 계산 보류'};const payable=(row.sessions||[]).filter(s=>(s.status==='COMPLETE'||s.status==='WORKING')&&s.in);const used=contracts.filter(c=>payable.some(s=>covers(c,dayKey(s.in))));const candidates=used.length?used:contracts;const displayContract=candidates[0]||contracts[0]||null;if(candidates.some(c=>c.tax_treatment==='FOUR_INSURANCE'))return {mode:'BLOCKED',contract:displayContract,issue:'4대보험 공제 계산정책 미확정'};if(candidates.some(c=>c.payroll_type==='MONTHLY')){if(candidates.some(c=>c.payroll_type!=='MONTHLY'))return {mode:'BLOCKED',contract:displayContract,issue:'월중 급여유형 변경 · 구간별 급여 계산 확인 필요'};const keys=new Set(candidates.map(termsKey));if(keys.size>1)return {mode:'BLOCKED',contract:displayContract,issue:'월중 계약조건 변경 · 구간별 급여 계산 확인 필요'};return {mode:'MONTHLY',contract:candidates[0]};}if(candidates.some(c=>c.payroll_type!=='HOURLY'||c.tax_treatment!=='BUSINESS_INCOME'))return {mode:'BLOCKED',contract:displayContract,issue:'급여 계약조건 확인 필요'};const uncoveredDays=[...new Set(payable.filter(s=>!contracts.some(c=>covers(c,dayKey(s.in)))).map(s=>dayKey(s.in)))];if(uncoveredDays.length)return {mode:'BLOCKED',contract:displayContract,issue:`계약기간 밖 실근무 ${uncoveredDays.join(', ')} · 급여 확인 필요`};const keys=new Set(candidates.map(termsKey));if(keys.size>1)return {mode:'BLOCKED',contract:displayContract,issue:'월중 계약조건 변경 · 구간별 급여 계산 확인 필요'};return {mode:'CONTRACT',contract:candidates[0]}}
  const nightMin=s=>{const m=/^([01]\d|2[0-3]):([0-5]\d)/.exec(String(s??''));return m?Number(m[1])*60+Number(m[2]):null};
  function nightOverlap(sessions,start,end){const sm=nightMin(start),em=nightMin(end);if(sm==null||em==null)return 0;let sec=0;for(const x of sessions||[]){if(!['COMPLETE','WORKING'].includes(x.status)||!x.in)continue;const out=x.out||kstNow();if(out<=x.in)continue;for(let d=new Date(x.in.getFullYear(),x.in.getMonth(),x.in.getDate()-1);d<=out;d.setDate(d.getDate()+1)){const a=new Date(d.getFullYear(),d.getMonth(),d.getDate(),Math.floor(sm/60),sm%60),b=new Date(d.getFullYear(),d.getMonth(),d.getDate()+(em<=sm?1:0),Math.floor(em/60),em%60),lo=Math.max(x.in,a),hi=Math.min(out,b);if(hi>lo)sec+=(hi-lo)/1000}}return sec}
  // The browser's loaded wrapper order is live-accrual -> contract authority -> night.
  const browserBase=computeMonthPayroll;
  computeMonthPayroll=async function(ym){
    const R=await browserBase(ym);
    const cur=`${nowWall.getFullYear()}-${p2(nowWall.getMonth()+1)}`;
    if(ym>=cur)R.weeks=Math.min(Number(R.weeks)||0,weeksInMonth(ym));
    let gross=0,net=0;
    for(const row of R.rows){
      if(!BE.employmentBundle)throw new Error("MISSING_CONTRACT_BUNDLE");
      const bundle=await BE.employmentBundle(row.employee_id);
      const pick=chooseContract(row,ym,bundle);
      row.contractMode=pick.mode;row.contractIssue=pick.issue||null;
      row.contract=pick.contract||null;
      if(pick.mode==="BLOCKED"||pick.mode==="MISSING_CONTRACT"){row.pay=null;row.hasWage=false}
      if(row.pay){gross+=row.pay.gross;net+=row.pay.net}
    }
    R.totalGross=gross;R.totalNet=net;
    gross=0;net=0;
    for(const row of R.rows){
      const c=row.contract,p=row.pay;
      if(p&&c?.night_allowance_enabled){
        const h=nightOverlap(row.sessions,c.night_allowance_start||'22:00',c.night_allowance_end||'06:00')/3600,v=Number(c.night_allowance_value||0);
        const add=c.night_allowance_mode==='FLAT'?Math.round(h*v):Math.round(h*Number(p.wage||0)*v/100);
        p.nightHours=h;p.night=add;p.gross+=add;p.net=xrounddown(p.gross*(1-p.rate),-1);
      }
      if(p){gross+=p.gross;net+=p.net}
    }
    R.totalGross=gross;R.totalNet=net;
    return R;
  };
  return {computeMonthPayroll,buildSheetSyncPayload,calcPayroll,applyCorrections,pairEvents,browserBasePayroll:browserBase};
}
